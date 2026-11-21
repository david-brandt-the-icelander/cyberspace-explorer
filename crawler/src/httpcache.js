// HTTP caching as a client: how long a response stays fresh (RFC 9111) and the conditional headers that revalidate it.

const HEURISTIC_SHARE = 0.1;            // RFC 9111 section 4.2.2: a tenth of the time since Last-Modified
const HEURISTIC_MAX = 24 * 3600 * 1000;  // never more than a day by heuristic
const NO_INFO = 0;                       // no validators and no lifetime: stale at once

/** The directives of a Cache-Control header, lower-cased, with their values. */
export function directives(header) {
  const out = {};
  for (const part of (header ?? "").split(",")) {
    const [k, v] = part.trim().split("=");
    if (k) out[k.toLowerCase()] = v === undefined ? true : v.replace(/^"|"$/g, "");
  }
  return out;
}

/** How a response may be kept: until when it is fresh, whether it may be stored, and its validators. `now` is a Date. */
export function freshness(headers, now = new Date()) {
  const get = (k) => headers.get(k);
  const cc = directives(get("cache-control"));
  const noStore = !!cc["no-store"];
  const validators = { etag: get("etag"), lastModified: get("last-modified") };
  let lifetime;
  if (cc["no-cache"] || noStore) lifetime = 0;
  else if (cc["s-maxage"] !== undefined) lifetime = Number(cc["s-maxage"]) * 1000;
  else if (cc["max-age"] !== undefined) lifetime = Number(cc["max-age"]) * 1000;
  else if (get("expires")) {
    const exp = Date.parse(get("expires")), date = Date.parse(get("date") ?? "") || now.getTime();
    lifetime = Number.isFinite(exp) ? Math.max(0, exp - date) : 0;
  } else if (validators.lastModified) {
    const lm = Date.parse(validators.lastModified), date = Date.parse(get("date") ?? "") || now.getTime();
    lifetime = Number.isFinite(lm) ? Math.min(HEURISTIC_MAX, Math.max(0, (date - lm) * HEURISTIC_SHARE)) : NO_INFO;
  } else lifetime = NO_INFO;
  if (!Number.isFinite(lifetime) || lifetime < 0) lifetime = 0;
  const age = Number(get("age")) * 1000 || 0;
  return {
    freshUntil: new Date(now.getTime() + Math.max(0, lifetime - age)).toISOString(),
    noStore,
    etag: validators.etag,
    lastModified: validators.lastModified,
  };
}

/** Whether a stored fetch is still fresh at `now`. */
export const isFresh = (row, now = new Date()) => !!row?.fresh_until && Date.parse(row.fresh_until) > now.getTime();

/** The headers that ask the server only for a changed body. */
export function conditional(row) {
  const h = {};
  if (row?.etag) h["if-none-match"] = row.etag;
  if (row?.last_modified) h["if-modified-since"] = row.last_modified;
  return h;
}
