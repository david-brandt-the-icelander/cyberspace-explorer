# `.zazzle/zizd/`: cyberspace-explorer's zizd pipelines

The steps zazzle's builders and deployers run for this repository, written against zazzle's step-pipeline spec
(`src/macos/zazzle-pipeline/pipeline-spec.md`, sections 1–4). They take over from the legacy runner in
continuous_integration_and_delivery's `cyberspace-explorer/` (README.md, "Deploying"), which keeps running until the
cutover.

The repository has three pipelines, so each step is a folder `.zazzle/zizd/PIPELINE/STEP/` with a `Dockerfile` and a
`run.sh`. The one exception is `.zazzle/zizd/test/`, which the `site` and `crawler` pipelines share. The pipeline files
live in the orchestrator (`.zazzle/zizd/pipelines/david-brandt-the-icelander/cyberspace-explorer/PIPELINE.json`), and
the copies below are what goes there.

| Pipeline | Builds | Deploys | Steps |
|---|---|---|---|
| `site` | `main` | the explorer's Worker (`wrangler.jsonc`) to cyberspace-explorer.com | `test` → `build` → `deploy` |
| `crawler` | `main` | the cyberspace-crawler Worker (`crawler/wrangler.jsonc`) | `test` → `build` → `deploy` |
| `generator` | `main`, and `release/generator` as the environment `release` | in `release` only: the tag `generator-v<version>` and the GitHub release with the Linux binaries | `check` → `build` → `release` |

## The steps

| Step folder | Phase | Image | What it does | Leaves in `/zazzle/output` |
|---|---|---|---|---|
| `test` | build | `node:22.21.1-bookworm-slim`, python3 with jsonschema 4.26.0 | `npm test`: the Worker, the page's pure functions, the VS Code extension and the crawler (whose tests check its views against the skills' schemas with Python's jsonschema) | nothing |
| `site/build` | build | `node:22.21.1-bookworm-slim`, wrangler 4.156.1 | `wrangler deploy --dry-run --outdir` of `wrangler.jsonc` | `worker/` (the bundle: `index.js` and the modules it imports as text), `wrangler.jsonc`, `BUILD` |
| `site/deploy` | deploy (`deploys: true`) | the same, with curl | from the build's artifacts only: `wrangler deploy worker/index.js --no-bundle`, then the smoke test (`/` says "Cyberspace explorer", `/auth/me` answers, `/crawler` says "cyberspace-crawler"), and `wrangler rollback` if it fails | nothing |
| `crawler/build` | build | `node:22.21.1-bookworm-slim`, wrangler 4.156.1 | `npm ci --prefix crawler`, then `wrangler deploy --dry-run --outdir` of `crawler/wrangler.jsonc` | `src/` (the bundle, with `@anthropic-ai/sdk` inside it), `wrangler.jsonc` (the crawler's), `BUILD` |
| `crawler/deploy` | deploy (`deploys: true`) | the same | from the build's artifacts only: `wrangler deploy src/index.js --no-bundle` | nothing |
| `generator/check` | build | `rust:1.100.0-slim-bookworm`, clippy, rustfmt, Python's jsonschema 4.26.0 | `cargo fmt --all --check`, `cargo clippy --workspace --all-targets --locked -- -D warnings`, `cargo test --workspace --locked`, `cyberspace-generator validate` | nothing |
| `generator/build` | build | `rust:1.100.0-slim-bookworm`, musl-tools, zig 0.17.1, cargo-zigbuild 0.24.1 | in `release` only: the static Linux binaries for both CPU types (the machine's own musl target with cargo, the other with cargo-zigbuild), each checked for its CPU and for static linking, and `--version` checked. On `main` it builds nothing. | `dist/cyberspace-generator-{x86_64,aarch64}-unknown-linux-musl`, `dist/SHA256SUMS`, `VERSION`, `BUILD` |
| `generator/release` | deploy (`deploys: true`) | `debian:12.12-slim`, curl, jq | in `release` only, from the build's artifacts: reads the version from `Cargo.toml` (it must be the build's), creates the tag `generator-v<version>` at the commit, creates the draft release with generated notes, uploads the two Linux binaries, merges their lines into `SHA256SUMS`, and publishes the draft once all four binaries are there | nothing |

Every Rust step keeps cargo's registry and target directory in `/tmp`. Every step works on a copy of the repository in
`/tmp`, because the input is read-only.

The deploy and release steps:

- **Credentials.** They refuse without their credentials (`CLOUDFLARE_API_TOKEN`, or `GITHUB_RELEASE_TOKEN`) and
  without the build's artifacts. The release step also refuses outside the `release` environment, artifacts of another
  commit, and binaries that do not match the build's `SHA256SUMS`.
- **Never rebuild.** They deploy what `/zazzle/input/artifacts/build/` holds and nothing else. The Worker steps also
  refuse a configuration that still holds `REPLACE-WITH-D1-DATABASE-ID`, or one with a custom `build` command, which
  wrangler would run with the token.
- **Halting.** They check `ZAZZLE_HALT_FILE` before each sub-step and exit **75** when asked to halt.
  - `site/deploy`: before the deploy. Once the Worker is deployed, the smoke test and its rollback always run, because
    they decide whether what was just deployed may stay.
  - `crawler/deploy`: before the deploy.
  - `generator/release`: before the tag, the draft, the uploads and publishing. A rerun picks up where it stopped.
- **No migrations.** None are applied, as today: the crawler's `crawler/schema.sql` is applied by the owner, never
  from a pipeline.
- **Dry runs.** With `DEPLOY_DRY_RUN=1` (by hand only: no pipeline names it), they need no credentials and change
  nothing.
  - The Worker steps run `wrangler deploy --dry-run` on the artifacts. `site/deploy` smoke-tests the live site and only
    logs a rollback.
  - `generator/release` reads GitHub's public API without a token and says what it would do.

### The generator release, and what is left out

A release is made from the branch `release/generator`, the environment `release`. It takes the place of the
`generator-v*` tag that the owner pushed by hand:

1. Set `version` under `[workspace.package]` in `Cargo.toml`.
2. Merge to `main`.
3. Bring `release/generator` up to that commit.
4. The pipeline then runs `check`, builds the Linux binaries, and the release step creates the tag itself.

If the tag already exists at another commit, the step refuses until the version is raised. If the release is already
published, there is nothing to do.

**The macOS half is not a step yet.** It needs a macOS VM step (Tart), which zazzle does not have. Until it has one,
the release stays a draft after the Linux half, which consumers never see, and the owner finishes it on the Mac as
today:

```bash
cyberspace-explorer/release-macos.sh generator-v<version>
```

Run it from a checkout of continuous_integration_and_delivery. It builds and adds the two macOS binaries, completes
`SHA256SUMS` and publishes the release. It clones the tag, which the release step has already created. Once there is a
Tart step, it becomes a `build-macos` step before `release`, with `"platform"`/`"runner"` for the VM, and the release
step publishes in one go.

## The pipeline files

`site`:

```json
{
  "id": "david-brandt-the-icelander/cyberspace-explorer:site",
  "repos": ["https://github.com/david-brandt-the-icelander/cyberspace-explorer.git"],
  "paths": ["index.html", "worker", "wrangler.jsonc", "docs/cyberspace-protocol.md", "crawler/src", "crawler/test",
            "test", "vscode", "package.json", ".zazzle/zizd/test", ".zazzle/zizd/site"],
  "steps": [
    { "name": "test", "path": ".zazzle/zizd/test" },
    { "name": "build", "path": ".zazzle/zizd/site/build" },
    { "name": "deploy", "path": ".zazzle/zizd/site/deploy", "config": ["CLOUDFLARE_API_TOKEN"], "deploys": true }
  ],
  "supersede": true,
  "halt": { "deployment": "should" }
}
```

`crawler`:

```json
{
  "id": "david-brandt-the-icelander/cyberspace-explorer:crawler",
  "repos": ["https://github.com/david-brandt-the-icelander/cyberspace-explorer.git"],
  "paths": ["crawler", "package.json", ".zazzle/zizd/test", ".zazzle/zizd/crawler"],
  "steps": [
    { "name": "test", "path": ".zazzle/zizd/test" },
    { "name": "build", "path": ".zazzle/zizd/crawler/build" },
    { "name": "deploy", "path": ".zazzle/zizd/crawler/deploy", "config": ["CLOUDFLARE_API_TOKEN"], "deploys": true }
  ],
  "supersede": true,
  "halt": { "deployment": "should" }
}
```

`generator`:

```json
{
  "id": "david-brandt-the-icelander/cyberspace-explorer:generator",
  "repos": ["https://github.com/david-brandt-the-icelander/cyberspace-explorer.git"],
  "paths": ["crates", "Cargo.toml", "Cargo.lock", "Meta", ".dev", "**/.dev/**", "Actors", ".zazzle/zizd/generator"],
  "steps": [
    { "name": "check", "path": ".zazzle/zizd/generator/check" },
    { "name": "build", "path": ".zazzle/zizd/generator/build" },
    { "name": "release", "path": ".zazzle/zizd/generator/release", "deploys": true }
  ],
  "environments": {
    "release": { "branch": "release/generator", "config": { "release": ["GITHUB_RELEASE_TOKEN"] } }
  },
  "supersede": true,
  "halt": { "deployment": "should" }
}
```

Notes on these files:

- **`paths`.** The explorer's Worker imports `crawler/src/address.js` and `store.js`, and the crawler's tests are part
  of `npm test`, so `crawler/` changes run `site` too. `generator` includes the `.dev` folders and `Actors/` because
  `cyberspace-generator validate` checks them, and `Meta/` because the parity tests compare with its validators.
- **Order between the Workers.** The two Workers' pipelines are independent. The legacy runner deployed the explorer
  first and then the crawler, but neither needs the other to be deployed first: they share a database, a bucket and a
  queue, which the owner created once.
- **Deployers.** A deployer for this repository serves these three pipeline ids:
  - `david-brandt-the-icelander/cyberspace-explorer:site`
  - `david-brandt-the-icelander/cyberspace-explorer:crawler`
  - `david-brandt-the-icelander/cyberspace-explorer:generator@release`

  It does not serve the base `generator`, whose release step would only refuse.

## Config keys

These are names only. The values are in the orchestrator's config files (later zeecrets), never here.

| Key | Step | File | Where it goes |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `site` → `deploy` | `config/david-brandt-the-icelander/cyberspace-explorer/site.json` | `deploy_keys`. It needs Workers Scripts: Edit on the account, and Workers Routes: Edit and DNS: Edit on cyberspace-explorer.com (README.md, "Setting it up once", step 3). |
| `CLOUDFLARE_API_TOKEN` | `crawler` → `deploy` | `config/david-brandt-the-icelander/cyberspace-explorer/crawler.json` | `deploy_keys`. It is the same token, which also needs D1: Edit, Workers R2 Storage: Edit and Queues: Edit (crawler/README.md, step 3). |
| `GITHUB_RELEASE_TOKEN` | `generator` → `release`, in `release` | `config/david-brandt-the-icelander/cyberspace-explorer/generator@release.json` | `deploy_keys`. It needs Contents: write on this repository, to create the tag and the release. |

`CLOUDFLARE_ACCOUNT_ID` is not needed, because both configurations name `account_id`. The build-phase steps need no
key: the repository is public and every dependency comes from public registries. The builder's own `GITHUB_TOKEN` and
z3 keys (`shared.json`) are zazzle's and reach no step.

## Trying it by hand

Each step was run with the spec's recipe ("Trying a step by hand"), each step's output copied into the next one's
`/zazzle/input/artifacts/STEP/`. The deploy and release steps were run only without credentials (they refuse), with
a halt file (exit 75) and with `DEPLOY_DRY_RUN=1`. For example, to try the explorer's deploy as a dry run after its
build:

```bash
docker build -t try-site-deploy .zazzle/zizd/site/deploy
docker run --rm --user "$(id -u):$(id -g)" -v "$t/input:/zazzle/input:ro" -v "$t/output:/zazzle/output" \
  -e ZAZZLE_STEP=deploy -e ZAZZLE_STAGE=deploy -e ZAZZLE_ARTIFACTS=/zazzle/input/artifacts \
  -e DEPLOY_DRY_RUN=1 try-site-deploy
```

## What goes at cutover

Not removed yet. These go once the pipelines are registered and have deployed:

- **The legacy runner.** The folder `cyberspace-explorer/` of continuous_integration_and_delivery (its `Dockerfile`,
  `docker-compose.yml`, `scripts/` and the watcher container on the owner's machine). `release-macos.sh` stays
  until there is a Tart step.
- **This repository's description of it.** README.md "Deploying", `.dev/pipeline.json` and the runbooks `set-up-ci`
  and `release-generator` describe the legacy runner and change with the cutover.
- **Branch protection.** The commit statuses `ci/cyberspace-explorer` and `deploy/cyberspace-explorer` come from the
  legacy runner. Pull-request checks are deferred in zizd, so the required status check goes until they exist.
