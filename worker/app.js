// The cyberspace explorer as a service: serves the page, signs readers in with GitHub (OAuth 2.0 code
// flow with PKCE) and reads GitHub for them. The access token never reaches the page: it is kept in an
// encrypted HttpOnly cookie and added to the GitHub calls here. No dependencies; runs in Workers and Node.

export const BASE = "/v1/apps/cyberspace-explorer";
const SESSION = "explorer_session", PENDING = "explorer_oauth";
const SESSION_DAYS = 7;

const enc = new TextEncoder(), dec = new TextDecoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const random = (n) => b64u(crypto.getRandomValues(new Uint8Array(n)));

async function aesKey(secret) {
  return crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", enc.encode(`explorer-session:${secret}`)), "AES-GCM", false, ["encrypt", "decrypt"]);
}
/** Encrypts and authenticates a JSON value for the cookie. */
export async function seal(value, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(secret), enc.encode(JSON.stringify(value)));
  return `${b64u(iv)}.${b64u(ct)}`;
}
/** The value inside a sealed cookie, or null for anything forged, damaged or sealed with another secret. */
export async function unseal(text, secret) {
  try {
    const [iv, ct] = text.split(".");
    return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64u(iv) }, await aesKey(secret), unb64u(ct))));
  } catch { return null; }
}

function cookies(request) {
  const out = {};
  for (const part of (request.headers.get("cookie") ?? "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}
const setCookie = (name, value, { path = BASE, maxAge } = {}) =>
  `${name}=${value}; Path=${path}; HttpOnly; Secure; SameSite=Lax${maxAge === undefined ? "" : `; Max-Age=${maxAge}`}`;
const clear = (name, path = BASE) => setCookie(name, "", { path, maxAge: 0 });

const configured = (env) => !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.SESSION_SECRET);
const origin = (request, env) => env.PUBLIC_ORIGIN || new URL(request.url).origin;

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "private, no-store", "x-content-type-options": "nosniff", ...headers },
});
function redirect(location, cookiesToSet = []) {
  const h = new Headers({ location, "cache-control": "private, no-store" });
  for (const c of cookiesToSet) h.append("set-cookie", c);
  return new Response(null, { status: 303, headers: h });
}

/** Only a path inside this app, so a sign-in can't be used to send anyone elsewhere. */
export function safeReturn(raw, site) {
  try {
    const u = new URL(raw ?? BASE, site);
    if (u.origin !== new URL(site).origin) return BASE;
    if (u.pathname !== BASE && !u.pathname.startsWith(`${BASE}/`)) return BASE;
    return u.pathname + u.search;
  } catch { return BASE; }
}

async function session(request, env) {
  if (!configured(env)) return null;
  const sealed = cookies(request)[SESSION];
  const s = sealed && (await unseal(sealed, env.SESSION_SECRET));
  return s && s.x > Date.now() && s.t ? s : null;
}

async function start(request, env) {
  if (!configured(env)) return json({ error: "Sign-in with GitHub is not set up on this server." }, 503);
  const url = new URL(request.url), site = origin(request, env);
  const state = random(16), verifier = random(32);
  const challenge = b64u(await crypto.subtle.digest("SHA-256", enc.encode(verifier)));
  const ret = safeReturn(url.searchParams.get("return"), site);
  const pending = await seal({ state, verifier, ret, x: Date.now() + 10 * 60_000 }, env.SESSION_SECRET);
  const auth = new URL("https://github.com/login/oauth/authorize");
  auth.search = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${site}${BASE}/auth/github/callback`,
    // Reading a reader's public repositories needs no scope; private ones need `repo` (GitHub has nothing narrower).
    scope: url.searchParams.get("private") === "1" ? "repo" : "",
    state, code_challenge: challenge, code_challenge_method: "S256",
  }).toString();
  return redirect(auth.toString(), [setCookie(PENDING, pending, { path: `${BASE}/auth`, maxAge: 600 })]);
}

async function callback(request, env, fetcher) {
  if (!configured(env)) return json({ error: "Sign-in with GitHub is not set up on this server." }, 503);
  const url = new URL(request.url), site = origin(request, env);
  const sealed = cookies(request)[PENDING];
  const pending = sealed && (await unseal(sealed, env.SESSION_SECRET));
  const gone = [clear(PENDING, `${BASE}/auth`)];
  if (!pending || pending.x < Date.now() || !url.searchParams.get("state") || url.searchParams.get("state") !== pending.state) {
    return redirect(`${BASE}?signin=failed`, gone);
  }
  const code = url.searchParams.get("code");
  if (!code) return redirect(`${pending.ret}${pending.ret.includes("?") ? "&" : "?"}signin=denied`, gone);
  const res = await fetcher("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "user-agent": "cyberspace-explorer" },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: `${site}${BASE}/auth/github/callback`, code_verifier: pending.verifier }),
  });
  const got = res.ok ? await res.json().catch(() => ({})) : {};
  if (!got.access_token) return redirect(`${BASE}?signin=failed`, gone);
  const me = await fetcher("https://api.github.com/user", { headers: { authorization: `Bearer ${got.access_token}`, accept: "application/vnd.github+json", "user-agent": "cyberspace-explorer" } });
  const who = me.ok ? await me.json().catch(() => ({})) : {};
  if (!who.login) return redirect(`${BASE}?signin=failed`, gone);
  const value = await seal({ t: got.access_token, l: who.login, a: who.avatar_url ?? "", x: Date.now() + SESSION_DAYS * 864e5 }, env.SESSION_SECRET);
  return redirect(pending.ret, [...gone, setCookie(SESSION, value, { maxAge: SESSION_DAYS * 86400 })]);
}

async function me(request, env) {
  if (!configured(env)) return json({ configured: false });
  const s = await session(request, env);
  return json({ configured: true, user: s ? { login: s.l, avatar: s.a } : null });
}

function signOut(request, env) {
  const site = origin(request, env);
  // Only from this app's own page, so another site can't sign a reader out.
  if (request.method !== "POST" || request.headers.get("origin") !== site) return json({ error: "Sign out from the page." }, 403);
  return json({ ok: true }, 200, { "set-cookie": clear(SESSION) });
}

/** What the page may ask GitHub for through the server: reading, and only what it needs. */
const ALLOWED = [
  /^user$/, /^user\/repos$/,
  /^repos\/[^/]+\/[^/]+$/,
  /^repos\/[^/]+\/[^/]+\/git\/trees\/[^/]+$/,
  /^repos\/[^/]+\/[^/]+\/contents\/.+$/,
];
export const allowedPath = (path) => !path.split("/").some((seg) => { try { return decodeURIComponent(seg) === ".." || decodeURIComponent(seg) === "."; } catch { return true; } }) && ALLOWED.some((re) => re.test(path));

async function proxy(request, env, path, fetcher) {
  if (request.method !== "GET") return json({ error: "Read only." }, 405, { allow: "GET" });
  const s = await session(request, env);
  if (!s) return json({ error: "Not signed in." }, 401);
  if (!allowedPath(path)) return json({ error: "Not a path this server reads." }, 404);
  const url = new URL(request.url);
  const raw = request.headers.get("accept") === "application/vnd.github.raw";
  const res = await fetcher(`https://api.github.com/${path}${url.search}`, {
    headers: { authorization: `Bearer ${s.t}`, accept: raw ? "application/vnd.github.raw" : "application/vnd.github+json", "user-agent": "cyberspace-explorer", "x-github-api-version": "2022-11-28" },
  });
  const headers = { "content-type": res.headers.get("content-type") ?? "application/octet-stream", "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
  for (const h of ["x-ratelimit-remaining", "x-ratelimit-reset"]) if (res.headers.get(h)) headers[h] = res.headers.get(h);
  // A revoked or expired token: forget it, so the page offers a fresh sign-in.
  if (res.status === 401) headers["set-cookie"] = clear(SESSION);
  return new Response(res.body, { status: res.status, headers });
}

/** The Worker's fetch handler, for the page's source text. */
export function createHandler(html, fetcher = (...a) => fetch(...a)) {
  return async function handle(request, env = {}) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === BASE || path === `${BASE}/index.html`) {
      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
      return new Response(request.method === "HEAD" ? null : html, { headers: {
        "content-type": "text/html; charset=utf-8", "cache-control": "no-cache",
        "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin",
      } });
    }
    if (path === `${BASE}/auth/me`) return me(request, env);
    if (path === `${BASE}/auth/github/start`) return start(request, env);
    if (path === `${BASE}/auth/github/callback`) return callback(request, env, fetcher);
    if (path === `${BASE}/auth/sign-out`) return signOut(request, env);
    if (path.startsWith(`${BASE}/api/github/`)) return proxy(request, env, path.slice(`${BASE}/api/github/`.length), fetcher);
    return new Response("Not found", { status: 404 });
  };
}
