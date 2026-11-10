import test from "node:test";
import assert from "node:assert/strict";
import { createHandler, seal, unseal, safeReturn, allowedPath, BASE } from "../worker/app.js";

const SITE = "https://icelander.net";
const env = { GITHUB_CLIENT_ID: "cid", GITHUB_CLIENT_SECRET: "sec", SESSION_SECRET: "s3cret-s3cret", PUBLIC_ORIGIN: SITE };
const calls = [];
const fakeFetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  url = String(url);
  if (url === "https://github.com/login/oauth/access_token") return Response.json(JSON.parse(init.body).code === "good" ? { access_token: "gho_token" } : { error: "bad_verification_code" });
  if (url === "https://api.github.com/user") return Response.json({ login: "octo", avatar_url: "https://a/x.png" });
  return new Response(JSON.stringify({ ok: url }), { headers: { "content-type": "application/json", "x-ratelimit-remaining": "4999" } });
};
const handle = createHandler("<html>page</html>", fakeFetch);
const req = (path, init = {}) => new Request(`${SITE}${path}`, init);
const cookieOf = (res, name) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
const value = (c) => c.split(";")[0];

async function signIn() {
  const start = await handle(req(`${BASE}/auth/github/start?return=${encodeURIComponent(`${BASE}?url=https://github.com/o/r`)}`), env);
  const auth = new URL(start.headers.get("location"));
  const cookie = value(cookieOf(start, "explorer_oauth"));
  const done = await handle(req(`${BASE}/auth/github/callback?code=good&state=${auth.searchParams.get("state")}`, { headers: { cookie } }), env);
  return { start, auth, done, session: value(cookieOf(done, "explorer_session")) };
}

test("serves the page", async () => {
  for (const p of [BASE, `${BASE}/`, `${BASE}/index.html`]) {
    const res = await handle(req(p), env);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "<html>page</html>");
  }
  assert.equal((await handle(req(`${BASE}/nothing`), env)).status, 404);
});

test("without OAuth settings it says so and signs nobody in", async () => {
  assert.deepEqual(await (await handle(req(`${BASE}/auth/me`), {})).json(), { configured: false });
  assert.equal((await handle(req(`${BASE}/auth/github/start`), {})).status, 503);
});

test("sign-in goes to GitHub with PKCE and a state bound to the browser", async () => {
  const { start, auth } = await signIn();
  assert.equal(start.status, 303);
  assert.equal(auth.origin + auth.pathname, "https://github.com/login/oauth/authorize");
  assert.equal(auth.searchParams.get("client_id"), "cid");
  assert.equal(auth.searchParams.get("redirect_uri"), `${SITE}${BASE}/auth/github/callback`);
  assert.equal(auth.searchParams.get("code_challenge_method"), "S256");
  assert.equal(auth.searchParams.get("scope"), "");
  const c = cookieOf(start, "explorer_oauth");
  assert.match(c, /HttpOnly/); assert.match(c, /Secure/); assert.match(c, /Path=\/v1\/apps\/cyberspace-explorer\/auth/);
});

test("private repositories are asked for only when chosen", async () => {
  const res = await handle(req(`${BASE}/auth/github/start?private=1`), env);
  assert.equal(new URL(res.headers.get("location")).searchParams.get("scope"), "repo");
});

test("the callback opens a sealed, HttpOnly session and returns to the page", async () => {
  const { done, session } = await signIn();
  assert.equal(done.status, 303);
  assert.equal(done.headers.get("location"), `${BASE}?url=https://github.com/o/r`);
  const c = cookieOf(done, "explorer_session");
  assert.match(c, /HttpOnly/); assert.doesNotMatch(c, /gho_token/);
  const me = await (await handle(req(`${BASE}/auth/me`, { headers: { cookie: session } }), env)).json();
  assert.deepEqual(me, { configured: true, user: { login: "octo", avatar: "https://a/x.png" } });
  const exchange = calls.find((x) => x.url.endsWith("/access_token"));
  assert.ok(JSON.parse(exchange.init.body).code_verifier);
});

test("a callback with the wrong state, or no cookie, signs nobody in", async () => {
  const start = await handle(req(`${BASE}/auth/github/start`), env);
  const cookie = value(cookieOf(start, "explorer_oauth"));
  const wrong = await handle(req(`${BASE}/auth/github/callback?code=good&state=nope`, { headers: { cookie } }), env);
  assert.match(wrong.headers.get("location"), /signin=failed/);
  assert.equal(cookieOf(wrong, "explorer_session"), undefined);
  const none = await handle(req(`${BASE}/auth/github/callback?code=good&state=x`), env);
  assert.match(none.headers.get("location"), /signin=failed/);
});

test("a refused code signs nobody in", async () => {
  const start = await handle(req(`${BASE}/auth/github/start`), env);
  const state = new URL(start.headers.get("location")).searchParams.get("state");
  const res = await handle(req(`${BASE}/auth/github/callback?code=bad&state=${state}`, { headers: { cookie: value(cookieOf(start, "explorer_oauth")) } }), env);
  assert.match(res.headers.get("location"), /signin=failed/);
});

test("cookies sealed with another secret, or damaged, are not sessions", async () => {
  const forged = await seal({ t: "x", l: "evil", a: "", x: Date.now() + 1e6 }, "another-secret");
  const res = await handle(req(`${BASE}/auth/me`, { headers: { cookie: `explorer_session=${forged}` } }), env);
  assert.equal((await res.json()).user, null);
  assert.equal(await unseal("garbage", env.SESSION_SECRET), null);
  const expired = await seal({ t: "x", l: "old", a: "", x: Date.now() - 1 }, env.SESSION_SECRET);
  assert.equal((await (await handle(req(`${BASE}/auth/me`, { headers: { cookie: `explorer_session=${expired}` } }), env)).json()).user, null);
});

test("the proxy needs a session, reads only, and adds the token itself", async () => {
  assert.equal((await handle(req(`${BASE}/api/github/user`), env)).status, 401);
  const { session } = await signIn();
  const headers = { cookie: session };
  assert.equal((await handle(req(`${BASE}/api/github/user`, { method: "POST", headers }), env)).status, 405);
  assert.equal((await handle(req(`${BASE}/api/github/orgs/x/members`, { headers }), env)).status, 404);
  assert.equal((await handle(req(`${BASE}/api/github/repos/o/r/contents/../../../user`, { headers }), env)).status, 404);
  calls.length = 0;
  const ok = await handle(req(`${BASE}/api/github/user/repos?sort=updated&per_page=100`, { headers }), env);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("x-ratelimit-remaining"), "4999");
  assert.equal(calls[0].url, "https://api.github.com/user/repos?sort=updated&per_page=100");
  assert.equal(calls[0].init.headers.authorization, "Bearer gho_token");
  assert.doesNotMatch(JSON.stringify([...ok.headers]), /gho_token/);
});

test("sign-out only from the page's own origin", async () => {
  assert.equal((await handle(req(`${BASE}/auth/sign-out`, { method: "POST" }), env)).status, 403);
  assert.equal((await handle(req(`${BASE}/auth/sign-out`, { method: "POST", headers: { origin: "https://evil.example" } }), env)).status, 403);
  const ok = await handle(req(`${BASE}/auth/sign-out`, { method: "POST", headers: { origin: SITE } }), env);
  assert.equal(ok.status, 200);
  assert.match(cookieOf(ok, "explorer_session"), /Max-Age=0/);
});

test("the return path stays inside the app", () => {
  assert.equal(safeReturn(`${BASE}?url=x`, SITE), `${BASE}?url=x`);
  for (const bad of ["https://evil.example/", "//evil.example", "/games/", "/v1/apps/cyberspace-explorer-evil", undefined]) assert.equal(safeReturn(bad, SITE), BASE);
});

test("the proxy's allowlist", () => {
  for (const ok of ["user", "user/repos", "repos/o/r", "repos/o/r/git/trees/main", "repos/o/r/git/trees/feature%2Fx", "repos/o/r/contents/.dev/a.json"]) assert.ok(allowedPath(ok), ok);
  for (const bad of ["", "gists", "repos/o/r/issues", "repos/o/r/contents/%2e%2e/x", "repos/o/r/git/refs", "user/emails"]) assert.ok(!allowedPath(bad), bad);
});
