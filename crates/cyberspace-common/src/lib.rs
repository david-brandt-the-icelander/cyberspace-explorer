// Reads .dev JSON files strictly and walks a repository the way the Python validators did.
use serde::de::{DeserializeSeed, Deserializer, MapAccess, SeqAccess, Visitor};
use serde_json::{Map, Value};
use std::fmt;
use std::path::{Component, Path, PathBuf};

// Directories that never hold source, so no walk enters them.
pub const SKIPPED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "dist",
    "dist-test",
    "build",
    "bin",
    "obj",
    ".wrangler",
    "__pycache__",
    "target",
];

// Reads a JSON file, refusing duplicate keys as Python's unique_keys hook did.
pub fn read_json(path: &Path) -> Result<Value, String> {
    let text = std::fs::read_to_string(path)
        .map_err(|e| format!("Cannot read {}: {e}", path.display()))?;
    parse_json(&text)
}

// Parses JSON text, refusing duplicate keys.
pub fn parse_json(text: &str) -> Result<Value, String> {
    let mut de = serde_json::Deserializer::from_str(text);
    let value = StrictValue
        .deserialize(&mut de)
        .map_err(|e| e.to_string())?;
    de.end().map_err(|e| e.to_string())?;
    Ok(value)
}

// A seed that builds a serde_json Value and fails on a repeated object key.
struct StrictValue;

impl<'de> DeserializeSeed<'de> for StrictValue {
    type Value = Value;
    // Deserializes any JSON value through the strict visitor.
    fn deserialize<D: Deserializer<'de>>(self, d: D) -> Result<Value, D::Error> {
        d.deserialize_any(StrictVisitor)
    }
}

// The visitor behind StrictValue.
struct StrictVisitor;

impl<'de> Visitor<'de> for StrictVisitor {
    type Value = Value;
    // Names what the visitor expects, for error messages.
    fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str("JSON")
    }
    // Keeps a boolean.
    fn visit_bool<E>(self, v: bool) -> Result<Value, E> {
        Ok(Value::Bool(v))
    }
    // Keeps a negative integer.
    fn visit_i64<E>(self, v: i64) -> Result<Value, E> {
        Ok(Value::from(v))
    }
    // Keeps a positive integer.
    fn visit_u64<E>(self, v: u64) -> Result<Value, E> {
        Ok(Value::from(v))
    }
    // Keeps a float.
    fn visit_f64<E>(self, v: f64) -> Result<Value, E> {
        Ok(Value::from(v))
    }
    // Keeps a string.
    fn visit_str<E>(self, v: &str) -> Result<Value, E> {
        Ok(Value::String(v.to_owned()))
    }
    // Keeps an owned string.
    fn visit_string<E>(self, v: String) -> Result<Value, E> {
        Ok(Value::String(v))
    }
    // Keeps null.
    fn visit_unit<E>(self) -> Result<Value, E> {
        Ok(Value::Null)
    }
    // Builds an array from strict elements.
    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Value, A::Error> {
        let mut items = Vec::new();
        while let Some(item) = seq.next_element_seed(StrictValue)? {
            items.push(item);
        }
        Ok(Value::Array(items))
    }
    // Builds an object, failing on the first repeated key.
    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Value, A::Error> {
        let mut out = Map::new();
        while let Some(key) = map.next_key::<String>()? {
            if out.contains_key(&key) {
                return Err(serde::de::Error::custom(format!(
                    "Duplicate JSON key: {key}"
                )));
            }
            let value = map.next_value_seed(StrictValue)?;
            out.insert(key, value);
        }
        Ok(Value::Object(out))
    }
}

// Every directory under root with its sorted file names, skipping SKIPPED_DIRS and an optional extra directory.
pub fn walk(root: &Path, skip: Option<&Path>) -> Vec<(PathBuf, Vec<String>)> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        let (mut files, mut dirs) = (Vec::new(), Vec::new());
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            if kind.is_dir() {
                let path = entry.path();
                let skipped = SKIPPED_DIRS.contains(&name.as_str())
                    || skip.is_some_and(|s| path.canonicalize().is_ok_and(|p| p == s));
                if !skipped {
                    dirs.push(path);
                }
            } else {
                files.push(name);
            }
        }
        files.sort();
        dirs.sort();
        stack.extend(dirs.into_iter().rev());
        out.push((dir, files));
    }
    out
}

// Every .dev/*.json file under root, in walk order.
pub fn dev_files(root: &Path, skip: Option<&Path>) -> Vec<PathBuf> {
    walk(root, skip)
        .into_iter()
        .filter(|(dir, _)| dir.file_name().is_some_and(|n| n == ".dev"))
        .flat_map(|(dir, files)| {
            files
                .into_iter()
                .filter(|f| f.ends_with(".json"))
                .map(move |f| dir.join(f))
        })
        .collect()
}

// Removes `.` and `..` from a path without touching the disk.
pub fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for part in path.components() {
        match part {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other),
        }
    }
    out
}

// Resolves a path from `base` like Python's Path.resolve(): canonical if it exists, normalized otherwise.
pub fn resolve(base: &Path, value: &str) -> PathBuf {
    let joined = base.join(value);
    joined.canonicalize().unwrap_or_else(|_| normalize(&joined))
}

// Resolves a repository-relative path that must stay inside root and exist.
pub fn repo_path(root: &Path, value: &str) -> Result<PathBuf, String> {
    if Path::new(value).is_absolute() {
        return Err(format!("Expected repository-relative path: {value}"));
    }
    let resolved = resolve(root, value);
    if !resolved.starts_with(root) {
        return Err(format!("Path escapes repository: {value}"));
    }
    if !resolved.exists() {
        return Err(format!("Missing path: {value}"));
    }
    Ok(resolved)
}

// The path of `path` relative to root, with forward slashes, or the path itself if outside.
pub fn relative(root: &Path, path: &Path) -> String {
    let rel = path
        .strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/");
    if rel.is_empty() {
        ".".into()
    } else {
        rel
    }
}

// Tests for strict reading and path resolution.
#[cfg(test)]
mod tests {
    use super::*;

    // A repeated key is refused, as in the Python validators.
    #[test]
    fn duplicate_keys_fail() {
        assert!(parse_json(r#"{"a":1,"b":{"c":1,"c":2}}"#)
            .unwrap_err()
            .contains("Duplicate JSON key: c"));
        assert!(parse_json(r#"{"a":[1,{"b":2}]}"#).is_ok());
    }

    // `..` that leaves the root is reported as escaping, a missing file as missing.
    #[test]
    fn repo_paths() {
        let root = std::env::current_dir().unwrap().canonicalize().unwrap();
        assert!(repo_path(&root, "../../x")
            .unwrap_err()
            .starts_with("Path escapes"));
        assert!(repo_path(&root, "nope.txt")
            .unwrap_err()
            .starts_with("Missing path"));
        assert!(repo_path(&root, "/etc")
            .unwrap_err()
            .starts_with("Expected repository-relative"));
        assert!(repo_path(&root, "Cargo.toml").is_ok());
    }
}
