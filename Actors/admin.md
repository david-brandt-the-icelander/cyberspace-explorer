# Admin

**Kind:** person in a role
**Evidence:** `worker/space.js` (`isAdmin` lets in a signed-in GitHub login named in `ADMIN_LOGINS`; `spaceRoutes` serves `/admin` and the admin API only to them), `wrangler.jsonc` (`ADMIN_LOGINS`), `worker/admin.html` (the page they use)

## What they want from the system

- To choose what the crawler explores: add repositories and websites, stop crawling or remove one, and allow the addresses cooperating sites suggest ([contracts](../worker/.dev/contracts.json), `admin-api`; [decisions](../crawler/.dev/decisions.json), `related-wait`).
- To set how often each address is rescanned and how old its data may be when a player approaches it ([contracts](../worker/.dev/contracts.json), `admin-api`; [configuration](../crawler/.dev/configuration.json), `default-interval`, `default-max-stale`).
- To see what the crawler did with each address: its status, last and next scan, where its views came from, and why a scan failed.

## How they reach it

`https://cyberspace-explorer.com/admin` in a browser, after signing in with GitHub through the explorer's own sign-in. The Worker knows them only by their GitHub login; the list of allowed logins is a setting of the Worker, not something the admin page can change.

## Not to be confused with

The [reader](reader.md). An admin is also a reader, with the same sign-in. What makes them an admin is their login being in `ADMIN_LOGINS`, and the Worker checks that on every admin request. A reader approaching an address in Cyberspace can trigger a rescan, but only within the staleness limits the admin set.
