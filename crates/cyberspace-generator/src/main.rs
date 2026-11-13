// cyberspace-generator: checks and maintains a repository's .dev files, the views and knowledge the cyberspace explorer shows.
use clap::{Parser, Subcommand};
use cyberspace_common::{dev_files, read_json, relative};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};

/// Check and maintain the .dev files that cyberspace-explorer.com shows.
#[derive(Parser)]
#[command(version, about)]
struct Cli {
    #[command(subcommand)]
    command: Cmd,
}

// The subcommands.
#[derive(Subcommand)]
enum Cmd {
    /// Validate every diagram, view, knowledge file and actor (both former Python validators).
    Validate {
        /// Repository root.
        #[arg(default_value = ".")]
        root: PathBuf,
        /// Folder holding Skills/ and Knowledge/; defaults to <root>/Meta/Agents.
        #[arg(long)]
        meta: Option<PathBuf>,
        /// Print a JSON report.
        #[arg(long)]
        json: bool,
    },
    /// List each folder's .dev files by kind, and folders whose .dev lacks a folder.json.
    Scan {
        /// Repository root.
        #[arg(default_value = ".")]
        root: PathBuf,
        /// Print JSON.
        #[arg(long)]
        json: bool,
    },
    /// List the .dev files that cite files changed since a git revision and were not themselves changed.
    Stale {
        /// The git revision to compare the working tree with.
        #[arg(default_value = "origin/main")]
        base: String,
        /// Repository root.
        #[arg(long, default_value = ".")]
        root: PathBuf,
        /// Print JSON.
        #[arg(long)]
        json: bool,
    },
}

// Runs the chosen subcommand and turns its outcome into an exit code.
fn main() -> ExitCode {
    let result = match Cli::parse().command {
        Cmd::Validate { root, meta, json } => validate(&root, meta, json),
        Cmd::Scan { root, json } => scan(&root, json),
        Cmd::Stale { base, root, json } => stale(&root, &base, json),
    };
    match result {
        Ok(true) => ExitCode::SUCCESS,
        Ok(false) => ExitCode::FAILURE,
        Err(e) => {
            eprintln!("cyberspace-generator: {e}");
            ExitCode::from(2)
        }
    }
}

// Runs both validators; true when nothing is wrong.
fn validate(root: &Path, meta: Option<PathBuf>, as_json: bool) -> Result<bool, String> {
    let meta = meta.unwrap_or_else(|| root.join("Meta/Agents"));
    let diagrams = cyberspace_diagrams::validate(root, &meta.join("Skills"))?;
    let knowledge = cyberspace_knowledge::validate(root, &meta.join("Knowledge"))?;
    let ok = diagrams.problems.is_empty() && knowledge.problems.is_empty();
    if as_json {
        println!(
            "{}",
            json!({ "ok": ok, "diagrams": diagrams, "knowledge": knowledge })
        );
        return Ok(ok);
    }
    for problem in diagrams.problems.iter().chain(&knowledge.problems) {
        println!("{problem}");
    }
    let counts: Vec<String> = diagrams
        .counts
        .iter()
        .map(|(k, n)| format!("{n} {k}"))
        .collect();
    println!(
        "Diagrams: {} schemas and examples; {}; {} actors.",
        diagrams.schemas,
        counts.join(", "),
        diagrams.actors
    );
    println!(
        "Knowledge: {} kinds, {} files checked.",
        knowledge.kinds, knowledge.checked
    );
    println!(
        "{} problems",
        diagrams.problems.len() + knowledge.problems.len()
    );
    Ok(ok)
}

// Lists each .dev folder's files by kind; false when a .dev folder has no folder.json.
fn scan(root: &Path, as_json: bool) -> Result<bool, String> {
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let mut folders: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for path in dev_files(&root, None) {
        let kind = read_json(&path)
            .ok()
            .and_then(|d| d["kind"].as_str().map(str::to_owned))
            .unwrap_or_else(|| "?".into());
        folders
            .entry(relative(&root, path.parent().unwrap().parent().unwrap()))
            .or_default()
            .insert(kind);
    }
    let missing: Vec<&String> = folders
        .iter()
        .filter(|(_, k)| !k.contains("folder"))
        .map(|(f, _)| f)
        .collect();
    if as_json {
        println!(
            "{}",
            json!({ "folders": folders, "missingFolderFile": missing })
        );
    } else {
        for (folder, kinds) in &folders {
            println!(
                "{folder}: {}",
                kinds.iter().cloned().collect::<Vec<_>>().join(", ")
            );
        }
        for folder in &missing {
            println!("{folder}: no folder.json");
        }
        println!(
            "{} folders, {} without folder.json",
            folders.len(),
            missing.len()
        );
    }
    Ok(missing.is_empty())
}

// Collects every string under a `path`, `source`, `folder` or `sources` key: the files a .dev file cites.
fn cited(value: &Value, out: &mut BTreeSet<String>) {
    match value {
        Value::Object(map) => {
            for (key, v) in map {
                match (key.as_str(), v) {
                    ("path" | "source" | "actor" | "actorDocument", Value::String(s)) => {
                        out.insert(s.clone());
                    }
                    ("sources", Value::Array(items)) => {
                        out.extend(items.iter().filter_map(Value::as_str).map(str::to_owned));
                    }
                    _ => {}
                }
                cited(v, out);
            }
        }
        Value::Array(items) => items.iter().for_each(|v| cited(v, out)),
        _ => {}
    }
}

// Lists stale .dev files; false when any are found.
fn stale(root: &Path, base: &str, as_json: bool) -> Result<bool, String> {
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let output = Command::new("git")
        .arg("-C")
        .arg(&root)
        .args(["diff", "--name-only", base, "--"])
        .output()
        .map_err(|e| format!("git: {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
    }
    let prefix = Command::new("git")
        .arg("-C")
        .arg(&root)
        .args(["rev-parse", "--show-prefix"])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_owned())
        .unwrap_or_default();
    let changed: BTreeSet<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|l| l.strip_prefix(prefix.as_str()))
        .map(str::to_owned)
        .collect();
    let mut found: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for path in dev_files(&root, None) {
        let rel = relative(&root, &path);
        if changed.contains(&rel) {
            continue;
        }
        let Ok(document) = read_json(&path) else {
            continue;
        };
        let mut refs = BTreeSet::new();
        cited(&document, &mut refs);
        let hits: Vec<String> = refs.into_iter().filter(|r| changed.contains(r)).collect();
        if !hits.is_empty() {
            found.insert(rel, hits);
        }
    }
    if as_json {
        println!("{}", json!({ "base": base, "stale": found }));
    } else {
        for (file, hits) in &found {
            println!("{file}: cites changed {}", hits.join(", "));
        }
        println!("{} .dev files may be stale since {base}", found.len());
    }
    Ok(found.is_empty())
}
