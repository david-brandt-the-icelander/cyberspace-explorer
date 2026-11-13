# Agents

The cyberspace explorer: a page (`index.html`) that shows a repository's `.dev` folders, and the Cloudflare Worker (`worker/`) that serves it at cyberspace-explorer.com and signs readers in with GitHub. [README.md](README.md) says how it is used and how it works.

- `index.html` is the whole page, with no build step. Keep it working when opened as a plain file, without the Worker.
- `npm test` runs the Worker's tests (`test/app.test.js`); the workflow runs them on every pull request and before every deploy.
- `crates/` is the Rust workspace for `cyberspace-generator` and the validators it is built on: run `cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace` after changing it. When `Meta/Agents/Skills/validate_diagrams.py` or `Meta/Agents/Knowledge/validate_knowledge.py` changes upstream, port the change to `crates/cyberspace-diagrams` or `crates/cyberspace-knowledge` and add a case to `crates/cyberspace-generator/tests/parity.rs`.
- No secrets in the repository: the Worker's secrets are set on Cloudflare (`wrangler.jsonc` names them).

## Architecture diagrams and knowledge files

Each folder documents itself in a `.dev/` directory next to its code, as JSON following the skills in `Meta/Agents/Skills/` and the knowledge catalogue in `Meta/Agents/Knowledge/` (human-assisted software development). Read a folder's `.dev` files before changing it. `populate-dev` decides what a folder needs; the diagrams are:

- `describe-component-diagram`: the folder is a cohesive capability, adapter, boundary or subsystem (the root, for the page and the Worker; `worker`).
- `describe-class-diagram`: the folder itself declares more than one class. None does today: the page and the Worker are functions.
- `describe-state-diagram`: the folder implements a state machine. One `<Identifier>.state-diagram.json` per machine, named after what it belongs to (the root's `page`, `token-panel` and `drawing`; the Worker's `Session`).
- `describe-deployment-diagram`: the folder holds something independently deployable (the root, with `wrangler.jsonc`).

What a folder does, offers and exposes goes in its use cases, user journeys, capabilities, features and operations (`describe-use-case`, `describe-user-journey`, `describe-capability`, `describe-feature`, `describe-operation`). What it intends, promises and needs (requirements, backlog items, decisions, blockers, contracts, verification, delivery, configuration, runbooks, limitations and the rest) goes in knowledge files, written with `describe-knowledge`. Wanted work is a `backlog` item in the folder that will own it, and a question only the owner can answer is a `decisions` record with `status: open`. `test` and `.github` have `.dev` folders of their own for their folder record, the pipeline and its backlog.

Every actor a use case, journey or diagram names has a file in `Actors/` at the repository root, written with `describe-actor` and linked from whatever names it; delete an actor nothing links to. Update the `.dev` files and actors in the same commit as the code they describe, and delete one that stops applying. Before finishing, run both validators from the repository root, with the `jsonschema` package installed:

```bash
python3 Meta/Agents/Skills/validate_diagrams.py
python3 Meta/Agents/Knowledge/validate_knowledge.py
```

The skills and the catalogue come from <https://github.com/david-brandt-the-icelander/human-assisted-software-development> (`Agents/Skills` and `Agents/Knowledge`). Change them there and copy them here, so there is one version. The page draws exactly what they define, so a change to a schema there usually needs a change to `index.html` here.
