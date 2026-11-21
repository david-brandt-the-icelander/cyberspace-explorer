// Stand-ins for Cloudflare's bindings in tests: D1 over Node's SQLite with the real schema, an R2 bucket in memory, a queue that records what it is sent, and a fetch that answers from a table.

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const SCHEMA = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");

/** A D1 database with the crawler's schema, answering prepare().bind().first()/all()/run() like D1. */
export function d1() {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  const statement = (sql, args = []) => ({
    bind: (...a) => statement(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return { prepare: (sql) => statement(sql), raw: db };
}

/** An R2 bucket in memory. */
export function r2() {
  const objects = new Map();
  const body = (v) => ({ text: async () => (typeof v === "string" ? v : new TextDecoder().decode(v)) });
  return {
    objects,
    get: async (k) => (objects.has(k) ? body(objects.get(k)) : null),
    put: async (k, v) => { objects.set(k, typeof v === "string" ? v : new Uint8Array(v)); },
    delete: async (k) => { for (const key of [].concat(k)) objects.delete(key); },
    list: async ({ prefix = "" } = {}) => ({ objects: [...objects.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false }),
  };
}

/** A queue that keeps what it is sent. */
export function queue() {
  const sent = [];
  return { sent, send: async (body, opts) => { sent.push({ body, opts }); } };
}

/**
 * A fetch answering from `routes`: url → { status, body, headers } or a function of (url, init) returning one.
 * Unknown URLs answer 404. Every call is recorded in `calls`.
 */
export function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, headers: init.headers ?? {} });
    let r = routes[url];
    if (typeof r === "function") r = r(url, init);
    r ??= { status: 404, body: "not found" };
    const body = typeof r.body === "string" ? r.body : r.body === undefined ? "" : JSON.stringify(r.body);
    return new Response(r.status === 304 ? null : body, { status: r.status ?? 200, headers: r.headers ?? {} });
  };
  fn.calls = calls;
  return fn;
}

/** The bindings a scan needs, all fakes. */
export function env(extra = {}) {
  return { DB: d1(), SPACE: r2(), SCANS: queue(), PAUSE_MS: "0", ...extra };
}
