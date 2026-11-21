# Admin

**Kind:** person in a role
**Evidence:** `worker/space.js` (`isAdmin` lets in a user signed in to icelander.net who holds the role `explorer:admin`; `spaceRoutes` serves `/admin` and the admin API only to them), `worker/app.js` (`createHandler` asks the login service who is signed in), `worker/admin.html` (the page they use)

## What they want from the system

- To choose what the crawler explores: add repositories and websites, stop crawling or remove one, and allow the addresses cooperating sites suggest ([contracts](../worker/.dev/contracts.json), `admin-api`; [decisions](../crawler/.dev/decisions.json), `related-wait`).
- To set how often each address is rescanned and how old its data may be when a player approaches it ([contracts](../worker/.dev/contracts.json), `admin-api`; [configuration](../crawler/.dev/configuration.json), `default-interval`, `default-max-stale`).
- To see what the crawler did with each address: its status, last and next scan, where its views came from, and why a scan failed.

## How they reach it

`https://cyberspace-explorer.com/admin` in a browser, after signing in to icelander.net (its login service, app `explorer`). The Worker knows them by that sign-in, never by the explorer's GitHub OAuth App, which only reads repositories. Who holds `explorer:admin` is set in the login service (its owners hold every role; anyone else is granted it on its admin page), not something the explorer's admin page can change.

## Not to be confused with

The [reader](reader.md). An admin is also a reader, with the same sign-in. What makes them an admin is the role `explorer:admin`, and the Worker asks the login service for it on every admin request. A reader approaching an address in Cyberspace can trigger a rescan, but only within the staleness limits the admin set.
