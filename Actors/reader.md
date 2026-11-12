# Reader

**Kind:** person in a role
**Evidence:** `index.html` (`load` reads whatever repository `?url=` names, with no sign-in; `openTokenPanel` and `saveToken` take the reader's own access token for a private repository, kept in their browser; `showSignIn` offers an optional GitHub sign-in), `worker/app.js` (`callback`: a signed-in reader is a GitHub account, known by its login and avatar in the sealed session; `session`)

## What they want from the system

- To see how a repository is put together, what it does and what it knows about itself, without cloning or running it ([use cases](../.dev/use-case.json), `browse-repository`, `inspect-part`, `follow-knowledge`; [journeys](../.dev/user-journey.json), `first-look`).
- To read a private repository with their own access, and nobody else's ([use cases](../.dev/use-case.json), `add-token`, `sign-in-with-github`; [journeys](../.dev/user-journey.json), `private-repository`, `signed-in-on-github`).
- To open their own repositories without copying addresses ([use cases](../.dev/use-case.json), `sign-in-with-github`; [features](../.dev/feature.json), `github-sign-in`).
- To find what is waiting on someone, and to judge how far to trust what agents wrote ([use cases](../.dev/use-case.json), `see-waiting`; [journeys](../.dev/user-journey.json), `review-agent-work`).

## How they reach it

The page at cyberspace-explorer.com in any current browser, on a laptop or a desktop monitor: by giving an address on its landing page, by picking one of their repositories once signed in with GitHub, or by opening a link that already carries `?url=` and often a `#` naming a folder, part or record. The same page also works opened as a plain file, without the sign-in. The page knows nothing about who they are beyond a GitHub login when they sign in; the repository's host decides what their token or sign-in can read.

## Not to be confused with

The agents that write the `.dev` files. They work in the repository, not through this page, and the page has no way to tell a reader who is an owner, a developer, a reviewer or a designer apart: all are readers, signed in or not.
