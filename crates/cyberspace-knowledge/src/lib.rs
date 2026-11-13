// Validates knowledge files against the catalogue in Meta/Agents/Knowledge: a Rust port of validate_knowledge.py.
use cyberspace_common::{dev_files, read_json, relative, resolve};
use jsonschema::{Registry, Validator};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

// The outcome of a run: how much was checked and every problem found, as "file: problem" lines.
#[derive(Debug, Default, serde::Serialize)]
pub struct Report {
    pub kinds: usize,
    pub checked: usize,
    pub problems: Vec<String>,
}

// A compiled schema per knowledge kind, with the schema file it came from.
pub struct Catalogue {
    dir: PathBuf,
    validators: BTreeMap<String, (PathBuf, Validator)>,
}

impl Catalogue {
    // Loads and compiles every schema in `<dir>/schemas`, resolving their $refs to one another by $id.
    pub fn load(dir: &Path) -> Result<Self, String> {
        let dir = dir
            .canonicalize()
            .map_err(|e| format!("{}: {e}", dir.display()))?;
        let mut schemas = BTreeMap::new();
        let entries = std::fs::read_dir(dir.join("schemas"))
            .map_err(|e| format!("{}/schemas: {e}", dir.display()))?;
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if let Some(kind) = name.strip_suffix(".schema.json") {
                schemas.insert(kind.to_owned(), (entry.path(), read_json(&entry.path())?));
            }
        }
        let resources = schemas.values().map(|(path, schema)| {
            let id = schema["$id"]
                .as_str()
                .map(str::to_owned)
                .unwrap_or_else(|| format!("file://{}", path.display()));
            (id, schema.clone())
        });
        let registry = Registry::new()
            .extend(resources)
            .and_then(|b| b.prepare())
            .map_err(|e| format!("Knowledge schemas: {e}"))?;
        let mut validators = BTreeMap::new();
        for (kind, (path, schema)) in &schemas {
            jsonschema::meta::validate(schema).map_err(|e| format!("{}: {e}", path.display()))?;
            if kind == "common" {
                continue;
            }
            let validator = jsonschema::options()
                .with_registry(&registry)
                .should_validate_formats(false)
                .build(schema)
                .map_err(|e| format!("{}: {e}", path.display()))?;
            validators.insert(kind.clone(), (path.clone(), validator));
        }
        Ok(Self { dir, validators })
    }

    // Whether `kind` is a knowledge kind.
    pub fn has(&self, kind: &str) -> bool {
        self.validators.contains_key(kind)
    }

    // The knowledge kinds, sorted.
    pub fn kinds(&self) -> impl Iterator<Item = &str> {
        self.validators.keys().map(String::as_str)
    }

    // Checks one document; with a root it also checks its name, folder and every path it names.
    pub fn check_document(
        &self,
        path: &Path,
        document: &Value,
        root: Option<&Path>,
    ) -> Vec<String> {
        let kind = document["kind"].as_str().unwrap_or_default();
        let Some((schema_path, validator)) = self.validators.get(kind) else {
            return vec![format!("Unknown knowledge kind: {kind}")];
        };
        let mut errors: Vec<String> = validator
            .iter_errors(document)
            .map(|e| {
                let at = e.instance_path().to_string();
                let at = at.trim_start_matches('/');
                format!("{}: {}", if at.is_empty() { "(document)" } else { at }, e)
            })
            .collect();
        if !errors.is_empty() {
            return errors;
        }
        let parent = path.parent().unwrap_or(Path::new("."));
        let ids: Vec<&str> = document["entities"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|e| e["id"].as_str())
            .collect();
        let duplicates: BTreeSet<&str> = ids
            .iter()
            .copied()
            .filter(|i| ids.iter().filter(|j| *j == i).count() > 1)
            .collect();
        errors.extend(
            duplicates
                .iter()
                .map(|i| format!("Duplicate entity id: {i}")),
        );
        if resolve(parent, document["$schema"].as_str().unwrap_or_default()) != *schema_path {
            errors.push(format!(
                "$schema should point at {}",
                schema_path.file_name().unwrap().to_string_lossy()
            ));
        }
        let Some(root) = root else { return errors };
        if path
            .file_name()
            .is_some_and(|n| n.to_string_lossy() != format!("{kind}.json"))
        {
            errors.push(format!("A {kind} file is named {kind}.json"));
        }
        let folder = parent.parent().unwrap_or(root);
        if resolve(root, document["folder"].as_str().unwrap_or_default()) != folder {
            errors.push(format!("folder should be {}", relative(root, folder)));
        }
        let mut found = Vec::new();
        paths_in(&document["entities"], &mut found);
        for (value, entity_id) in found {
            let target = resolve(root, &value);
            if Path::new(&value).is_absolute() || !target.starts_with(root) || !target.exists() {
                errors.push(format!("Missing or outside path: {value}"));
            } else if let Some(id) =
                entity_id.filter(|_| target.extension().is_some_and(|e| e == "json"))
            {
                let entities = read_json(&target).ok();
                let known = entities
                    .as_ref()
                    .and_then(|d| d["entities"].as_array())
                    .into_iter()
                    .flatten()
                    .any(|e| e["id"] == id);
                if !known {
                    errors.push(format!("No entity {id} in {value}"));
                }
            }
        }
        errors
    }

    // Checks every example in `<dir>/examples`, one per kind.
    pub fn check_examples(&self, report: &mut Report) {
        for kind in self.validators.keys() {
            let example = self.dir.join("examples").join(format!("{kind}.json"));
            let problems = match read_json(&example) {
                Err(_) if !example.exists() => vec!["Missing example".to_owned()],
                Err(e) => vec![e],
                Ok(doc) => self.check_document(&example, &doc, None),
            };
            report.problems.extend(
                problems
                    .into_iter()
                    .map(|p| format!("examples/{kind}.json: {p}")),
            );
        }
    }
}

// Every `path` an entity mentions, with the `entityId` beside it, in document order.
fn paths_in(value: &Value, out: &mut Vec<(String, Option<String>)>) {
    match value {
        Value::Object(map) => {
            if let Some(Value::String(path)) = map.get("path") {
                out.push((
                    path.clone(),
                    map.get("entityId")
                        .and_then(Value::as_str)
                        .map(str::to_owned),
                ));
            }
            map.values().for_each(|v| paths_in(v, out));
        }
        Value::Array(items) => items.iter().for_each(|v| paths_in(v, out)),
        _ => {}
    }
}

// Validates the catalogue's examples and every knowledge file under root.
pub fn validate(root: &Path, knowledge_dir: &Path) -> Result<Report, String> {
    let root = root
        .canonicalize()
        .map_err(|e| format!("{}: {e}", root.display()))?;
    let catalogue = Catalogue::load(knowledge_dir)?;
    let mut report = Report {
        kinds: catalogue.validators.len(),
        ..Report::default()
    };
    catalogue.check_examples(&mut report);
    for path in dev_files(&root, None) {
        let document = match read_json(&path) {
            Ok(d) => d,
            Err(e) => {
                report
                    .problems
                    .push(format!("{}: {e}", relative(&root, &path)));
                continue;
            }
        };
        if !document["kind"].as_str().is_some_and(|k| catalogue.has(k)) {
            continue;
        }
        report.checked += 1;
        for problem in catalogue.check_document(&path, &document, Some(&root)) {
            report
                .problems
                .push(format!("{}: {problem}", relative(&root, &path)));
        }
    }
    Ok(report)
}
