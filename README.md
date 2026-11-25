# Cyberspace explorer

A web page, served by a small Cloudflare Worker at cyberspace-explorer.com, that shows a repository's architecture, behavior and knowledge from the JSON files in its `.dev/` folders. Four are diagrams, described by the skills in [Meta/Agents/Skills](Meta/Agents/Skills/README.md): component, class, state and deployment. Five describe behavior, with skills of their own: use-case, user-journey, capability, feature and operation. The rest are the knowledge files of the [knowledge catalogue](Meta/Agents/Knowledge/README.md): vision, backlog, decisions, requirements, delivery, operation and the other kinds. A folder can have any mix of them. The files sit in a `.dev/` folder in each folder they describe, or all together in a `.cyberspace-explorer/` folder at the root of the repository. A public repository needs nothing; a private one needs the reader to sign in with GitHub (OAuth, on cyberspace-explorer.com) or to give an access token, which stays in their browser.

Live at <https://cyberspace-explorer.com>. For example, [retro-games](https://cyberspace-explorer.com/?url=https://github.com/david-brandt-the-icelander/retro-games).

## Using it

- **Where the views live.** A view of `foo` is `foo/.dev/x.json`, or `.cyberspace-explorer/foo/x.json`; the root folder's is `.dev/x.json`, or `.cyberspace-explorer/x.json`. If the repository has a `.cyberspace-explorer` folder at its root the page reads only that and does not look for `.dev` folders; otherwise it reads every `.dev` folder. A path in a view (a component's `diagram`, a related view) may be written either way and finds the same view. When you open a folder of the repository, the page reads the part of `.cyberspace-explorer` that belongs to it.

- Open the page and give the address of a repository, or of a folder in one. After that the address field is gone: the page shows that repository until the address changes.
- Signing in with GitHub is optional. On cyberspace-explorer.com, "Sign in with GitHub" runs GitHub's OAuth flow (code flow with PKCE); tick "include my private repositories" first to ask for the `repo` scope, GitHub's only way to read private repositories. The access token never reaches the page: it is sealed in an HttpOnly cookie, and the page reads GitHub through the Worker, which adds the token and allows only the reads it needs. Signed in, your repositories fill a drop-down on the address box, listed by last update, oldest first (`OLDEST_FIRST` in the page flips it). The box doubles as the filter: type part of a name, or paste a GitHub address and the list narrows to that owner/repository. Pick one, or paste any address and press Browse. Opened as a plain file, or anywhere without the Worker, there is no OAuth and the sign-in is a pasted personal access token, kept like the other tokens below.
- Or pass the address in the query string: `?url=https://github.com/owner/repo`. It takes a repository, a branch or tag (`/tree/<ref>`, slashes in the name included) and a folder (`/tree/<ref>/<folder>`). On cyberspace-explorer.com it also takes a website, such as `?url=festi.is`, if the crawler explores it: the page shows the crawler's views of it and, when they are older than allowed, asks for a rescan.
- A private repository, or one behind a rate limit, answers with an error and a button beside it: open the panel, paste an access token and the page reloads with it. GitHub wants a fine-grained token with Contents: read, GitLab one with the `read_api` scope. The token is kept for the tab, or on the browser if you ask, under the host it belongs to, and is only ever sent there, so a GitHub token can never reach a self-hosted GitLab.
- There can be a token per account. When you add one you choose what it is for: every repository on the host, everything under an owner or group, or one repository. A repository uses the narrowest token that covers it, so tokens for several accounts on one host can be kept side by side. The bar shows when one is in use, and its panel lists every token kept, marks the one in use and forgets any of them.
- The left column lists the folders that have diagrams, as a tree; the small icons after each name are the kinds of diagram there, and the filter above it narrows the tree by folder, diagram or part name. The address of a folder's view ends in `#<folder>`, so it can be linked to.
- A folder shows one kind of view at a time. The tabs above the content name each kind the folder has, and how many of it; the kind you are reading stays chosen when you move to a folder that has it too. A drawing is laid out the first time its tab is opened, and a link to a part or a view opens the tab it is in.
- The diagrams are the way around. A part with a round badge stands for a folder that has diagrams of its own (a sub-component, the folder an artifact is built from, the folder that declares an external type): click it to open that folder. Any other part opens a panel with everything the diagram says about it, with its relationships as links to the parts at their other ends. Hovering a part lights up its neighbours; hovering a line says what the relationship is.
- Drag a drawing to move it, use ⌘ or Ctrl with the scroll wheel (or a pinch) to zoom, and the buttons in its corner to zoom or fit it again.
- A use case is drawn as its steps in order, people and outside systems apart from the system's own steps, with each alternative branching off its step as a dashed outcome. Click a step for its sources and the steps around it.
- A user journey is drawn as its stages from left to right, each what the person does at a touchpoint. Click a stage for its context, its outcome and its sources; the card under the drawing names the persona, the other actors involved and the goal.
- Capabilities, features and operations are written, not drawn: a card per capability, feature or use case (responsibility, access, behavior, outcome, constraints, the actor and goal), and a table of operations (action, entrypoint, authorization, result and what can make it fail). Each links to the source symbol it was read from.
- Every view lists its related views, as links that open the other view in its own folder, which is the way from a feature to the operations and capability that implement it.
- A folder's knowledge files share one tab, grouped as the catalogue groups them (direction, requirements, work, structure, verification, delivery, operation, reference). Each record is a card: its title, status and evidence first, then its summary, its details as Markdown, the fields of its kind and any others it carries, where it came from, its relationships, sources and links. A path to another knowledge file opens that file here, at the record it names; any other path opens on the host. A folder's `folder.json` purpose is shown under the folder's name.
- **Waiting**, above the folder tree, lists every open decision and every blocker in the repository, with who it waits on and what it blocks, each linked to its record. It is shown only when there is something waiting, and its address ends in `#~waiting`.
- **Doc comments.** A source reference (a path and a `symbol`) to a `.cs`, `.fs`, `.vb`, `.cpp` or `.h` file shows the XML doc comment written above that symbol: its summary, and its returns, parameters, exceptions and remarks. The page reads the file when the reference is shown, and shows nothing if the symbol has no doc comment.
- Under each drawing, the view is listed in full: its parts, its relationships or transitions, and the source files it cites, linked to the repository.
- **Cyberspace.** The Flat / Cyberspace switch in the bar shows the same views in 3D, in a browser with WebGL. A folder opens as a tower of glass floors, one per view: drawn views at the bottom, then the written ones, then the knowledge files, with a drawn view pulled out and its city standing small on it. Click another drawn floor to pull it out, or a written one to read it. **Enter the city** flies down into the view: its parts stand where Flat draws them, as cyan glass towers as tall as their relationships make them, each carrying its own record on its faces in glowing text, on plates for the groups that hold them, with outside services as magenta beacons and every relationship a glowing circuit trace on the black, glossy floor, everything faintly mirrored in it. Click a part to light its traces, which rise as arcs of light from it to its neighbours, and open the same panel Flat shows; **Walk to** it to stand at street level among the parts, where the towers nearest you name themselves on their faces, with a map in the corner. The **Layers** panel stands the folder's other drawn views beside the city, as many as the scene can draw at once. A repository with several folders has a skyline above the towers, a building for each folder: **See the skyline** rises to it, and a click on a building flies into its tower. Esc goes up a level, from the street to the city, the tower and the skyline, and the switch goes back to the same place in Flat. Cyberspace is always dark, the Gibson's black floor and cyan glass, whatever the theme.
- **The dock.** At Cyberspace's left edge:
  - **Back** and **Forward**.
  - **History**, the places you visited, and **bookmarks** for places to come back to. Both are kept in this browser.
  - **A button per kind of drawn view** in the folder. A view's button blurs the scene and draws the view over it in neon. A use case or journey over a city lights the parts its steps seem to touch (inferred from the sources its steps cite and their wording, and marked as such).
  - **Going to a part:** choosing a part of the drawing turns the camera toward it, lets the drawing go with an afterglow, and warps there, through a moment of darkness that clears onto the place. With reduced motion, it goes there at once.
- **Light and dark.** The three buttons at the right of the bar choose Flat's theme: System follows the system's setting, Light and Dark fix one and the browser remembers it. Cyberspace stays dark, so the buttons rest while it shows; a choice made meanwhile, in another tab or by the system, shows when you go back to Flat.
- In Cyberspace, drag to turn the scene, right-drag or Shift and drag to pan, and scroll or pinch to fly in and out; on the scene the arrow keys turn it, + and − zoom and F fits everything in. In a tower the wheel climbs, and ↑ and ↓ go from floor to floor. In the street W A S D or the arrow keys walk (with Shift, faster), Alt with ← and → turns, Space and Z rise and sink, and a drag looks round. Tab goes through the parts, floors or buildings, and Enter does what a click does.
- Cyberspace's address is Flat's with one more segment at the end: `#worker|~space` is the Worker's folder as a tower (`#|~space` the root's), `#|component:loader|~space:city` the component diagram's city with Loader selected, `#|component:loader|~space:street` the street beside Loader, and `#worker|~space:skyline` the skyline, seen from the Worker's building. Without WebGL, or in a copy of the page from before Cyberspace, the same address opens the same place flat. Everything Cyberspace shows can be read in Flat too.

## In VS Code

[`vscode/`](vscode/README.md) is a VS Code extension that shows this page in the editor for the open workspace folder, reading its `.dev` files from disk (committed or not) with no token, following VS Code's colour theme in Flat (Cyberspace stays dark), and opening the files it links to in the editor. `npm test` runs its tests with the page's; `cd vscode && npm run package` builds a `.vsix`.

## How it works

Everything runs in the browser. For GitHub it lists the repository with one call to the GitHub API (the default branch, then the recursive tree) and reads each `.dev/*.json` file (or each `.cyberspace-explorer/**/*.json` file) from `raw.githubusercontent.com`. Unauthenticated, the GitHub API allows 60 requests an hour per address, and a page load uses two; a token raises that to 5,000. With a token the files are read through the API instead, with `Accept: application/vnd.github.raw`, because `raw.githubusercontent.com` turns away an `Authorization` header at CORS. For GitLab it uses the GitLab API's repository tree and raw file endpoints, which take the token as a `PRIVATE-TOKEN` header. Other hosts are not supported: a plain git server can't be listed from a browser.

The page draws the diagrams itself, as SVG. [dagre](https://github.com/dagrejs/dagre) 3.1.3 places the parts; everything else (the shapes, the lines, the labels and the icons) is in the page. Each kind of diagram has its own drawing: components as plates nested in the part that contains them, deployments with each host as a frame around what it runs, classes as cards with their members, and state machines with a start point, double-ringed final states and each transition labelled with what fires it. Pieces of a class diagram that don't touch are laid out separately and packed together; state and deployment diagrams are laid out left to right or top to bottom, whichever is drawn larger.

The behavior views share one layout of facts and tables, except the use case and the user journey, which go through the same drawing as the diagrams. They carry `entities`, where the diagrams carry components, types or states, and `relatedViews`; the page reads both. Knowledge files carry `entities` too, with `title` and `summary` where the views have `name` and `description`, and any field an agent added. The page renders the Markdown in `details` itself, and only the safe part of it: paragraphs, lists, bold, inline code and links; any HTML stays text. A file of a kind it doesn't know is skipped and named in the status line.

The icons are drawn for this page, on a 24-unit grid. A component's icon is chosen from its name (an engine gets a gear, a renderer a screen, a database a cylinder, and so on, with a cube when nothing matches), a deployment node's from its kind and a type's from its kind.

dagre and the Barlow typefaces are loaded from jsDelivr, and so is [three.js](https://threejs.org) 0.187.0, the first time a reader enters Cyberspace and not before. If dagre can't load, the tables still show everything; without the typefaces the page falls back to system fonts; without three.js the status line says so and the page shows Flat. There is no build step: the page is one HTML file, which the Worker below serves as it is and which also works opened as a plain file, without the sign-in.

## The service

`worker/` is a Cloudflare Worker named `cyberspace-explorer`, on its own domain, `cyberspace-explorer.com`, as a Workers custom domain (`wrangler.jsonc`): Cloudflare creates the DNS record and the certificate when it deploys. It serves `index.html` at `/` and these routes:

| Route | What it does |
| --- | --- |
| `GET /auth/me` | `{ configured, user }`: whether OAuth is set up, and who is signed in. The page uses it to tell a server from a plain file |
| `GET /auth/github/start?return=…&private=1` | Off to GitHub with a random `state` and a PKCE challenge, both bound to this browser by a sealed cookie (10 minutes). `return` must be a path inside the app |
| `GET /auth/github/callback` | Back from GitHub: the state is checked, the code exchanged (with the client secret and the PKCE verifier), the account looked up, and a session cookie set |
| `POST /auth/sign-out` | Forgets the session; only from the app's own origin |
| `GET /api/github/<path>` | GitHub's API with the reader's token, for `user`, `user/repos`, a repository, its trees and its contents only; read only; the token is never sent to the page |
| `GET /admin` | The crawler's admin page, for a reader signed in to icelander.net who holds its role `explorer:admin` (the owners hold every role), whatever `REQUIRE_SIGN_IN` says; anyone else is sent to sign in or refused. A GitHub login doesn't count |
| `/api/admin/…` | The admin page's API: the address list, each address's interval and staleness limit, rescans, and the defaults. Changes only from the app's own origin |
| `GET /api/space?url=…` | What the crawler has for an address it explores: its views, when it was last scanned and whether that is stale. `/api/space/<id>/files/<path>` serves a view |
| `POST /api/space/<id>/approach` | Sent by the page when a player opens an address; queues a rescan if its data is older than allowed |
| `GET /crawler` | What the crawler is and how it behaves: [docs/cyberspace-protocol.md](docs/cyberspace-protocol.md) as a page |

**Who the reader is** is icelander.net's login service (decided 2026-11-21): with `REQUIRE_SIGN_IN` set to `"true"` (`wrangler.jsonc`; it is `"false"` until the owner has deployed icelander.net's login service with the app `explorer`, then flipped) the page, `/api/space*`, `/auth/github/start` and `/api/github/*` need a sign-in to icelander.net (Google or GitHub there; app `explorer`, cookie `explorer_identity`, routes under `/identity/auth`: `sign-in`, `callback`, `sign-out`, `me`), through the vendored `worker/vendor/icelander-auth/` (never edited here; `npm test` fails if it is) and the service binding `ACCOUNTS`. A visitor without it is sent there and back to the same place. **The explorer's own GitHub OAuth App is unchanged**: it is only the optional "connect your repositories" step, which reads GitHub, and says nothing about who the reader is. Opened as a plain file, or with `REQUIRE_SIGN_IN` off, nothing changes.

The session is `explorer_session`, `Path=/; HttpOnly; Secure; SameSite=Lax`, 7 days, AES-GCM sealed with a key derived from `SESSION_SECRET`. It is not the sign-in to icelander.net (above): it exists to read GitHub, not to say who the reader is. Without the three secrets below the routes answer that sign-in isn't set up and the page falls back to pasted tokens. Nothing is logged about a sign-in. `npm test` runs the Worker's tests.

### Setting it up once (the owner)

0. **Deploy icelander.net's `accounts` Worker first**, with the app `explorer` registered (callback `https://cyberspace-explorer.com/identity/auth/callback`, providers GitHub and Google; icelander.net PR #162). Then set `REQUIRE_SIGN_IN` to `"true"` in `wrangler.jsonc` and deploy. To go back, set it to `"false"` and redeploy.

1. On GitHub, **Settings → Developer settings → OAuth Apps → New OAuth App**: name "Cyberspace explorer", homepage `https://cyberspace-explorer.com`, authorization callback URL `https://cyberspace-explorer.com/auth/github/callback`. Generate a client secret.
2. Put the three secrets on the Worker (the first deploy creates it; run these after it, or deploy once by hand):

   ```bash
   npx wrangler secret put GITHUB_CLIENT_ID -c wrangler.jsonc
   ```

   ```bash
   npx wrangler secret put GITHUB_CLIENT_SECRET -c wrangler.jsonc
   ```

   ```bash
   npx wrangler secret put SESSION_SECRET -c wrangler.jsonc
   ```

   `SESSION_SECRET` is any long random string (for example `openssl rand -base64 48`). Changing it signs everyone out.
3. Give the CI/CD container (below, "Deploying") a Cloudflare API token, as its secret file `secrets/cloudflare_api_token`: **Account → Workers Scripts: Edit** and **Zone → Workers Routes: Edit** and **Zone → DNS: Edit** for cyberspace-explorer.com, and the crawler's permissions ([crawler/README.md](crawler/README.md), step 3). It is not a repository secret.

## The crawler

[`crawler/`](crawler/README.md) is a second Worker, cyberspace-crawler. It keeps a list of addresses to explore, which are git repositories and websites, and scans each on a schedule. It stores what the explorer needs to show them:
- **A repository** is reread by its git history: only the views that changed since the last commit it read.
- **A website** is reread by its own caching headers. A site that publishes [`/.well-known/cyberspace.json`](docs/cyberspace-protocol.md) is shown as it describes itself. For any other site, the crawler collects what the site makes public (robots.txt, sitemaps, a sample of its pages, DNS and registration), for an AI step to turn into views.

It obeys robots.txt and keeps to a budget of requests per run. It needs a database, a bucket and queues that the owner creates once ([crawler/README.md](crawler/README.md), "Setting it up once").

## Deploying

This repository has no GitHub Actions. Its CI, deploys and releases run in a Docker container defined in [`cyberspace-explorer/` of continuous_integration_and_delivery](https://github.com/david-brandt-the-icelander/continuous_integration_and_delivery/tree/main/cyberspace-explorer), a **private** repository; its README says how to set it up and run it by hand. The container polls this repository ([pipeline](.dev/pipeline.json), [decision `leave-github-actions`](.dev/decisions.json)):

- **Every new commit on a branch** gets the checks: `npm test` (the Worker, the page's pure functions, the VS Code extension and the crawler), then `cargo fmt --all --check`, `cargo clippy --workspace --all-targets --locked -- -D warnings`, `cargo test --workspace --locked` and `cyberspace-generator validate`. The result is the commit status `ci/cyberspace-explorer`, which a pull request shows; branch protection makes it required.
- **A green `main`** is deployed while the container's `DEPLOY_ENABLED` is `true`: it stops if `wrangler.jsonc` or `crawler/wrangler.jsonc` still holds `REPLACE-WITH-D1-DATABASE-ID` ([crawler/README.md](crawler/README.md), "Setting it up once"), deploys the explorer's Worker with `wrangler deploy --config wrangler.jsonc`, then the crawler, then checks that `/`, `/auth/me` and `/crawler` answer, and rolls back the Workers it deployed with `wrangler rollback` if they don't. The result is the commit status `deploy/cyberspace-explorer`. To redeploy by hand: `docker compose run --rm ci deploy <sha>` on the container's machine.

The same checks, deploys and the Linux half of a release are also written as step containers for zazzle's builders and deployers, reported to zizd, in [`.zazzle/zizd/`](.zazzle/zizd/README.md): three pipelines, `site`, `crawler` and `generator`, the last releasing from the branch `release/generator` instead of a tag. The container above stays until they are registered and have deployed ([backlog `zizd-pipelines`](.dev/backlog.json)).

The owner's one-time steps (the container on an always-on machine, its tokens, Actions turned off, `ci/cyberspace-explorer` required on `main`) are the runbook [`set-up-ci`](.dev/runbooks.json). The icelander.net repository only links to the app, from its Apps page.

## Its own description

The explorer is described in its own `.dev/` folders, and [the explorer shows them](https://cyberspace-explorer.com/?url=https://github.com/david-brandt-the-icelander/cyberspace-explorer): the page in [`.dev/`](.dev) (its vision and stakeholders, the journeys and use cases of the [reader](Actors/reader.md), the states of the page, Cyberspace's scenes, the token panel and a drawing, its features, capabilities and entrypoints, its parts and where it runs, and its requirements, contracts, design decisions and limitations), the Worker in [`worker/.dev/`](worker/.dev), and the pipeline that tests and deploys it in [`.dev/pipeline.json`](.dev/pipeline.json). The [design pass](.dev/backlog.json) item says what to read in what order before changing the design. [AGENTS.md](AGENTS.md) says how agents keep these files, and how to check them.

## cyberspace-generator

`crates/` is a Cargo workspace holding `cyberspace-generator`, a command-line tool that checks and maintains the `.dev` files this page shows, and the libraries it is built from:

- `cyberspace-diagrams` and `cyberspace-knowledge` are Rust ports of `Meta/Agents/Skills/validate_diagrams.py` and `Meta/Agents/Knowledge/validate_knowledge.py`. They read the schemas from the checked repository's `Meta/Agents` at run time. Where the Python diagram validator stops at the first problem, they report every file's first problem.
- `cyberspace-common` reads JSON strictly (a repeated key is an error) and walks a repository, skipping `.git`, dependencies and build output.

Commands, from a repository's root:

```bash
cyberspace-generator validate          # both validators; exit 1 on any problem; --json for agents
cyberspace-generator scan              # each folder's .dev kinds, and .dev folders without folder.json
cyberspace-generator stale origin/main # .dev files citing files changed since that revision
```

Develop with `cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace`. The parity tests in `crates/cyberspace-generator/tests/parity.rs` break a copy of this repository in known ways and check that the Rust and, when `jsonschema` is installed, the Python validators report the same problem.

To release, set `version` under `[workspace.package]` in `Cargo.toml`, merge, and push the tag `generator-v<that version>`. The release is made in two halves, both of which refuse a tag that does not match ([runbook `release-generator`](.dev/runbooks.json)):

1. The CI/CD container (above, "Deploying") sees the tag, runs `cargo test`, builds the static Linux binaries for both CPU types, and puts them with their `SHA256SUMS` lines in a **draft** GitHub release.
2. On the owner's Mac, `cyberspace-explorer/release-macos.sh generator-v<version>` from a checkout of continuous_integration_and_delivery (private) builds the macOS binaries for both CPU types, adds them, completes `SHA256SUMS` and publishes the release.

Either half can go first; the release stays a draft, which nobody else sees, until all four binaries are in. The assets are `cyberspace-generator-<target>` and `SHA256SUMS`, as before. It is installed as part of zazzle (`brew install zazzcat/z/zazzle`): zazzle's `bump-cyberspace-generator.sh` opens a pull request pinning each new release, and zazzle's release includes the binary.
