// The Worker's crawler routes: /admin for icelander.net's explorer:admin role only, the admin API, the page's /api/space door, approaches that ask for rescans, and /crawler.

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
// The login service, as the ACCOUNTS binding answers for app "explorer": who a session is, with this app's roles.
const JWKS = JSON.stringify({ keys: [{ kty: "OKP", crv: "Ed25519", kid: "k2026a", x: "WIEomi0LTalJvQndhD7abl8ty3YcliQ0vEz4XjLXayc" }] });
const person = (name, roles) => ({ id: `a-${name}`, email: `${name}@example.com`, emails: [`${name}@example.com`], name, picture: null, roles: ["explorer:play", ...roles], via: "provider" });
const people = { owner: person("owner", ["explorer:admin"]), someone: person("someone", []) };
const PAD = "s".repeat(24);
const ACCOUNTS = { session: async (value, app) => (app === "explorer" ? people[value.slice(PAD.length)] ?? null : null) };
const base = { GITHUB_CLIENT_ID: "cid", GITHUB_CLIENT_SECRET: "sec", SESSION_SECRET: "s3cret-s3cret", PUBLIC_ORIGIN: SITE, ACCOUNTS, ACCOUNTS_JWKS: JWKS };
const handle = createHandler("<html>page</html>", async () => new Response("{}"), { admin: "<html>admin</html>", protocol: "<html>protocol</html>" });
const fresh = (extra = {}) => ({ ...base, DB: d1(), SPACE: r2(), SCANS: queue(), ...extra });
const call = (env, path, { method = "GET", body, login, cookie, origin = SITE } = {}) => handle(new Request(SITE + path, {
  method, body: body === undefined ? undefined : JSON.stringify(body),
  headers: { ...(login ? { cookie: `explorer_identity=${PAD}${login}` } : cookie ? { cookie } : {}), ...(method !== "GET" ? { origin, "content-type": "application/json" } : {}) },
}), env);

test("admins: the login service's role explorer:admin, nothing else", () => {
  assert.equal(isAdmin(people.owner), true);
  assert.equal(isAdmin(people.someone), false);
  assert.equal(isAdmin(null), false);
  assert.equal(isAdmin({ ...people.someone, name: "explorer:admin", email: "explorer:admin@example.com" }), false);
});

test("/admin: sends the signed-out to icelander.net's sign-in, refuses users without the role, serves the page to an admin", async () => {
  const env = fresh();
  const out = await call(env, "/admin");
  assert.equal(out.status, 302);
  assert.equal(out.headers.get("location"), "/identity/auth/sign-in?return=%2Fadmin");
  const other = await call(env, "/admin", { login: "someone" });
  assert.equal(other.status, 403);
  assert.match(await other.text(), /someone@example\.com is signed in but is not allowed/);
  const ok = await call(env, "/admin", { login: "owner" });
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "<html>admin</html>");
  assert.equal(ok.headers.get("x-frame-options"), "DENY");
});

test("/admin: a GitHub session says nothing about who the reader is, and without the login service nobody gets in", async () => {
  const github = `explorer_session=${await seal({ t: "gho_x", l: "david-brandt-the-icelander", a: "", x: Date.now() + 3600e3 }, base.SESSION_SECRET)}`;
  assert.equal((await call(fresh(), "/admin", { cookie: github })).status, 302);
  assert.equal((await call(fresh(), "/api/admin/state", { cookie: github })).status, 401);
  const noService = fresh({ ACCOUNTS: undefined });
  assert.equal((await call(noService, "/admin", { login: "owner" })).status, 302, "fails closed");
  assert.equal((await call(noService, "/api/admin/state", { login: "owner" })).status, 401);
});

test("admin API: signed in, allowed, and changes only from the page itself", async () => {
  const env = fresh();
  assert.equal((await call(env, "/api/admin/state")).status, 401);
  assert.equal((await call(env, "/api/admin/state", { login: "someone" })).status, 403);
  assert.equal((await call(env, "/api/admin/addresses", { method: "POST", body: { url: "https://festi.is" }, login: "owner", origin: "https://evil.example" })).status, 403);
  const st = await (await call(env, "/api/admin/state", { login: "owner" })).json();
  assert.deepEqual(st.user, { name: "owner", email: "owner@example.com" });
  assert.equal(st.settings.default_interval_minutes, "1440");
  const noSetup = await call({ ...base }, "/api/admin/state", { login: "owner" });
  assert.equal(noSetup.status, 503);
});

test("with REQUIRE_SIGN_IN on, the page's /api/space needs the sign-in too; /crawler and /admin are as they were", async () => {
  const env = fresh({ REQUIRE_SIGN_IN: "true" });
  const id = await addressId("https://festi.is");
  await store.addAddress(env.DB, { id, url: "https://festi.is", kind: "web" });
  assert.equal((await call(env, "/api/space?url=https://festi.is")).status, 401);
  assert.equal((await call(env, `/api/space/${id}/approach`, { method: "POST" })).status, 401);
  assert.equal((await call(env, "/api/space?url=https://festi.is", { login: "someone" })).status, 200);
  assert.equal((await call(env, "/crawler")).status, 200);
  assert.equal((await call(env, "/admin", { login: "someone" })).status, 403);
  assert.equal((await call(env, "/admin", { login: "owner" })).status, 200);
});

test("admin API: add, refuse a duplicate, change, rescan, stop and remove an address", async () => {
  const env = fresh();
  const add = await call(env, "/api/admin/addresses", { method: "POST", body: { url: "festi.is/um-festi", label: "Festi", maxStaleMinutes: 60 }, login: "owner" });
  assert.equal(add.status, 201);
  const { address } = await add.json();
  assert.equal(address.url, "https://festi.is");
  assert.equal(address.kind, "web");
  assert.equal(address.added_by, "owner@example.com", "the admin's icelander.net address");
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
