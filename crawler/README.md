# cyberspace-crawler

The part of the cyberspace explorer that goes out and reads. It keeps a list of addresses, which are git repositories and websites. It visits each one on a schedule, or sooner when a player approaches it in Cyberspace and its data is too old. It collects what the explorer needs to draw it. The explorer's Worker (`../worker`) serves what it collected, and runs `/admin`, where the list and the schedule are edited.

It is a Cloudflare Worker of its own, with no public routes:

- **A schedule** (every ten minutes) puts the addresses whose interval has passed on the scan queue.
- **The scan queue** (`cyberspace-scans`) holds one message per scan: from the schedule, from `/admin`, from a player approaching a stale address, or from a scan that ran out of requests and continues where it stopped.
- **D1** (`cyberspace`) holds the addresses, their scan state, the settings and the HTTP cache state of every URL fetched (`schema.sql`).
- **R2** (`cyberspace`) holds, under `space/<address id>/`:
  - `index.json`: what the explorer reads first;
  - `files/`: the address's views;
  - `raw/`: what was collected for the AI step.

  The bodies of the HTTP cache are under `fetch/`.

## How each kind of address is read

**Git repositories** (github.com, gitlab.com) are read through the host's API. A scan first asks for the head commit, with a conditional request that GitHub doesn't count against the rate limit when nothing changed. If the head is the one read last time, the scan stops there. Otherwise the compare endpoint says which files changed since then, and only changed views are read again. Views whose cited sources changed are listed as `stale`. A repository with no `.dev` folders or `.cyberspace-explorer/` tree is summarised for the AI step instead: its layout, README and manifests.

**Websites** are read as [docs/cyberspace-protocol.md](../docs/cyberspace-protocol.md) describes:
- `/.well-known/cyberspace.json` first. A site that publishes it is shown as it describes itself.
- Otherwise robots.txt, its sitemaps, the front page, a sample of each section's pages, DNS and RDAP.

Every request goes through `src/fetcher.js`, which does four things:
- obeys robots.txt;
- honours `Cache-Control`, `Expires`, `ETag` and `Last-Modified`, and revalidates instead of refetching;
- spaces requests to one host;
- stops at a budget of requests per run (`pages_per_scan` plus an allowance for robots.txt, sitemaps, DNS and RDAP). A site that needs more continues in a later run from where it stopped.

## The AI step

A scan that collected something new queues an `ai` message for the same address, if `ai_enabled` is on and `ANTHROPIC_API_KEY` is set. That message runs `src/ai.js`, which asks Claude Haiku 5.5 (`AI_MODEL`) small questions, each answered against a JSON schema:

- **A website section:**
  - **Input:** its path, its size, sample URLs, and the title, headings, description and first 900 characters of up to three of its pages, with the site's menus and footers removed.
  - **Output:** what it is for, who it is for, what a visitor does there, what data they hand over, whether it is still alive, and its topics. This is the classification scheme tried on the Festi group.
- **A repository without views:** its main parts, from its layout, README and manifests.

Each answer is kept with a hash of its input, so a section whose pages didn't change is not asked about again. Sections a site lists under `noAi` are never sent. A refused or cut-off answer skips that item; a rate limit sends the message back to the queue.

The views are then written by code (`src/views.js`), not by the model, so they always follow the skills:
- a component diagram of the site's sections on zones, with the outside services their pages load;
- a deployment diagram of where it runs, from DNS, mail and the hosts its pages load from;
- a folder record per section that carries its reading.

Cyberspace uses those readings to shape each section's building.

## Settings

Changed from `/admin`, stored in the `settings` table:

| Key | Default | Meaning |
| --- | --- | --- |
| `default_interval_minutes` | 1440 | How often an address is rescanned, unless it has its own interval |
| `default_max_stale_minutes` | 10080 | How old an address's data may be when a player approaches it before a rescan is asked for, unless it has its own limit |
| `pages_per_scan` | 60 | Pages read from a website in one run |
| `ai_enabled` | 1 | Whether the AI step turns collected metadata into views |

## Setting it up once (the owner)

The crawler needs Workers Paid for Queues. Run these from the repository root.

1. Create the database, the bucket and the queues. The first command prints the database id: put it in `crawler/wrangler.jsonc` and `wrangler.jsonc`, in place of `REPLACE-WITH-D1-DATABASE-ID`.

   ```bash
   npx wrangler@4.156.1 d1 create cyberspace
   ```

   ```bash
   npx wrangler@4.156.1 r2 bucket create cyberspace
   ```

   ```bash
   npx wrangler@4.156.1 queues create cyberspace-scans
   ```

   ```bash
   npx wrangler@4.156.1 queues create cyberspace-scans-failed
   ```

2. Create the tables:

   ```bash
   npx wrangler@4.156.1 d1 execute cyberspace --remote --file crawler/schema.sql -c crawler/wrangler.jsonc
   ```

3. Give the repository secret `CLOUDFLARE_API_TOKEN` these permissions as well: **Account → D1: Edit**, **Account → Workers R2 Storage: Edit** and **Account → Queues: Edit**.
4. Set the crawler's secrets (after its first deploy). `ANTHROPIC_API_KEY` is needed for the AI step; the two tokens are optional, read-only, and only raise the hosts' rate limits.

   ```bash
   npx wrangler@4.156.1 secret put ANTHROPIC_API_KEY -c crawler/wrangler.jsonc
   ```

   ```bash
   npx wrangler@4.156.1 secret put GITHUB_TOKEN -c crawler/wrangler.jsonc
   ```

## Tests

`npm test` at the repository root runs `test/crawler.test.js` with the explorer's tests. The tests run the real SQL schema on Node's built-in SQLite, and use an R2 bucket in memory, a queue that records what it is sent, and a fake fetch (`test/fakes.js`). No test reaches the network.
