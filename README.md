# Cyberspace explorer

A web page, served by a small Cloudflare Worker at cyberspace-explorer.com, that shows a repository's architecture, behavior and knowledge from the JSON files in its `.dev/` folders. Four are diagrams, described by the skills in [Meta/Agents/Skills](Meta/Agents/Skills/README.md): component, class, state and deployment. Five describe behavior, with skills of their own: use-case, user-journey, capability, feature and operation. The rest are the knowledge files of the [knowledge catalogue](Meta/Agents/Knowledge/README.md): vision, backlog, decisions, requirements, delivery, operation and the other kinds. A folder can have any mix of them. The files sit in a `.dev/` folder in each folder they describe, or all together in a `.cyberspace-explorer/` folder at the root of the repository. A public repository needs nothing; a private one needs the reader to sign in with GitHub (OAuth, on cyberspace-explorer.com) or to give an access token, which stays in their browser.

Live at <https://cyberspace-explorer.com>. For example, [retro-games](https://cyberspace-explorer.com/?url=https://github.com/david-brandt-the-icelander/retro-games).

## Using it

- **Where the views live.** A view of `foo` is `foo/.dev/x.json`, or `.cyberspace-explorer/foo/x.json`; the root folder's is `.dev/x.json`, or `.cyberspace-explorer/x.json`. If the repository has a `.cyberspace-explorer` folder at its root the page reads only that and does not look for `.dev` folders; otherwise it reads every `.dev` folder. A path in a view (a component's `diagram`, a related view) may be written either way and finds the same view. When you open a folder of the repository, the page reads the part of `.cyberspace-explorer` that belongs to it.

- Open the page and give the address of a repository, or of a folder in one. After that the address field is gone: the page shows that repository until the address changes.
- Signing in with GitHub is optional. On cyberspace-explorer.com, "Sign in with GitHub" runs GitHub's OAuth flow (code flow with PKCE); tick "include my private repositories" first to ask for the `repo` scope, GitHub's only way to read private repositories. The access token never reaches the page: it is sealed in an HttpOnly cookie, and the page reads GitHub through the Worker, which adds the token and allows only the reads it needs. Signed in, your repositories fill a drop-down on the address box, listed by last update, oldest first (`OLDEST_FIRST` in the page flips it). The box doubles as the filter: type part of a name, or paste a GitHub address and the list narrows to that owner/repository. Pick one, or paste any address and press Browse. Opened as a plain file, or anywhere without the Worker, there is no OAuth and the sign-in is a pasted personal access token, kept like the other tokens below.
- Or pass the address in the query string: `?url=https://github.com/owner/repo`. It takes a repository, a branch or tag (`/tree/<ref>`, slashes in the name included) and a folder (`/tree/<ref>/<folder>`).
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
- Under each drawing, the view is listed in full: its parts, its relationships or transitions, and the source files it cites, linked to the repository.

## How it works

Everything runs in the browser. For GitHub it lists the repository with one call to the GitHub API (the default branch, then the recursive tree) and reads each `.dev/*.json` file (or each `.cyberspace-explorer/**/*.json` file) from `raw.githubusercontent.com`. Unauthenticated, the GitHub API allows 60 requests an hour per address, and a page load uses two; a token raises that to 5,000. With a token the files are read through the API instead, with `Accept: application/vnd.github.raw`, because `raw.githubusercontent.com` turns away an `Authorization` header at CORS. For GitLab it uses the GitLab API's repository tree and raw file endpoints, which take the token as a `PRIVATE-TOKEN` header. Other hosts are not supported: a plain git server can't be listed from a browser.

The page draws the diagrams itself, as SVG. [dagre](https://github.com/dagrejs/dagre) 3.1.3 places the parts; everything else (the shapes, the lines, the labels and the icons) is in the page. Each kind of diagram has its own drawing: components as plates nested in the part that contains them, deployments with each host as a frame around what it runs, classes as cards with their members, and state machines with a start point, double-ringed final states and each transition labelled with what fires it. Pieces of a class diagram that don't touch are laid out separately and packed together; state and deployment diagrams are laid out left to right or top to bottom, whichever is drawn larger.

The behavior views share one layout of facts and tables, except the use case and the user journey, which go through the same drawing as the diagrams. They carry `entities`, where the diagrams carry components, types or states, and `relatedViews`; the page reads both. Knowledge files carry `entities` too, with `title` and `summary` where the views have `name` and `description`, and any field an agent added. The page renders the Markdown in `details` itself, and only the safe part of it: paragraphs, lists, bold, inline code and links; any HTML stays text. A file of a kind it doesn't know is skipped and named in the status line.

The icons are drawn for this page, on a 24-unit grid. A component's icon is chosen from its name (an engine gets a gear, a renderer a screen, a database a cylinder, and so on, with a cube when nothing matches), a deployment node's from its kind and a type's from its kind.

dagre and the Barlow typefaces are loaded from jsDelivr. If dagre can't load, the tables still show everything; without the typefaces the page falls back to system fonts. There is no build step: the page is one HTML file, which the Worker below serves as it is and which also works opened as a plain file, without the sign-in.

## The service

`worker/` is a Cloudflare Worker named `cyberspace-explorer`, on its own domain, `cyberspace-explorer.com`, as a Workers custom domain (`wrangler.jsonc`): Cloudflare creates the DNS record and the certificate when it deploys. It serves `index.html` at `/` and these routes:

| Route | What it does |
| --- | --- |
| `GET /auth/me` | `{ configured, user }`: whether OAuth is set up, and who is signed in. The page uses it to tell a server from a plain file |
| `GET /auth/github/start?return=…&private=1` | Off to GitHub with a random `state` and a PKCE challenge, both bound to this browser by a sealed cookie (10 minutes). `return` must be a path inside the app |
| `GET /auth/github/callback` | Back from GitHub: the state is checked, the code exchanged (with the client secret and the PKCE verifier), the account looked up, and a session cookie set |
| `POST /auth/sign-out` | Forgets the session; only from the app's own origin |
| `GET /api/github/<path>` | GitHub's API with the reader's token, for `user`, `user/repos`, a repository, its trees and its contents only; read only; the token is never sent to the page |

The session is `explorer_session`, `Path=/; HttpOnly; Secure; SameSite=Lax`, 7 days, AES-GCM sealed with a key derived from `SESSION_SECRET`. It has nothing to do with icelander.net's own sign-in: it exists to read GitHub, not to say who the reader is. Without the three secrets below the routes answer that sign-in isn't set up and the page falls back to pasted tokens. Nothing is logged about a sign-in. `npm test` runs the Worker's tests.

### Setting it up once (the owner)

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
3. Add the repository secret `CLOUDFLARE_API_TOKEN` to this repository (**Settings → Secrets and variables → Actions**): an API token with **Account → Workers Scripts: Edit** and **Zone → Workers Routes: Edit** and **Zone → DNS: Edit** for cyberspace-explorer.com. Optionally add a required reviewer to the `production` environment to hold deploys for approval.

## Deploying

`.github/workflows/cyberspace-explorer.yml` tests the Worker on every pull request, and on a push to `main` it tests and then deploys with `wrangler deploy`, then checks that the live page answers. "Run workflow" in the Actions tab redeploys by hand. The icelander.net repository only links to the app, from its Apps page.

## Its own description

The explorer is described in its own `.dev/` folders, and [the explorer shows them](https://cyberspace-explorer.com/?url=https://github.com/david-brandt-the-icelander/cyberspace-explorer): the page in [`.dev/`](.dev) (its vision and stakeholders, the journeys and use cases of the [reader](Actors/reader.md), the states of the page, the token panel and a drawing, its features, capabilities and entrypoints, its parts and where it runs, and its requirements, contracts, design decisions and limitations), the Worker in [`worker/.dev/`](worker/.dev), and the workflow in [`.github/.dev/`](.github/.dev). The [design pass](.dev/backlog.json) item says what to read in what order before changing the design. [AGENTS.md](AGENTS.md) says how agents keep these files, and how to check them.

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

To release, set `version` under `[workspace.package]` in `Cargo.toml`, merge, and push the tag `generator-v<that version>`: the release (`.github/workflows/cyberspace-generator-release.yml`) refuses a tag that does not match. It builds it for macOS and static Linux, both CPU types, and attaches the binaries and `SHA256SUMS` to a GitHub release. It is installed as part of zazzle (`brew install zazzcat/z/zazzle`): software-developers-toolbox's `bump-cyberspace-generator` workflow opens a pull request pinning each new release, and its release includes the binary.
