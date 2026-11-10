# Reader

**Kind:** person in a role
**Evidence:** `software-atlas/index.html` (the page asks for no sign-in: `load` reads whatever repository `?url=` names; `openTokenPanel` and `saveToken` take the reader's own access token for a private repository, kept in their browser)

## What they want from the system

- To see how a repository is put together, what it does and what it knows about itself, without cloning or running it ([use cases](../software-atlas/.dev/use-case.json), `browse-repository`, `inspect-part`, `follow-knowledge`; [journeys](../software-atlas/.dev/user-journey.json), `first-look`).
- To read a private repository with their own access, and nobody else's ([use cases](../software-atlas/.dev/use-case.json), `add-token`; [journeys](../software-atlas/.dev/user-journey.json), `private-repository`).
- To find what is waiting on someone, and to judge how far to trust what agents wrote ([use cases](../software-atlas/.dev/use-case.json), `see-waiting`; [journeys](../software-atlas/.dev/user-journey.json), `review-agent-work`).

## How they reach it

The page at icelander.net/v1/apps/software-atlas in any current browser, on a laptop or a desktop monitor: by giving an address on its landing page, or by opening a link that already carries `?url=` and often a `#` naming a folder, part or record. The page knows nothing about who they are; the repository's host decides what their token can read.

## Not to be confused with

The agents that write the `.dev` files. They work in the repository, not through this page, and the page has no way to tell a reader who is an owner, a developer, a reviewer or a designer apart: all are readers.
