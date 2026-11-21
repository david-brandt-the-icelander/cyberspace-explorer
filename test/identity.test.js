import test from "node:test";
import assert from "node:assert/strict";
import { createHandler, BASE, HOME, IDENTITY_BASE } from "../worker/app.js";
import { checkVendored } from "../worker/vendor/icelander-auth/check.mjs";

const SITE = "https://cyberspace-explorer.com";
const JWKS = JSON.stringify({ keys: [{ kty: "OKP", crv: "Ed25519", kid: "k2026a", x: "WIEomi0LTalJvQndhD7abl8ty3YcliQ0vEz4XjLXayc" }] });
const person = { id: "a-1", name: "Ann", emails: ["a@example.com"], roles: [] };
const accounts = (signedIn) => ({ session: async (v, app) => (signedIn && v.length > 20 && app === "explorer" ? person : null) });
const env = (signedIn, extra = {}) => ({ REQUIRE_SIGN_IN: "true", ACCOUNTS_JWKS: JWKS, ACCOUNTS: accounts(signedIn), GITHUB_CLIENT_ID: "cid", GITHUB_CLIENT_SECRET: "sec", SESSION_SECRET: "s3cret-s3cret", PUBLIC_ORIGIN: SITE, ...extra });
const handle = createHandler("<html>page</html>", async () => Response.json({}));
const req = (path, init = {}) => new Request(`${SITE}${path}`, init);
const ID = { cookie: `explorer_identity=${"x".repeat(40)}` };

test("the vendored sign-in library is unedited", () => { checkVendored(new URL("../worker/vendor/icelander-auth/", import.meta.url)); });

test("with the sign-in required, a visitor who is not signed in is sent to icelander.net and back", async () => {
  const r = await handle(req(`${HOME}?url=https://github.com/o/r`), env(false));
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), `${IDENTITY_BASE}/sign-in?return=%2F%3Furl%3Dhttps%3A%2F%2Fgithub.com%2Fo%2Fr`);
  const s = await handle(req(`${IDENTITY_BASE}/sign-in?return=%2F`), env(false));
  const to = new URL(s.headers.get("location"));
  assert.equal(to.origin + to.pathname, "https://icelander.net/accounts/sign-in");
  assert.equal(to.searchParams.get("app"), "explorer");
  assert.equal(to.searchParams.get("callback"), `${SITE}${IDENTITY_BASE}/callback`);
  assert.match(s.headers.getSetCookie().join(";"), /explorer_identity_state=.*HttpOnly.*Secure/);
});

test("a signed-in visitor gets the page, privately", async () => {
  const r = await handle(req(HOME, { headers: ID }), env(true));
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "<html>page</html>");
  assert.equal(r.headers.get("cache-control"), "private, no-store");
});

test("the GitHub routes need the sign-in too; GitHub's own OAuth App is otherwise unchanged", async () => {
  assert.equal((await handle(req(`${BASE}/api/github/user`), env(false))).status, 401);
  const start = await handle(req(`${BASE}/auth/github/start`), env(false));
  assert.equal(start.status, 303);
  assert.match(start.headers.get("location"), /^\/identity\/auth\/sign-in/);
  const ok = await handle(req(`${BASE}/auth/github/start`, { headers: ID }), env(true));
  assert.equal(new URL(ok.headers.get("location")).origin, "https://github.com");
  assert.equal(new URL(ok.headers.get("location")).searchParams.get("redirect_uri"), `${SITE}/auth/github/callback`);
  assert.ok(ok.headers.getSetCookie().some((c) => c.startsWith("explorer_oauth=")));
});

test("never sends anyone to another site after signing in", async () => {
  const s = await handle(req(`${IDENTITY_BASE}/sign-in?return=https://evil.example/`), env(false));
  assert.equal(new URL(s.headers.get("location")).searchParams.get("return"), "/");
});

test("fails closed: with no way to ask the login service nobody gets the page", async () => {
  const r = await handle(req(HOME, { headers: ID }), { REQUIRE_SIGN_IN: "true" });
  assert.equal(r.status, 302);
});

test("with REQUIRE_SIGN_IN off it is as it was: the page is open", async () => {
  const r = await handle(req(HOME), env(false, { REQUIRE_SIGN_IN: "false" }));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-cache");
});
