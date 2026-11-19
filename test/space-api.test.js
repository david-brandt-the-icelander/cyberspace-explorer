// The Worker's crawler routes: /admin for the allowed logins only, the admin API, the page's /api/space door, approaches that ask for rescans, and /crawler.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHandler, seal } from "../worker/app.js";
import { isAdmin } from "../worker/space.js";
import { markdown, protocolPage } from "../worker/markdown.js";
import { addressId } from "../crawler/src/address.js";
import * as store from "../crawler/src/store.js";
import { d1, r2, queue } from "../crawler/test/fakes.js";

const SITE = "https://cyberspace-explorer.com";
const base = { GITHUB_CLIENT_ID: "cid", GITHUB_CLIENT_SECRET: "sec", SESSION_SECRET: "s3cret-s3cret", PUBLIC_ORIGIN: SITE, ADMIN_LOGINS: "Owner, second" };
const handle = createHandler("<html>page</html>", async () => new Response("{}"), { admin: "<html>admin</html>", protocol: "<html>protocol</html>" });
const fresh = () => ({ ...base, DB: d1(), SPACE: r2(), SCANS: queue() });
const sessionFor = async (login) => `explorer_session=${await seal({ t: "gho_x", l: login, a: "", x: Date.now() + 3600e3 }, base.SESSION_SECRET)}`;
const call = (env, path, { method = "GET", body, login, origin = SITE } = {}) => (async () => handle(new Request(SITE + path, {
  method, body: body === undefined ? undefined : JSON.stringify(body),
  headers: { ...(login ? { cookie: await sessionFor(login) } : {}), ...(method !== "GET" ? { origin, "content-type": "application/json" } : {}) },
}), env))();

test("admin logins: a list, compared without case", () => {
  assert.equal(isAdmin(base, "owner"), true);
  assert.equal(isAdmin(base, "SECOND"), true);
  assert.equal(isAdmin(base, "someone"), false);
  assert.equal(isAdmin({}, "owner"), false);
});

test("/admin: sends the signed-out to sign in, refuses other logins, serves the page to an admin", async () => {
  const env = fresh();
  const out = await call(env, "/admin");
  assert.equal(out.status, 303);
  assert.equal(out.headers.get("location"), "/auth/github/start?return=%2Fadmin");
  const other = await call(env, "/admin", { login: "someone" });
  assert.equal(other.status, 403);
  assert.match(await other.text(), /someone is signed in but is not allowed/);
  const ok = await call(env, "/admin", { login: "owner" });
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "<html>admin</html>");
  assert.equal(ok.headers.get("x-frame-options"), "DENY");
});

test("admin API: signed in, allowed, and changes only from the page itself", async () => {
  const env = fresh();
  assert.equal((await call(env, "/api/admin/state")).status, 401);
  assert.equal((await call(env, "/api/admin/state", { login: "someone" })).status, 403);
  assert.equal((await call(env, "/api/admin/addresses", { method: "POST", body: { url: "https://festi.is" }, login: "owner", origin: "https://evil.example" })).status, 403);
  const st = await (await call(env, "/api/admin/state", { login: "owner" })).json();
  assert.equal(st.login, "owner");
  assert.equal(st.settings.default_interval_minutes, "1440");
  const noSetup = await call({ ...base }, "/api/admin/state", { login: "owner" });
  assert.equal(noSetup.status, 503);
});

test("admin API: add, refuse a duplicate, change, rescan, stop and remove an address", async () => {
  const env = fresh();
  const add = await call(env, "/api/admin/addresses", { method: "POST", body: { url: "festi.is/um-festi", label: "Festi", maxStaleMinutes: 60 }, login: "owner" });
  assert.equal(add.status, 201);
  const { address } = await add.json();
  assert.equal(address.url, "https://festi.is");
  assert.equal(address.kind, "web");
  assert.equal(address.added_by, "owner");
  assert.equal(address.max_stale_minutes, 60);
  assert.deepEqual(env.SCANS.sent.map((s) => s.body), [{ id: address.id, reason: "admin" }]);
  assert.equal((await call(env, "/api/admin/addresses", { method: "POST", body: { url: "https://festi.is" }, login: "owner" })).status, 409);
  assert.equal((await call(env, "/api/admin/addresses", { method: "POST", body: { url: "ftp://x" }, login: "owner" })).status, 400);
  assert.equal((await call(env, "/api/admin/addresses", { method: "POST", body: { url: "https://n1.is", intervalMinutes: 5 }, login: "owner" })).status, 400, "under 15 minutes");

  const patched = await (await call(env, `/api/admin/addresses/${address.id}`, { method: "PATCH", body: { intervalMinutes: 60, label: "" }, login: "owner" })).json();
  assert.equal(patched.address.interval_minutes, 60);
  assert.equal(patched.address.label, null);
  assert.equal((await (await call(env, `/api/admin/addresses/${address.id}/rescan`, { method: "POST", body: {}, login: "owner" })).json()).queued, false, "still queued from the add");
  await call(env, `/api/admin/addresses/${address.id}`, { method: "PATCH", body: { enabled: false }, login: "owner" });
  assert.equal((await store.address(env.DB, address.id)).enabled, 0);

  await env.SPACE.put(`space/${address.id}/index.json`, "{}");
  assert.equal((await call(env, `/api/admin/addresses/${address.id}`, { method: "DELETE", login: "owner" })).status, 200);
  assert.equal(await store.address(env.DB, address.id), null);
  assert.equal(env.SPACE.objects.size, 0, "its files go too");
  assert.equal((await call(env, `/api/admin/addresses/${address.id}`, { method: "DELETE", login: "owner" })).status, 404);
});

test("admin API: settings are whole numbers within bounds, and only known ones", async () => {
  const env = fresh();
  const ok = await call(env, "/api/admin/settings", { method: "PUT", body: { default_max_stale_minutes: 120, ai_enabled: 0 }, login: "owner" });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).settings.default_max_stale_minutes, "120");
  assert.equal((await call(env, "/api/admin/settings", { method: "PUT", body: { pages_per_scan: 0 }, login: "owner" })).status, 400);
  assert.equal((await call(env, "/api/admin/settings", { method: "PUT", body: { pages_per_scan: 2.5 }, login: "owner" })).status, 400);
  assert.equal((await call(env, "/api/admin/settings", { method: "PUT", body: { secret: 1 }, login: "owner" })).status, 400);
});

test("/api/space: what an explored address has, its view files, nothing for addresses not on the list", async () => {
  const env = fresh();
  const id = await addressId("https://festi.is");
  await store.addAddress(env.DB, { id, url: "https://festi.is", kind: "web", label: "Festi" });
  await env.SPACE.put(`space/${id}/index.json`, JSON.stringify({ source: "well-known", paths: ["component-diagram.json"], stale: [] }));
  await env.SPACE.put(`space/${id}/files/component-diagram.json`, JSON.stringify({ kind: "component" }));
  const info = await (await call(env, `/api/space?url=${encodeURIComponent("https://festi.is/")}`)).json();
  assert.equal(info.id, id);
  assert.equal(info.label, "Festi");
  assert.deepEqual(info.paths, ["component-diagram.json"]);
  assert.equal(info.stale, true, "never scanned");
  const file = await call(env, `/api/space/${id}/files/component-diagram.json`);
  assert.equal(file.status, 200);
  assert.deepEqual(await file.json(), { kind: "component" });
  assert.equal((await call(env, `/api/space/${id}/files/..%2Fsecret.json`)).status, 400);
  assert.equal((await call(env, `/api/space/${id}/files/a/../b.json`)).status, 404, "URL parsing removes the dots, and there is no b.json");
  assert.equal((await call(env, `/api/space?url=https://n1.is`)).status, 404);
  await store.updateAddress(env.DB, id, { enabled: false });
  assert.equal((await call(env, `/api/space?url=https://festi.is`)).status, 404, "an address no longer crawled is not served");
});

test("approach: a stale address is rescanned once, a fresh one is left alone, and only the page may ask", async () => {
  const env = fresh();
  const id = await addressId("https://kronan.is");
  await store.addAddress(env.DB, { id, url: "https://kronan.is", kind: "web", maxStaleMinutes: 60 });
  assert.equal((await call(env, `/api/space/${id}/approach`, { method: "POST", origin: "https://evil.example" })).status, 403);
  const first = await (await call(env, `/api/space/${id}/approach`, { method: "POST" })).json();
  assert.deepEqual(first, { stale: true, rescanning: true });
  const again = await (await call(env, `/api/space/${id}/approach`, { method: "POST" })).json();
  assert.deepEqual(again, { stale: true, rescanning: true }, "already queued: one message, still rescanning");
  assert.equal(env.SCANS.sent.length, 1);
  assert.equal(env.SCANS.sent[0].body.reason, "approach");
  await store.scanFinished(env.DB, id, { source: "inferred", intervalMinutes: 1440 });
  assert.deepEqual(await (await call(env, `/api/space/${id}/approach`, { method: "POST" })).json(), { stale: false, rescanning: false });
});

test("/crawler: the protocol as a page; markdown escapes everything first", async () => {
  const res = await call(fresh(), "/crawler");
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "<html>protocol</html>");
  const page = protocolPage(readFileSync(new URL("../docs/cyberspace-protocol.md", import.meta.url), "utf8"));
  assert.match(page, /<h1>The cyberspace protocol<\/h1>/);
  assert.match(page, /<table>/);
  assert.match(page, /User-agent: cyberspace-crawler/);
  const hostile = markdown("<script>x</script> [a](javascript:alert(1))");
  assert.match(hostile, /^<p>&lt;script&gt;x&lt;\/script&gt; a/);
  assert.doesNotMatch(hostile, /<a |javascript:alert/, "no link to a script");
  assert.match(markdown("[skills](../Meta/x.md)"), /href="https:\/\/github\.com\/david-brandt-the-icelander\/cyberspace-explorer\/blob\/main\/Meta\/x\.md"/);
});
