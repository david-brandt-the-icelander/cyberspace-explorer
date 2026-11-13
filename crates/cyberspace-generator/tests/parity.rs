// Breaks a copy of this repository in known ways and checks that cyberspace-generator and, when installed, the Python validators both report it.
use std::path::{Path, PathBuf};
use std::process::Command;

// The repository root this crate lives in.
fn repo() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}

// Copies a directory tree, leaving out git data and build output.
fn copy(from: &Path, to: &Path) {
    std::fs::create_dir_all(to).unwrap();
    for entry in std::fs::read_dir(from).unwrap().flatten() {
        let name = entry.file_name();
        if [".git", "target", "node_modules"]
            .iter()
            .any(|n| name == *n)
        {
            continue;
        }
        let (src, dst) = (entry.path(), to.join(&name));
        if entry.file_type().unwrap().is_dir() {
            copy(&src, &dst)
        } else {
            std::fs::copy(&src, &dst).unwrap();
        }
    }
}

// A fresh copy of the repository in a temporary folder named after the case.
fn fixture(case: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "cyberspace-generator-parity-{}-{case}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&dir);
    copy(&repo(), &dir);
    dir
}

// Replaces the first `from` in a file with `to`.
fn edit(root: &Path, file: &str, from: &str, to: &str) {
    let path = root.join(file);
    let text = std::fs::read_to_string(&path).unwrap();
    assert!(text.contains(from), "{file} lacks {from}");
    std::fs::write(&path, text.replacen(from, to, 1)).unwrap();
}

// Runs cyberspace-generator validate and returns (succeeded, output).
fn rust(root: &Path) -> (bool, String) {
    let out = Command::new(env!("CARGO_BIN_EXE_cyberspace-generator"))
        .arg("validate")
        .arg(root)
        .output()
        .unwrap();
    (
        out.status.success(),
        String::from_utf8_lossy(&out.stdout).into_owned(),
    )
}

// Runs both Python validators and returns their combined output, or None without python3, jsonschema and referencing.
fn python(root: &Path) -> Option<String> {
    let has = Command::new("python3")
        .args(["-c", "import jsonschema, referencing"])
        .output()
        .ok()?
        .status
        .success();
    if !has {
        return None;
    }
    let mut text = String::new();
    for script in [
        "Meta/Agents/Skills/validate_diagrams.py",
        "Meta/Agents/Knowledge/validate_knowledge.py",
    ] {
        let out = Command::new("python3")
            .arg(root.join(script))
            .arg(root)
            .output()
            .unwrap();
        text += &String::from_utf8_lossy(&out.stdout);
        text += &String::from_utf8_lossy(&out.stderr);
    }
    Some(text)
}

// Breaks a fixture with `edits` and checks both implementations report `expected`.
fn case(name: &str, edits: &[(&str, &str, &str)], expected: &str) {
    let root = fixture(name);
    for (file, from, to) in edits {
        edit(&root, file, from, to);
    }
    let (ok, out) = rust(&root);
    assert!(!ok && out.contains(expected), "{name}: Rust said\n{out}");
    if let Some(py) = python(&root) {
        assert!(py.contains(expected), "{name}: Python said\n{py}");
    }
    std::fs::remove_dir_all(&root).unwrap();
}

// The repository as it stands passes both.
#[test]
fn clean_repository_passes() {
    let (ok, out) = rust(&repo());
    assert!(ok, "{out}");
}

// A repeated key is refused.
#[test]
fn duplicate_key() {
    case(
        "dup",
        &[(
            ".dev/component-diagram.json",
            r#""kind": "component","#,
            r#""kind": "component", "kind": "component","#,
        )],
        "Duplicate JSON key: kind",
    );
}

// A relationship to an unknown component.
#[test]
fn unknown_target() {
    case(
        "edge",
        &[(
            ".dev/component-diagram.json",
            r#""to": "bar""#,
            r#""to": "nowhere""#,
        )],
        "Unknown target: nowhere",
    );
}

// A knowledge file pointing at the wrong schema.
#[test]
fn wrong_knowledge_schema() {
    case(
        "schema",
        &[(
            ".dev/backlog.json",
            "backlog.schema.json",
            "vision.schema.json",
        )],
        "$schema should point at backlog.schema.json",
    );
}

// A knowledge file naming a path that does not exist.
#[test]
fn missing_knowledge_path() {
    case(
        "path",
        &[(
            ".dev/backlog.json",
            r#""path": ".dev/requirements.json""#,
            r#""path": ".dev/nope.json""#,
        )],
        "Missing or outside path: .dev/nope.json",
    );
}

// An actor nothing links to.
#[test]
fn orphan_actor() {
    let root = fixture("actor");
    std::fs::write(root.join("Actors/ghost.md"), "# Ghost\n").unwrap();
    let expected = "Actors/ghost.md: nothing links to this actor";
    let (ok, out) = rust(&root);
    assert!(!ok && out.contains(expected), "{out}");
    if let Some(py) = python(&root) {
        assert!(py.contains(expected), "{py}");
    }
    std::fs::remove_dir_all(&root).unwrap();
}

// An actor named only inside code is not linked, so it is reported as an orphan; a reference definition links it.
#[test]
fn actor_links_follow_markdown() {
    let root = fixture("links");
    std::fs::write(root.join("Actors/ghost.md"), "# Ghost\n").unwrap();
    std::fs::write(
        root.join("NOTES.md"),
        "Code: `Actors/ghost.md`\n\n```\n[x](Actors/ghost.md)\n```\n",
    )
    .unwrap();
    let expected = "Actors/ghost.md: nothing links to this actor";
    let (ok, out) = rust(&root);
    assert!(!ok && out.contains(expected), "{out}");
    if let Some(py) = python(&root) {
        assert!(py.contains(expected), "{py}");
    }
    std::fs::write(
        root.join("NOTES.md"),
        "See [the ghost].\n\n[the ghost]: ./Actors/ghost.md\n",
    )
    .unwrap();
    let (ok, out) = rust(&root);
    assert!(ok, "{out}");
    if let Some(py) = python(&root) {
        assert!(!py.contains("nothing links"), "{py}");
    }
    std::fs::remove_dir_all(&root).unwrap();
}
