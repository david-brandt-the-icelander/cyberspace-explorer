// One scan of one address, from the queue: read what changed, write the address's index, and record when to come back.

import { normalize, addressId } from "./address.js";
import { Fetcher } from "./fetcher.js";
import { scanGit } from "./git.js";
import { scanWeb } from "./web.js";
import * as store from "./store.js";

const OVERHEAD = 40; // requests a scan needs besides pages: robots.txt, sitemaps, DNS, RDAP, the well-known file

/** The user agent the crawler sends: its name, version and where to read about it. */
export const userAgent = (env) => env.USER_AGENT ?? "cyberspace-crawler/1.0 (+https://cyberspace-explorer.com/crawler)";

/** Scans the address a queue message names. Returns what happened, for the log. */
export async function runScan(env, msg, { fetchImpl } = {}) {
  const row = await store.address(env.DB, msg.id);
  if (!row) return { id: msg.id, skipped: "unknown address" };
  if (!row.enabled && msg.reason === "schedule") return { id: msg.id, skipped: "disabled" };
  const s = await store.settings(env.DB);
  const interval = row.interval_minutes ?? Number(s.default_interval_minutes ?? 1440);
  await store.scanStarted(env.DB, row.id);
  const fetcher = new Fetcher({ db: env.DB, bucket: env.SPACE, userAgent: userAgent(env), budget: Number(s.pages_per_scan ?? 60) + OVERHEAD, fetchImpl, pause: Number(env.PAUSE_MS ?? 250) });
  const prev = await store.getJson(env.SPACE, `space/${row.id}/index.json`);
  try {
    const index = row.kind === "git"
      ? await scanGit({ fetcher, bucket: env.SPACE, id: row.id, url: row.url, prev, tokens: { "github.com": env.GITHUB_TOKEN, "gitlab.com": env.GITLAB_TOKEN } })
      : await scanWeb({ fetcher, bucket: env.SPACE, id: row.id, url: row.url, prev, from: msg.from ?? 0, addRelated: (url, relation, enabled) => addRelated(env, row, url, relation, enabled) });
    const out = { ...index, id: row.id, scannedAt: new Date().toISOString(), reason: msg.reason, requests: fetcher.used };
    delete out.unchanged;
    await store.putJson(env.SPACE, `space/${row.id}/index.json`, out);
    if (!row.label && index.label) await store.updateAddress(env.DB, row.id, { label: index.label });
    if (index.continueFrom != null) {
      await env.DB.prepare("UPDATE scans SET status = 'queued', queued_at = ? WHERE address_id = ?").bind(new Date().toISOString(), row.id).run();
      await env.SCANS.send({ id: row.id, reason: "continue", from: index.continueFrom }, { delaySeconds: 60 });
      return { id: row.id, continued: index.continueFrom, requests: fetcher.used };
    }
    await store.scanFinished(env.DB, row.id, { source: index.source, head: index.head ?? null, changed: index.changed ?? 0, needsAi: index.needsAi ?? 0, intervalMinutes: interval });
    return { id: row.id, source: index.source, changed: index.changed, requests: fetcher.used };
  } catch (e) {
    await store.scanFailed(env.DB, row.id, e.message ?? e, interval);
    return { id: row.id, failed: String(e.message ?? e) };
  }
}

/** Adds an address a cooperating site named. Its own repository is crawled at once; other related addresses wait, disabled, for the admin to allow them. */
async function addRelated(env, from, raw, relation, enabled) {
  let n;
  try { n = normalize(raw); } catch { return null; }
  const id = await addressId(n.url);
  const added = await store.addAddress(env.DB, { id, url: n.url, kind: n.kind, enabled, by: "crawler", foundVia: from.id });
  if (added && enabled) await store.requestScan(env.DB, env.SCANS, id, "declared");
  return { id, url: n.url, relation, enabled };
}
