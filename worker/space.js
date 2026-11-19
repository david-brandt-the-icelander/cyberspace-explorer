// The explorer's side of the crawler: /admin and its API for the owner, /api/space for the page, and /crawler for
// site owners. Shares the crawler's database, bucket and queue (crawler/README.md); no dependencies of its own.

import { normalize, addressId } from "../crawler/src/address.js";
import * as store from "../crawler/src/store.js";

const SETTINGS = {
  default_interval_minutes: { min: 15, max: 525600 },
  default_max_stale_minutes: { min: 1, max: 5256000 },
  pages_per_scan: { min: 1, max: 500 },
  ai_enabled: { min: 0, max: 1 },
};
const NOT_SET_UP = "The crawler is not set up on this server yet.";
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "private, no-store", "x-content-type-options": "nosniff", ...headers },
});
const ready = (env) => !!(env.DB && env.SPACE && env.SCANS);

/** The GitHub logins allowed into /admin: ADMIN_LOGINS, separated by commas or spaces, compared without case. */
export const adminLogins = (env) => new Set(String(env.ADMIN_LOGINS ?? "").split(/[\s,]+/).filter(Boolean).map((l) => l.toLowerCase()));
export const isAdmin = (env, login) => !!login && adminLogins(env).has(login.toLowerCase());

/** A whole number within a setting's or field's bounds, or undefined for an absent value; throws on anything else. */
function whole(value, { min, max }, name) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be a whole number from ${min} to ${max}.`);
  return n;
}

/** A path under an address's files, refused if it could step out of it. */
const safeFile = (p) => !!p && !p.split("/").some((s) => s === "" || s === "." || s === "..") && /\.json$/.test(p);

/**
 * Routes /admin, /api/admin/*, /api/space* and /crawler; returns null for any other path. `session` is the signed-in
 * reader's session or null; `site` is the app's own origin; `pages` holds the admin page and the protocol page as text.
 */
export async function spaceRoutes(request, env, { path, session, site, pages }) {
  if (path === "/crawler") return new Response(pages.protocol ?? "Not found", { status: pages.protocol ? 200 : 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } });

  if (path === "/admin") {
    if (!session) return new Response(null, { status: 303, headers: { location: "/auth/github/start?return=%2Fadmin", "cache-control": "private, no-store" } });
    if (!isAdmin(env, session.l)) return new Response(`<!doctype html><meta charset="utf-8"><title>Not allowed</title><p>${session.l.replace(/[<&]/g, "")} is signed in but is not allowed into the admin page.</p><p><a href="/">Back to the explorer</a></p>`, { status: 403, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" } });
    return new Response(pages.admin, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "same-origin" } });
  }

  if (path.startsWith("/api/admin/")) {
    if (!session) return json({ error: "Not signed in." }, 401);
    if (!isAdmin(env, session.l)) return json({ error: "Not allowed." }, 403);
    if (request.method !== "GET" && request.headers.get("origin") !== site) return json({ error: "Only from the admin page." }, 403);
    if (!ready(env)) return json({ error: NOT_SET_UP }, 503);
    try { return await admin(request, env, path.slice("/api/admin/".length), session.l); }
    catch (e) { return json({ error: e.message }, 400); }
  }

  if (path === "/api/space" || path.startsWith("/api/space/")) {
    if (!ready(env)) return json({ error: NOT_SET_UP }, 503);
    return space(request, env, path, site);
  }
  return null;
}

/** The admin API: the state, adding, changing, removing and rescanning addresses, and the settings. */
async function admin(request, env, rest, login) {
  const m = request.method, body = m === "GET" || m === "DELETE" ? {} : await request.json().catch(() => { throw new Error("Send JSON."); });
  if (rest === "state" && m === "GET") {
    const [settings, addresses] = await Promise.all([store.settings(env.DB), store.addresses(env.DB)]);
    return json({ login, settings, addresses });
  }
  if (rest === "settings" && m === "PUT") {
    for (const [k, v] of Object.entries(body)) {
      if (!(k in SETTINGS)) throw new Error(`Unknown setting ${k}.`);
      const n = whole(v, SETTINGS[k], k);
      if (n == null) throw new Error(`${k} needs a value.`);
      await store.setSetting(env.DB, k, n);
    }
    return json({ settings: await store.settings(env.DB) });
  }
  if (rest === "addresses" && m === "POST") {
    const n = normalize(body.url ?? "");
    const id = await addressId(n.url);
    const added = await store.addAddress(env.DB, {
      id, url: n.url, kind: n.kind, label: typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 120) : null, by: login,
      intervalMinutes: whole(body.intervalMinutes, { min: 15, max: 525600 }, "intervalMinutes") ?? null,
      maxStaleMinutes: whole(body.maxStaleMinutes, { min: 1, max: 5256000 }, "maxStaleMinutes") ?? null,
    });
    if (!added) return json({ error: `${n.url} is on the list already.`, id }, 409);
    await store.requestScan(env.DB, env.SCANS, id, "admin");
    return json({ address: await store.address(env.DB, id) }, 201);
  }
  const one = rest.match(/^addresses\/([0-9a-f]{20})(\/rescan)?$/);
  if (one) {
    const id = one[1];
    if (!(await store.address(env.DB, id))) return json({ error: "No such address." }, 404);
    if (one[2] && m === "POST") return json({ queued: await store.requestScan(env.DB, env.SCANS, id, "admin") });
    if (!one[2] && m === "PATCH") {
      await store.updateAddress(env.DB, id, {
        label: body.label === undefined ? undefined : (String(body.label ?? "").trim().slice(0, 120) || null),
        enabled: body.enabled === undefined ? undefined : !!body.enabled,
        intervalMinutes: whole(body.intervalMinutes, { min: 15, max: 525600 }, "intervalMinutes"),
        maxStaleMinutes: whole(body.maxStaleMinutes, { min: 1, max: 5256000 }, "maxStaleMinutes"),
      });
      return json({ address: await store.address(env.DB, id) });
    }
    if (!one[2] && m === "DELETE") { await store.removeAddress(env.DB, env.SPACE, id); return json({ removed: id }); }
  }
  return json({ error: "No such admin request." }, 404);
}

/** The page's door to the crawler: what an address has, its view files, and the approach that asks for a rescan. */
async function space(request, env, path, site) {
  const m = request.method;
  if (path === "/api/space" && m === "GET") {
    let n;
    try { n = normalize(new URL(request.url).searchParams.get("url") ?? ""); } catch (e) { return json({ error: e.message }, 400); }
    const id = await addressId(n.url);
    const row = await store.address(env.DB, id);
    if (!row?.enabled) return json({ error: `${n.url} is not one of the addresses this server explores.`, url: n.url }, 404);
    const [index, settings] = await Promise.all([store.getJson(env.SPACE, `space/${id}/index.json`), store.settings(env.DB)]);
    return json({
      id, url: row.url, kind: row.kind, label: row.label ?? index?.label ?? null, status: row.status, source: index?.source ?? null,
      scannedAt: row.finished_at, stale: store.isStale(row, settings), paths: index?.paths ?? [], staleViews: index?.stale ?? [],
      needsAi: !!row.needs_ai, head: index?.head ?? null,
    });
  }
  const file = path.match(/^\/api\/space\/([0-9a-f]{20})\/files\/(.+)$/);
  if (file && m === "GET") {
    const rel = file[2].split("/").map((s) => { try { return decodeURIComponent(s); } catch { return ".."; } }).join("/");
    if (!safeFile(rel)) return json({ error: "Not a view file." }, 400);
    const row = await store.address(env.DB, file[1]);
    if (!row?.enabled) return json({ error: "Not explored here." }, 404);
    const o = await env.SPACE.get(`space/${file[1]}/files/${rel}`);
    if (!o) return json({ error: "No such view." }, 404);
    return new Response(await o.text(), { headers: { "content-type": "application/json", "cache-control": "public, max-age=60", "x-content-type-options": "nosniff" } });
  }
  const near = path.match(/^\/api\/space\/([0-9a-f]{20})\/approach$/);
  if (near && m === "POST") {
    if (request.headers.get("origin") !== site) return json({ error: "Only from the explorer." }, 403);
    const row = await store.address(env.DB, near[1]);
    if (!row?.enabled) return json({ error: "Not explored here." }, 404);
    const stale = store.isStale(row, await store.settings(env.DB));
    const rescanning = stale ? await store.requestScan(env.DB, env.SCANS, row.id, "approach") || row.status === "queued" || row.status === "scanning" : false;
    return json({ stale, rescanning });
  }
  return json({ error: "No such request." }, 404);
}
