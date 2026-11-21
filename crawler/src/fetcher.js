// Fetching politely: an honest user agent, robots.txt obeyed, HTTP caching honoured, and a budget of requests per scan.

import { freshness, isFresh, conditional } from "./httpcache.js";
import { parseRobots, allowed } from "./robots.js";

/** Thrown when a scan has used its requests; the scan saves its place and continues in a later run. */
export class BudgetSpent extends Error {}

const sha256 = async (bytes) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
const MAX_BODY = 5 * 1024 * 1024;

export class Fetcher {
  /** `db` and `bucket` keep the HTTP cache; `budget` is how many network requests this scan may make. */
  constructor({ db, bucket, userAgent, budget = 200, fetchImpl = (...a) => fetch(...a), pause = 250, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
    Object.assign(this, { db, bucket, userAgent, budget, fetchImpl, pause, sleep });
    this.robots = new Map();
    this.used = 0;
    this.lastHit = new Map();
  }

  /** The parsed robots.txt of an origin (fetched through the cache; a missing or failing file allows everything). */
  async robotsFor(origin) {
    if (!this.robots.has(origin)) {
      const r = await this.get(`${origin}/robots.txt`, { robots: false });
      this.robots.set(origin, parseRobots(r.status === 200 ? r.text : "", this.userAgent));
    }
    return this.robots.get(origin);
  }

  /**
   * Fetches a URL. Returns { status, text, changed, cached, headers } where status 0 means a network failure and
   * 'disallowed' means robots.txt says no. A fresh cached copy is returned without a request; a stale one is revalidated.
   */
  async get(url, { robots = true, headers = {}, maxBytes = MAX_BODY } = {}) {
    const u = new URL(url);
    if (robots && !allowed(await this.robotsFor(u.origin), u.pathname + u.search)) return { status: "disallowed", text: null, changed: false, cached: false };
    const row = await this.db.prepare("SELECT * FROM fetches WHERE url = ?").bind(url).first();
    if (row && isFresh(row) && row.body_key && row.status === 200) {
      const o = await this.bucket.get(row.body_key);
      if (o) return { status: 200, text: await o.text(), changed: false, cached: true };
    }
    if (this.used >= this.budget) throw new BudgetSpent(`request budget of ${this.budget} spent`);
    this.used++;
    const last = this.lastHit.get(u.host) ?? 0;
    const wait = last + this.pause - Date.now();
    if (wait > 0) await this.sleep(wait);
    this.lastHit.set(u.host, Date.now());
    let res;
    try {
      res = await this.fetchImpl(url, { headers: { "user-agent": this.userAgent, ...conditional(row), ...headers }, redirect: "follow" });
    } catch (e) {
      return { status: 0, text: null, changed: false, cached: false, error: String(e) };
    }
    const f = freshness(res.headers);
    if (res.status === 304 && row?.body_key) {
      await this.db.prepare("UPDATE fetches SET fresh_until = ?, fetched_at = ? WHERE url = ?").bind(f.freshUntil, new Date().toISOString(), url).run();
      const o = await this.bucket.get(row.body_key);
      return { status: 200, text: o ? await o.text() : null, changed: false, cached: true, headers: res.headers };
    }
    const buf = await res.arrayBuffer();
    const bytes = buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf;
    const hash = await sha256(bytes);
    const changed = res.status !== row?.status || hash !== row?.body_hash;
    const key = f.noStore || res.status !== 200 ? null : `fetch/${await sha256(new TextEncoder().encode(url))}`;
    if (key) await this.bucket.put(key, bytes);
    await this.db.prepare(
      `INSERT INTO fetches (url, status, etag, last_modified, fresh_until, no_store, body_key, body_hash, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(url) DO UPDATE SET status = excluded.status, etag = excluded.etag, last_modified = excluded.last_modified, fresh_until = excluded.fresh_until,
         no_store = excluded.no_store, body_key = excluded.body_key, body_hash = excluded.body_hash, fetched_at = excluded.fetched_at`)
      .bind(url, res.status, f.etag, f.lastModified, f.freshUntil, f.noStore ? 1 : 0, key, hash, new Date().toISOString()).run();
    return { status: res.status, text: new TextDecoder().decode(bytes), changed, cached: false, headers: res.headers };
  }

  /** Fetches and parses JSON; null unless the answer is 200 and valid JSON. */
  async json(url, opts) {
    const r = await this.get(url, opts);
    if (r.status !== 200 || r.text == null) return { ...r, data: null };
    try { return { ...r, data: JSON.parse(r.text) }; } catch { return { ...r, data: null }; }
  }
}
