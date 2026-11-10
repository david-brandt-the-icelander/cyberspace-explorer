# Software system browser

A static web page that shows a repository's architecture and behavior from the JSON views in its `.dev/` folders. Four are diagrams, described by the skills in [Agents/Skills](../Agents/Skills/README.md): component, class, state and deployment. Four describe behavior, with skills of their own: [use-case](../Agents/Skills/describe-use-case/skill.md), [capability](../Agents/Skills/describe-capability/skill.md), [feature](../Agents/Skills/describe-feature/skill.md) and [operation](../Agents/Skills/describe-operation/skill.md). A folder can have any mix of them. A public repository needs nothing; a private one needs an access token, which stays in the reader's browser.

Live at <https://icelander.net/v1/apps/architecture-browser>. For example, [retro-games](https://icelander.net/v1/apps/architecture-browser?url=https://github.com/david-brandt-the-icelander/retro-games).

## Using it

- Open the page and give the address of a repository, or of a folder in one. After that the address field is gone: the page shows that repository until the address changes.
- Signing in with GitHub is optional. Paste a personal access token under "Sign in with GitHub" (a static page can't complete GitHub's OAuth flow, which needs a client secret) and your repositories fill a drop-down on the address box, listed by last update, oldest first (`OLDEST_FIRST` in the page flips it). The box doubles as the filter: type part of a name, or paste a GitHub address and the list narrows to that owner/repository. Pick one, or paste any address and press Browse. The token is kept like any other, for all of github.com, so it also opens private repositories.
- Or pass the address in the query string: `?url=https://github.com/owner/repo`. It takes a repository, a branch or tag (`/tree/<ref>`, slashes in the name included) and a folder (`/tree/<ref>/<folder>`).
- A private repository, or one behind a rate limit, answers with an error and a button beside it: open the panel, paste an access token and the page reloads with it. GitHub wants a fine-grained token with Contents: read, GitLab one with the `read_api` scope. The token is kept for the tab, or on the browser if you ask, under the host it belongs to, and is only ever sent there, so a GitHub token can never reach a self-hosted GitLab.
- There can be a token per account. When you add one you choose what it is for: every repository on the host, everything under an owner or group, or one repository. A repository uses the narrowest token that covers it, so tokens for several accounts on one host can be kept side by side. The bar shows when one is in use, and its panel lists every token kept, marks the one in use and forgets any of them.
- The left column lists the folders that have diagrams, as a tree; the small icons after each name are the kinds of diagram there, and the filter above it narrows the tree by folder, diagram or part name. The address of a folder's view ends in `#<folder>`, so it can be linked to.
- A folder shows one kind of view at a time. The tabs above the content name each kind the folder has, and how many of it; the kind you are reading stays chosen when you move to a folder that has it too. A drawing is laid out the first time its tab is opened, and a link to a part or a view opens the tab it is in.
- The diagrams are the way around. A part with a round badge stands for a folder that has diagrams of its own (a sub-component, the folder an artifact is built from, the folder that declares an external type): click it to open that folder. Any other part opens a panel with everything the diagram says about it, with its relationships as links to the parts at their other ends. Hovering a part lights up its neighbours; hovering a line says what the relationship is.
- Drag a drawing to move it, use ⌘ or Ctrl with the scroll wheel (or a pinch) to zoom, and the buttons in its corner to zoom or fit it again.
- A use case is drawn as its steps in order, people and outside systems apart from the system's own steps, with each alternative branching off its step as a dashed outcome. Click a step for its sources and the steps around it.
- Capabilities, features and operations are written, not drawn: a card per capability, feature or use case (responsibility, access, behavior, outcome, constraints, the actor and goal), and a table of operations (action, entrypoint, authorization, result and what can make it fail). Each links to the source symbol it was read from.
- Every view lists its related views, as links that open the other view in its own folder, which is the way from a feature to the operations and capability that implement it.
- Under each drawing, the view is listed in full: its parts, its relationships or transitions, and the source files it cites, linked to the repository.

## How it works

Everything runs in the browser. For GitHub it lists the repository with one call to the GitHub API (the default branch, then the recursive tree) and reads each `.dev/*.json` file from `raw.githubusercontent.com`. Unauthenticated, the GitHub API allows 60 requests an hour per address, and a page load uses two; a token raises that to 5,000. With a token the files are read through the API instead, with `Accept: application/vnd.github.raw`, because `raw.githubusercontent.com` turns away an `Authorization` header at CORS. For GitLab it uses the GitLab API's repository tree and raw file endpoints, which take the token as a `PRIVATE-TOKEN` header. Other hosts are not supported: a plain git server can't be listed from a browser.

The page draws the diagrams itself, as SVG. [dagre](https://github.com/dagrejs/dagre) 3.1.3 places the parts; everything else (the shapes, the lines, the labels and the icons) is in the page. Each kind of diagram has its own drawing: components as plates nested in the part that contains them, deployments with each host as a frame around what it runs, classes as cards with their members, and state machines with a start point, double-ringed final states and each transition labelled with what fires it. Pieces of a class diagram that don't touch are laid out separately and packed together; state and deployment diagrams are laid out left to right or top to bottom, whichever is drawn larger.

The four behavior views share one layout of facts and tables, except the use case, which goes through the same drawing as the diagrams. They carry `entities`, where the diagrams carry components, types or states, and `relatedViews`; the page reads both. A view of a kind it doesn't know is skipped and named in the status line.

The icons are drawn for this page, on a 24-unit grid. A component's icon is chosen from its name (an engine gets a gear, a renderer a screen, a database a cylinder, and so on, with a cube when nothing matches), a deployment node's from its kind and a type's from its kind.

dagre and the Barlow typefaces are loaded from jsDelivr. If dagre can't load, the tables still show everything; without the typefaces the page falls back to system fonts. There is no build step and no server: it is one HTML file.

## Publishing

`index.html` is the source. The copy on icelander.net is `site/apps/architecture-browser.html` in the icelander.net repository, served at `/v1/apps/architecture-browser`; update it by copying this file there and deploying the site.
