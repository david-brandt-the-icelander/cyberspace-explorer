# Website

**Kind:** external system with goals of its own
**Evidence:** `crawler/src/web.js` (`scanWeb` reads a site's `/.well-known/cyberspace.json`, robots.txt, sitemaps and pages; `declared` takes what a cooperating site says about itself), `crawler/src/robots.js` (`parseRobots`, `allowed`: the site decides what the crawler may read), `crawler/src/httpcache.js` (`freshness`: the site's caching headers decide how often it is read again), `crawler/src/wellknown.js` (`readDeclaration`, `noAi`)

## What they want from the system

- To be shown as they describe themselves, when they publish `/.well-known/cyberspace.json`: their own views, the repository that describes them and the addresses they belong with ([contracts](../crawler/.dev/contracts.json), `well-known`; [protocol](../docs/cyberspace-protocol.md)).
- To keep the crawler out of what they don't want read, and away from model reading altogether for some sections (robots.txt for the crawler, `noAi` for the AI step) ([decisions](../crawler/.dev/decisions.json), `robots-and-budget`, `no-ai-sections`).
- Not to be loaded more than their caching allows ([decisions](../crawler/.dev/decisions.json), `client-caching`).

## How they reach it

They don't call the crawler. The crawler calls them, over HTTPS, with the user agent `cyberspace-crawler/1.0 (+https://cyberspace-explorer.com/crawler)`. They answer through what they serve: the well-known file, robots.txt, caching headers, sitemaps and pages, or a refusal such as 403, which the crawler takes as final.

## Not to be confused with

The repositories the crawler reads. Those are read through GitHub's or GitLab's API, which is infrastructure the crawler uses, not an actor. A website that names a repository in its well-known file is still the actor; the repository is what it points to.
