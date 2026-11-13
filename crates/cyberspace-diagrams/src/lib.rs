// Validates diagrams, behavior views and actor files against the skills in Meta/Agents/Skills: a Rust port of validate_diagrams.py.
use cyberspace_common::{read_json, relative, repo_path, resolve, walk};
use jsonschema::Validator;
use regex::Regex;
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};

// The four diagram kinds.
pub const KINDS: &[&str] = &["component", "class", "state", "deployment"];
// The five behavior view kinds.
pub const BEHAVIOR_KINDS: &[&str] = &[
    "use-case",
    "user-journey",
    "capability",
    "feature",
    "operation",
];
// The folder at the repository root that holds actor files.
pub const ACTORS_DIR: &str = "Actors";

// The outcome of a run: files checked per kind, actor files, and every problem as "file: problem" lines.
#[derive(Debug, Default, serde::Serialize)]
pub struct Report {
    pub schemas: usize,
    pub counts: BTreeMap<String, usize>,
    pub actors: usize,
    pub problems: Vec<String>,
}

// The skill folder that holds a kind's schema and example.
pub fn skill_folder(kind: &str) -> String {
    if KINDS.contains(&kind) {
        format!("describe-{kind}-diagram")
    } else {
        format!("describe-{kind}")
    }
}

// Fails with `message` unless `condition` holds.
fn require(condition: bool, message: impl Into<String>) -> Result<(), String> {
    if condition {
        Ok(())
    } else {
        Err(message.into())
    }
}

// Reads a string field, or "" when absent.
fn s<'a>(value: &'a Value, key: &str) -> &'a str {
    value[key].as_str().unwrap_or_default()
}

// Reads an array field, or an empty slice when absent.
fn list<'a>(value: &'a Value, key: &str) -> &'a [Value] {
    value[key].as_array().map(Vec::as_slice).unwrap_or_default()
}

// Checks IDs are unique and every edge, initial state, alternative and artifact points at a known ID.
pub fn check_graph(document: &Value) -> Result<(), String> {
    let kind = s(document, "kind");
    let collection = match kind {
        "component" => "components",
        "class" => "types",
        "state" => "states",
        "deployment" => "nodes",
        _ => "entities",
    };
    let ids: Vec<&str> = list(document, collection)
        .iter()
        .map(|i| s(i, "id"))
        .collect();
    require(
        ids.len() == ids.iter().collect::<HashSet<_>>().len(),
        format!("Duplicate IDs in {collection}"),
    )?;
    let edges = if document.get("relationships").is_some() {
        list(document, "relationships")
    } else {
        list(document, "transitions")
    };
    for edge in edges {
        require(
            ids.contains(&s(edge, "from")),
            format!("Unknown source: {}", s(edge, "from")),
        )?;
        require(
            ids.contains(&s(edge, "to")),
            format!("Unknown target: {}", s(edge, "to")),
        )?;
    }
    if kind == "state" {
        require(
            ids.contains(&s(document, "initialState")),
            "Unknown initial state",
        )?;
    }
    for entity in list(document, "entities") {
        for steps_key in ["flow", "stages"] {
            let steps: Vec<&str> = list(entity, steps_key).iter().map(|x| s(x, "id")).collect();
            require(
                steps.len() == steps.iter().collect::<HashSet<_>>().len(),
                format!("Duplicate {steps_key} IDs in {}", s(entity, "id")),
            )?;
        }
        let flow: Vec<&str> = list(entity, "flow").iter().map(|x| s(x, "id")).collect();
        for alternative in list(entity, "alternatives") {
            require(
                flow.contains(&s(alternative, "atStep")),
                format!("Unknown step: {}", s(alternative, "atStep")),
            )?;
        }
    }
    if kind == "deployment" {
        let artifacts = list(document, "artifacts");
        let artifact_ids: Vec<&str> = artifacts.iter().map(|a| s(a, "id")).collect();
        require(
            artifact_ids.len() == artifact_ids.iter().collect::<HashSet<_>>().len(),
            "Duplicate artifact IDs",
        )?;
        for artifact in artifacts {
            require(
                ids.contains(&s(artifact, "deployedTo")),
                "Unknown deployment target",
            )?;
        }
    }
    Ok(())
}

// Checks one `actor` field or link and returns the actor file it names.
fn actor_reference(root: &Path, value: &str) -> Result<PathBuf, String> {
    require(
        value.split('/').next() == Some(ACTORS_DIR) && value.contains('/'),
        format!("Actor reference is not under {ACTORS_DIR}/: {value}"),
    )?;
    require(
        value.ends_with(".md"),
        format!("Actor reference is not a Markdown file: {value}"),
    )?;
    let target = repo_path(root, value)?;
    require(target.is_file(), format!("Actor is not a file: {value}"))?;
    Ok(target)
}

// Checks that every source a behavior view cites is a file and every actorDocument is an actor file.
fn check_behavior_references(
    root: &Path,
    value: &Value,
    actors: &mut HashSet<PathBuf>,
) -> Result<(), String> {
    match value {
        Value::Object(map) => {
            if let (Some(Value::String(path)), true) = (map.get("path"), map.contains_key("symbol"))
            {
                require(
                    repo_path(root, path)?.is_file(),
                    format!("Source is not a file: {path}"),
                )?;
            }
            if let Some(doc) = map.get("actorDocument") {
                actors.insert(actor_reference(root, doc.as_str().unwrap_or_default())?);
            }
            map.values()
                .try_for_each(|v| check_behavior_references(root, v, actors))
        }
        Value::Array(items) => items
            .iter()
            .try_for_each(|v| check_behavior_references(root, v, actors)),
        _ => Ok(()),
    }
}

// The compiled schema of every diagram and behavior kind, each checked against its example.
pub struct Skills {
    dir: PathBuf,
    validators: BTreeMap<&'static str, Validator>,
}

impl Skills {
    // Loads each kind's schema, checks it, and validates the kind's example with it.
    pub fn load(dir: &Path) -> Result<Self, String> {
        let dir = dir
            .canonicalize()
            .map_err(|e| format!("{}: {e}", dir.display()))?;
        let mut validators = BTreeMap::new();
        for &kind in KINDS.iter().chain(BEHAVIOR_KINDS) {
            let folder = dir.join(skill_folder(kind));
            let at = |e: String| format!("{}: {e}", skill_folder(kind));
            let schema = read_json(&folder.join("schema.json")).map_err(at)?;
            jsonschema::meta::validate(&schema).map_err(|e| at(e.to_string()))?;
            let validator = jsonschema::options()
                .should_validate_formats(false)
                .build(&schema)
                .map_err(|e| at(e.to_string()))?;
            let example = read_json(&folder.join("example.json")).map_err(at)?;
            if let Some(e) = validator.iter_errors(&example).next() {
                return Err(at(format!("example.json: {e}")));
            }
            check_graph(&example).map_err(at)?;
            require(
                resolve(&folder, s(&example, "$schema")) == folder.join("schema.json"),
                "Example references the wrong schema",
            )
            .map_err(at)?;
            validators.insert(kind, validator);
        }
        Ok(Self { dir, validators })
    }

    // Checks one diagram or view; returns its kind, or None for a knowledge file this validator leaves alone.
    fn check_file(
        &self,
        root: &Path,
        path: &Path,
        actors: &mut HashSet<PathBuf>,
    ) -> Result<Option<String>, String> {
        let document = read_json(path)?;
        let kind = s(&document, "kind");
        let knowledge = self
            .dir
            .parent()
            .unwrap_or(&self.dir)
            .join("Knowledge")
            .join("schemas");
        let Some((&kind, validator)) = self.validators.get_key_value(kind) else {
            if knowledge.join(format!("{kind}.schema.json")).exists() {
                return Ok(None);
            }
            return Err(format!("Unknown diagram kind: {kind}"));
        };
        if let Some(e) = validator.iter_errors(&document).next() {
            return Err(e.to_string());
        }
        check_graph(&document)?;
        let parent = path.parent().unwrap();
        let expected_schema = self.dir.join(skill_folder(kind)).join("schema.json");
        require(
            resolve(parent, s(&document, "$schema")) == expected_schema,
            "Diagram references the wrong schema",
        )?;
        require(
            repo_path(root, s(&document, "folder"))? == parent.parent().unwrap(),
            "Folder does not match diagram location",
        )?;
        let name = path.file_name().unwrap().to_string_lossy();
        let expected_name = if KINDS.contains(&kind) {
            format!("{kind}-diagram.json")
        } else {
            format!("{kind}.json")
        };
        require(
            if kind == "state" {
                name.ends_with(".state-diagram.json")
            } else {
                name == expected_name
            },
            "Unexpected diagram filename",
        )?;
        for source in list(&document, "sources") {
            require(
                repo_path(root, s(source, "path"))?.is_file(),
                format!("Source is not a file: {}", s(source, "path")),
            )?;
        }
        for item in list(&document, "types") {
            for source in list(item, "sources") {
                let source = source.as_str().unwrap_or_default();
                require(
                    repo_path(root, source)?.is_file(),
                    format!("Type source is not a file: {source}"),
                )?;
            }
        }
        for item in list(&document, "components")
            .iter()
            .chain(list(&document, "nodes"))
        {
            if let Some(actor) = item.get("actor") {
                actors.insert(actor_reference(root, actor.as_str().unwrap_or_default())?);
            }
        }
        for component in list(&document, "components") {
            if let Some(folder) = component["folder"].as_str() {
                require(
                    repo_path(root, folder)?.is_dir(),
                    format!("Component folder is not a directory: {folder}"),
                )?;
            }
            if let Some(diagram) = component["diagram"].as_str() {
                let target = read_json(&repo_path(root, diagram)?)?;
                require(
                    s(&target, "kind") == "component" && target["folder"] == component["folder"],
                    "Component reference describes a different folder or diagram kind",
                )?;
            }
        }
        if BEHAVIOR_KINDS.contains(&kind) {
            check_behavior_references(root, &document["entities"], actors)?;
        }
        for related in list(&document, "relatedViews") {
            let target_path = repo_path(root, s(related, "path"))?;
            let target = read_json(&target_path)?;
            require(
                target["kind"] == related["kind"] && target["folder"] == related["folder"],
                format!(
                    "Related view describes a different folder or kind: {}",
                    s(related, "path")
                ),
            )?;
            require(
                repo_path(root, s(related, "folder"))?
                    == target_path.parent().unwrap().parent().unwrap(),
                format!(
                    "Related view's folder does not match its location: {}",
                    s(related, "path")
                ),
            )?;
        }
        for artifact in list(&document, "artifacts") {
            require(
                repo_path(root, s(artifact, "source"))?.is_file(),
                format!("Artifact source is not a file: {}", s(artifact, "source")),
            )?;
        }
        Ok(Some(kind.to_owned()))
    }
}

// A Markdown link to an actor: inline, [text](../Actors/name.md#part "title"), or a reference definition, [label]: Actors/name.md.
const ACTOR_LINK: &str = r#"(?m)\]\(\s*<?(?:\.{1,2}/|/)*(Actors/[A-Za-z0-9._-]+\.md)(?:#[^\s)>]*)?>?(?:\s+["'(][^)]*)?\)|^\s{0,3}\[[^\]]+\]:\s*<?(?:\.{1,2}/|/)*(Actors/[A-Za-z0-9._-]+\.md)"#;

// Removes fenced code blocks and inline code spans, so a path written as code is not a link.
pub fn strip_code(text: &str) -> String {
    let lines: Vec<&str> = text.split('\n').collect();
    let mut kept = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        let fence = ["```", "~~~"].into_iter().find(|f| lines[i].starts_with(f));
        let close = fence.and_then(|f| (i + 1..lines.len()).find(|&j| lines[j].starts_with(f)));
        match close {
            Some(j) => {
                kept.push("");
                i = j + 1;
            }
            None => {
                kept.push(lines[i]);
                i += 1;
            }
        }
    }
    let span = Regex::new(r"`[^`\n]+`").unwrap();
    span.replace_all(&kept.join("\n"), "").into_owned()
}

// Checks that every actor file is linked from some other file and every link lands on a file.
fn check_actors(
    root: &Path,
    skills: &Path,
    mut referenced: HashSet<PathBuf>,
    problems: &mut Vec<String>,
) -> usize {
    let actors_dir = root.join(ACTORS_DIR);
    if !actors_dir.is_dir() {
        if !referenced.is_empty() {
            problems.push(format!(
                "Diagrams name actors but there is no {ACTORS_DIR}/ folder"
            ));
        }
        return 0;
    }
    let mut actors: Vec<PathBuf> = std::fs::read_dir(&actors_dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file() && p.file_name().is_some_and(|n| n != "README.md"))
        .collect();
    actors.sort();
    for actor in &actors {
        if actor.extension().is_none_or(|e| e != "md") {
            problems.push(format!(
                "{ACTORS_DIR}/{}: not a Markdown file",
                actor.file_name().unwrap().to_string_lossy()
            ));
        }
    }
    let link = Regex::new(ACTOR_LINK).unwrap();
    for (dir, files) in walk(root, Some(skills)) {
        for file in files.iter().filter(|f| f.ends_with(".md")) {
            let path = dir.join(file);
            let text = strip_code(&std::fs::read_to_string(&path).unwrap_or_default());
            let links: std::collections::BTreeSet<&str> = link
                .captures_iter(&text)
                .filter_map(|c| c.get(1).or_else(|| c.get(2)))
                .map(|m| m.as_str())
                .collect();
            for found in links {
                match actor_reference(root, found) {
                    Ok(target) if Some(&target) != path.canonicalize().ok().as_ref() => {
                        referenced.insert(target);
                    }
                    Ok(_) => {}
                    Err(e) => problems.push(format!("{}: {e}", relative(root, &path))),
                }
            }
        }
    }
    for actor in &actors {
        if !actor.canonicalize().is_ok_and(|a| referenced.contains(&a)) {
            problems.push(format!(
                "{ACTORS_DIR}/{}: nothing links to this actor; delete it or link it",
                actor.file_name().unwrap().to_string_lossy()
            ));
        }
    }
    actors.len()
}

// Validates the skills' schemas and examples, every diagram and view under root, and the actor files.
pub fn validate(root: &Path, skills_dir: &Path) -> Result<Report, String> {
    let root = root
        .canonicalize()
        .map_err(|e| format!("{}: {e}", root.display()))?;
    let skills = Skills::load(skills_dir)?;
    let mut report = Report {
        schemas: skills.validators.len(),
        ..Report::default()
    };
    let mut actors = HashSet::new();
    for path in cyberspace_common::dev_files(&root, Some(&skills.dir)) {
        match skills.check_file(&root, &path, &mut actors) {
            Ok(Some(kind)) => *report.counts.entry(kind).or_default() += 1,
            Ok(None) => {}
            Err(e) => report
                .problems
                .push(format!("{}: {e}", relative(&root, &path))),
        }
    }
    if report.counts.is_empty() && report.problems.is_empty() {
        report.problems.push("No diagrams found".into());
    }
    report.actors = check_actors(&root, &skills.dir, actors, &mut report.problems);
    Ok(report)
}
