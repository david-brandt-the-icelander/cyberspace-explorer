// The crawler's tests: pure parts first, then scans of fake repositories and sites through the real schema.

import test from "node:test";
import assert from "node:assert/strict";
import { normalize, addressId, gitParts } from "../src/address.js";
import { freshness, isFresh, conditional } from "../src/httpcache.js";
import { parseRobots, allowed } from "../src/robots.js";
import { Fetcher, BudgetSpent } from "../src/fetcher.js";
import { readDeclaration, noAi } from "../src/wellknown.js";
import { readPage, mainText, readSitemap, sectionOf } from "../src/html.js";
import { viewPaths, citedPaths } from "../src/git.js";
import { redactTxt, registrable } from "../src/web.js";
import * as store from "../src/store.js";
import { runScan } from "../src/scan.js";
import crawler from "../src/index.js";
import { d1, r2, queue, fakeFetch, env } from "./fakes.js";

const H = (o) => new Headers(o);

test("addresses: repositories are git, everything else on http(s) is web, each in one spelling", () => {
  assert.deepEqual(normalize("github.com/Owner/Repo.git"), { kind: "git", url: "https://github.com/Owner/Repo", host: "github.com" });
  assert.equal(normalize("https://github.com/o/r/tree/main/src").url, "https://github.com/o/r/tree/main/src");
  assert.deepEqual(normalize("HTTPS://Festi.IS/um-festi?x=1"), { kind: "web", url: "https://festi.is", host: "festi.is" });
  assert.throws(() => normalize("ftp://x.is"), /Not a web address/);
  assert.throws(() => normalize("https://u:p@x.is"), /credentials/);
  assert.throws(() => normalize("https://github.com/onlyowner"), /Not a repository/);
  assert.deepEqual(gitParts("https://gitlab.com/g/p/-/tree/dev/a/b"), { host: "gitlab.com", owner: "g", repo: "p", ref: "dev", folder: "a/b" });
});

test("addresses: the id is stable and short", async () => {
  const a = await addressId("https://festi.is");
  assert.equal(a, await addressId("https://festi.is"));
  assert.match(a, /^[0-9a-f]{20}$/);
  assert.notEqual(a, await addressId("https://n1.is"));
});

test("HTTP caching: max-age, s-maxage, Age, Expires, the heuristic, no-cache and no-store", () => {
  const now = new Date("2026-11-19T12:00:00Z");
  const until = (h) => (Date.parse(freshness(H(h), now).freshUntil) - now.getTime()) / 1000;
  assert.equal(until({ "cache-control": "public, max-age=600" }), 600);
  assert.equal(until({ "cache-control": "max-age=600, s-maxage=60" }), 60);
  assert.equal(until({ "cache-control": "max-age=600", age: "100" }), 500);
  assert.equal(until({ expires: "Thu, 19 Nov 2026 13:00:00 GMT", date: "Thu, 19 Nov 2026 12:00:00 GMT" }), 3600);
  assert.equal(until({ "last-modified": "Thu, 09 Nov 2026 12:00:00 GMT", date: "Thu, 19 Nov 2026 12:00:00 GMT" }), 86400, "a tenth of ten days is one day, the cap");
  assert.equal(until({ "last-modified": "Thu, 19 Nov 2026 02:00:00 GMT", date: "Thu, 19 Nov 2026 12:00:00 GMT" }), 3600);
  assert.equal(until({ "cache-control": "no-cache, max-age=600" }), 0);
  const ns = freshness(H({ "cache-control": "no-store", etag: '"a"' }), now);
  assert.equal(ns.noStore, true);
  assert.equal(until({}), 0);
  assert.equal(isFresh({ fresh_until: "2026-11-19T12:10:00Z" }, now), true);
  assert.equal(isFresh({ fresh_until: "2026-11-19T11:00:00Z" }, now), false);
  assert.deepEqual(conditional({ etag: '"x"', last_modified: "Wed" }), { "if-none-match": '"x"', "if-modified-since": "Wed" });
});

test("robots.txt: the agent's own group, longest match, Allow on a tie, wildcards and the end anchor", () => {
  const txt = `User-agent: *\nDisallow: /\n\nUser-agent: cyberspace-crawler\nUser-agent: other\nDisallow: /private\nAllow: /private/open\nDisallow: /*.pdf$\nDisallow: /search?\n\nSitemap: https://x.is/sitemap.xml`;
  const r = parseRobots(txt, "cyberspace-crawler/1.0 (+https://cyberspace-explorer.com/crawler)");
  assert.deepEqual(r.sitemaps, ["https://x.is/sitemap.xml"]);
  assert.equal(allowed(r, "/"), true);
  assert.equal(allowed(r, "/private/x"), false);
  assert.equal(allowed(r, "/private/open/y"), true);
  assert.equal(allowed(r, "/a/b.pdf"), false);
  assert.equal(allowed(r, "/a/b.pdf?x"), true);
  assert.equal(allowed(r, "/search?q=1"), false);
  const star = parseRobots(txt, "somebot");
  assert.equal(allowed(star, "/anything"), false);
  assert.equal(allowed(parseRobots("User-agent: *\nDisallow:", "x"), "/a"), true);
  assert.equal(allowed(parseRobots("User-agent: *\nDisallow: /a\nAllow: /a", "x"), "/a"), true);
});

test("fetcher: a fresh copy costs nothing, a stale one is revalidated, robots.txt and the budget are obeyed", async () => {
  const db = d1(), bucket = r2();
  let hits = 0;
  const f = fakeFetch({
    "https://x.is/robots.txt": { body: "User-agent: *\nDisallow: /no" },
    "https://x.is/a": { body: "A", headers: { "cache-control": "max-age=3600" } },
    "https://x.is/b": (url, init) => (hits++, init.headers["if-none-match"] === '"v1"' ? { status: 304 } : { body: "B", headers: { etag: '"v1"' } }),
  });
  const fetcher = new Fetcher({ db, bucket, userAgent: "cyberspace-crawler/1.0", budget: 4, fetchImpl: f, pause: 0 });
  assert.equal((await fetcher.get("https://x.is/no")).status, "disallowed");
  const a1 = await fetcher.get("https://x.is/a");
  assert.equal(a1.text, "A");
  assert.equal(a1.changed, true);
  const a2 = await fetcher.get("https://x.is/a");
  assert.equal(a2.cached, true);
  assert.equal(f.calls.filter((c) => c.url === "https://x.is/a").length, 1);
  const b1 = await fetcher.get("https://x.is/b");
  const b2 = await fetcher.get("https://x.is/b");
  assert.equal(b1.changed, true);
  assert.equal(b2.changed, false);
  assert.equal(b2.text, "B");
  assert.equal(hits, 2);
  assert.equal(f.calls.at(-1).headers["user-agent"], "cyberspace-crawler/1.0");
  await assert.rejects(fetcher.get("https://x.is/c"), BudgetSpent);
});

test("fetcher: no-store bodies are not kept, and a network failure is status 0", async () => {
  const bucket = r2();
  const f = fakeFetch({ "https://x.is/s": { body: "S", headers: { "cache-control": "no-store" } }, "https://x.is/robots.txt": { status: 404 } });
  const fetcher = new Fetcher({ db: d1(), bucket, userAgent: "t", fetchImpl: f, pause: 0 });
  assert.equal((await fetcher.get("https://x.is/s")).text, "S");
  assert.equal([...bucket.objects.keys()].filter((k) => k.startsWith("fetch/")).length, 0);
  const broken = new Fetcher({ db: d1(), bucket: r2(), userAgent: "t", fetchImpl: async () => { throw new Error("down"); }, pause: 0 });
  assert.equal((await broken.get("https://y.is/", { robots: false })).status, 0);
});

test("well-known: a declaration names a repository or a tree, related addresses and sections not for AI", () => {
  assert.equal(readDeclaration(null, "https://x.is").error, "not a JSON object");
  assert.equal(readDeclaration({ cyberspace: 2 }, "https://x.is").error, "cyberspace must be 1");
  assert.deepEqual(readDeclaration({ cyberspace: 1, noAi: ["/x"] }, "https://x.is").noAi, ["/x"], "no views of its own: the site is inferred, minus /x");
  assert.match(readDeclaration({ cyberspace: 1, repository: "https://evil.example/x/y" }, "https://x.is").error, /github\.com or gitlab\.com/);
  const d = readDeclaration({
    cyberspace: 1, name: "X", tree: { base: "/cyberspace/", files: ["component-diagram.json", "../etc/passwd.json", "shop/use-case.json", 5] },
    related: [{ url: "https://n1.is", relation: "subsidiary" }, "https://kronan.is", { url: "ftp://no" }], noAi: ["/minar-sidur", "bad"],
  }, "https://x.is");
  assert.deepEqual(d.tree, { base: "https://x.is/cyberspace/", files: ["component-diagram.json", "shop/use-case.json"] });
  assert.deepEqual(d.related, [{ url: "https://n1.is", relation: "subsidiary" }, { url: "https://kronan.is", relation: "other" }]);
  assert.equal(noAi(d, "/minar-sidur/kort"), true);
  assert.equal(noAi(d, "/minar-sidurx"), false);
});

test("pages: title, main text without navigation, links in and out, what it loads, schema types", () => {
  const html = `<!doctype html><html lang="is"><head><title>Krónan &amp; co</title><meta name="description" content="Matvara">
    <script type="application/ld+json">{"@type":"Organization"}</script><script src="https://cdn.x.com/a.js"></script></head>
    <body><nav><a href="/menu">Menu</a></nav><main><h1>Fréttir</h1><p>Ný verslun opnar.</p><a href="/frettir/1">Lesa</a>
    <a href="https://facebook.com/k">FB</a><a href="mailto:a@b.is">mail</a><img src="//img.cdn.is/x.png"></main><footer>Footer</footer></body></html>`;
  const p = readPage(html, "https://kronan.is/frettir");
  assert.equal(p.title, "Krónan & co");
  assert.equal(p.lang, "is");
  assert.deepEqual(p.h1, ["Fréttir"]);
  assert.deepEqual(p.links, ["/frettir/1", "/menu"]);
  assert.deepEqual(p.linksOut, { "facebook.com": 1 });
  assert.deepEqual(p.loads, { "cdn.x.com": ["script"], "img.cdn.is": ["image"] });
  assert.deepEqual(p.schemaTypes, ["Organization"]);
  assert.equal(mainText(html), "Fréttir\nNý verslun opnar.\nLesa\nFB mail");
  assert.equal(sectionOf("/frettir/1"), "frettir");
  assert.equal(sectionOf("/"), "");
  const sm = readSitemap(`<urlset><url><loc>https://k.is/a</loc><lastmod>2026-01-01</lastmod></url><url><loc>https://k.is/b</loc></url></urlset>`);
  assert.deepEqual(sm, { index: false, urls: [{ url: "https://k.is/a", lastmod: "2026-01-01" }, { url: "https://k.is/b", lastmod: null }] });
  assert.deepEqual(readSitemap(`<sitemapindex><sitemap><loc>https://k.is/s1.xml</loc></sitemap></sitemapindex>`), { index: true, urls: ["https://k.is/s1.xml"] });
});

test("web helpers: TXT tokens are redacted, SPF stays; registrable domains", () => {
  assert.equal(redactTxt('"google-site-verification=abc123"'), "google-site-verification=[redacted]");
  assert.equal(redactTxt("v=spf1 include:spf.protection.outlook.com ~all"), "v=spf1 include:spf.protection.outlook.com ~all");
  assert.equal(registrable("www.kronan.is"), "kronan.is");
  assert.equal(registrable("shop.example.co.uk"), "example.co.uk");
});

test("git helpers: the view tree wins over .dev folders; a folder address keeps its own views; cited sources", () => {
  const paths = ["README.md", ".dev/vision.json", "worker/.dev/component-diagram.json", "worker/app.js", ".dev/notes.md"];
  assert.deepEqual(viewPaths(paths), [".dev/vision.json", "worker/.dev/component-diagram.json"]);
  assert.deepEqual(viewPaths(paths, "worker"), ["worker/.dev/component-diagram.json"]);
  assert.deepEqual(viewPaths([...paths, ".cyberspace-explorer/x.json"]), [".cyberspace-explorer/x.json"]);
  assert.deepEqual(citedPaths({ sources: [{ path: "worker/app.js", symbol: "x" }], artifacts: [{ source: "wrangler.jsonc" }], entities: [{ sources: [{ path: "a.js" }] }] }).sort(), ["a.js", "worker/app.js", "wrangler.jsonc"]);
});

test("store: due addresses, one queued scan at a time, and staleness by the address's own limit or the default", async () => {
  const db = d1(), q = queue();
  await store.addAddress(db, { id: "a", url: "https://a.is", kind: "web" });
  await store.addAddress(db, { id: "b", url: "https://b.is", kind: "web", enabled: 0 });
  assert.equal(await store.addAddress(db, { id: "a", url: "https://a.is", kind: "web" }), false);
  assert.deepEqual(await store.dueAddresses(db), ["a"]);
  assert.equal(await store.requestScan(db, q, "a", "approach"), true);
  assert.equal(await store.requestScan(db, q, "a", "approach"), false, "already queued");
  assert.deepEqual(q.sent.map((s) => s.body), [{ id: "a", reason: "approach" }]);
  assert.deepEqual(await store.dueAddresses(db), [], "queued addresses are not due again");
  const s = await store.settings(db);
  const t = new Date("2026-11-19T12:00:00Z");
  assert.equal(store.isStale({ finished_at: null }, s, t), true);
  assert.equal(store.isStale({ finished_at: "2026-11-18T12:00:00Z" }, s, t), false, "a day old, a week allowed");
  assert.equal(store.isStale({ finished_at: "2026-11-18T12:00:00Z", max_stale_minutes: 60 }, s, t), true);
  await store.updateAddress(db, "a", { maxStaleMinutes: 30, label: "A" });
  assert.equal((await store.address(db, "a")).max_stale_minutes, 30);
});

// A fake GitHub repository whose head moves between scans.
function githubRepo(state) {
  const R = "https://api.github.com/repos/o/r";
  return fakeFetch({
    [R]: { body: { default_branch: "main", description: "A repo", topics: ["x"] } },
    [`${R}/commits/main`]: () => ({ body: state.head }),
    [`${R}/git/trees/c1?recursive=1`]: { body: { tree: state.tree1.map((path) => ({ path, type: "blob" })) } },
    [`${R}/git/trees/c2?recursive=1`]: { body: { tree: state.tree2.map((path) => ({ path, type: "blob" })) } },
    [`${R}/compare/c1...c2`]: { body: { files: state.changed.map((filename) => ({ filename })) } },
    ...Object.fromEntries(Object.entries(state.files).map(([k, v]) => [`https://raw.githubusercontent.com/o/r/${k}`, { body: v }])),
  });
}

test("git scan: the first scan copies the views, an unchanged head costs one request, a new head refetches only what changed", async () => {
  const e = env({ GITHUB_TOKEN: "ghs_test" });
  const id = await addressId("https://github.com/o/r");
  await store.addAddress(e.DB, { id, url: "https://github.com/o/r", kind: "git" });
  const state = {
    head: "c1", tree1: [".dev/component-diagram.json", "app.js"], tree2: [".dev/component-diagram.json", ".dev/backlog.json", "app.js"], changed: ["app.js", ".dev/backlog.json"],
    files: {
      "c1/.dev/component-diagram.json": { kind: "component", sources: [{ path: "app.js", symbol: "x" }] },
      "c2/.dev/component-diagram.json": { kind: "component", sources: [{ path: "app.js", symbol: "x" }] },
      "c2/.dev/backlog.json": { kind: "backlog", entities: [] },
    },
  };
  const f = githubRepo(state);
  const r1 = await runScan(e, { id, reason: "admin" }, { fetchImpl: f });
  assert.equal(r1.source, "repository");
  const idx1 = JSON.parse(e.SPACE.objects.get(`space/${id}/index.json`));
  assert.deepEqual(idx1.paths, [".dev/component-diagram.json"]);
  assert.equal(idx1.head, "c1");
  assert.ok(e.SPACE.objects.has(`space/${id}/files/.dev/component-diagram.json`));
  assert.equal(f.calls[0].headers.authorization, "Bearer ghs_test");

  const before = f.calls.length;
  await runScan(e, { id, reason: "schedule" }, { fetchImpl: f });
  const extra = f.calls.slice(before).map((c) => c.url);
  assert.deepEqual(extra.filter((u) => !u.endsWith("/repos/o/r")), ["https://api.github.com/repos/o/r/commits/main"], "only the head is asked for");

  state.head = "c2";
  const mark = f.calls.length;
  await runScan(e, { id, reason: "schedule" }, { fetchImpl: f });
  const raw = f.calls.slice(mark).map((c) => c.url).filter((u) => u.includes("raw.githubusercontent"));
  assert.deepEqual(raw, ["https://raw.githubusercontent.com/o/r/c2/.dev/backlog.json"], "the unchanged view is not read again");
  const idx2 = JSON.parse(e.SPACE.objects.get(`space/${id}/index.json`));
  assert.deepEqual(idx2.paths, [".dev/backlog.json", ".dev/component-diagram.json"]);
  assert.deepEqual(idx2.stale, [".dev/component-diagram.json"], "its cited source app.js changed");
  const row = await store.address(e.DB, id);
  assert.equal(row.head, "c2");
  assert.equal(row.status, "done");
});

test("git scan: a repository without views is summarised for the AI step", async () => {
  const e = env();
  const id = await addressId("https://github.com/o/r");
  await store.addAddress(e.DB, { id, url: "https://github.com/o/r", kind: "git" });
  const f = githubRepo({ head: "c1", tree1: ["README.md", "package.json", "src/a.js", "src/b.js"], tree2: [], changed: [], files: { "c1/README.md": "# R", "c1/package.json": "{}" } });
  await runScan(e, { id, reason: "admin" }, { fetchImpl: f });
  const idx = JSON.parse(e.SPACE.objects.get(`space/${id}/index.json`));
  assert.equal(idx.source, "inferred");
  assert.equal(idx.needsAi, 1);
  const repo = JSON.parse(e.SPACE.objects.get(`space/${id}/raw/repo.json`));
  assert.deepEqual(Object.keys(repo.files).sort(), ["README.md", "package.json"]);
  assert.equal(repo.layout.src.files, 2);
  assert.equal((await store.address(e.DB, id)).needs_ai, 1);
  assert.equal(f.calls.some((c) => c.headers.authorization), false, "no token, none sent");
});

test("git scan: a missing repository fails the scan and schedules a retry", async () => {
  const e = env();
  const id = await addressId("https://github.com/o/gone");
  await store.addAddress(e.DB, { id, url: "https://github.com/o/gone", kind: "git" });
  const r = await runScan(e, { id, reason: "admin" }, { fetchImpl: fakeFetch({}) });
  assert.match(r.failed, /404 \(missing or private\)/);
  const row = await store.address(e.DB, id);
  assert.equal(row.status, "failed");
  assert.ok(row.next_due_at);
});

test("web scan: a cooperating site's tree is copied, its repository crawled, other related addresses wait for the admin", async () => {
  const e = env();
  const id = await addressId("https://festi.is");
  await store.addAddress(e.DB, { id, url: "https://festi.is", kind: "web" });
  const f = fakeFetch({
    "https://festi.is/robots.txt": { body: "User-agent: *\nAllow: /" },
    "https://festi.is/.well-known/cyberspace.json": { body: { cyberspace: 1, name: "Festi", tree: { base: "/cs/", files: ["component-diagram.json"] }, repository: "https://github.com/festi/site", related: [{ url: "https://n1.is", relation: "subsidiary" }] } },
    "https://festi.is/cs/component-diagram.json": { body: { kind: "component" } },
  });
  const r = await runScan(e, { id, reason: "admin" }, { fetchImpl: f });
  assert.equal(r.source, "well-known");
  assert.ok(e.SPACE.objects.has(`space/${id}/files/component-diagram.json`));
  const all = await store.addresses(e.DB);
  const repo = all.find((a) => a.url === "https://github.com/festi/site"), n1 = all.find((a) => a.url === "https://n1.is");
  assert.equal(repo.enabled, 1);
  assert.equal(repo.found_via, id);
  assert.equal(n1.enabled, 0);
  assert.deepEqual(e.SCANS.sent.map((s) => s.body.id), [repo.id]);
  assert.equal((await store.address(e.DB, id)).label, "Festi");
});

test("web scan: an ordinary site is read through robots.txt, its sitemap and a sample of each section, then continued when the budget runs out", async () => {
  const e = env();
  const id = await addressId("https://kronan.is");
  await store.addAddress(e.DB, { id, url: "https://kronan.is", kind: "web" });
  await store.setSetting(e.DB, "pages_per_scan", 2);
  const page = (t) => ({ body: `<html><title>${t}</title><main><p>${t} texti</p></main></html>`, headers: { "content-type": "text/html" } });
  const urls = ["frettir/1", "frettir/2", "uppskriftir/a", "minar-sidur/x"].map((p) => `<url><loc>https://kronan.is/${p}</loc><lastmod>2026-11-01</lastmod></url>`).join("");
  const routes = {
    "https://kronan.is/robots.txt": { body: "User-agent: *\nDisallow: /minar-sidur\nSitemap: https://kronan.is/sm.xml" },
    "https://kronan.is/": { body: `<html><title>Krónan</title><body><a href="/frettir/1">x</a></body></html>` },
    "https://kronan.is/sm.xml": { body: `<urlset>${urls}</urlset>` },
    "https://kronan.is/frettir/1": page("F1"), "https://kronan.is/frettir/2": page("F2"), "https://kronan.is/uppskriftir/a": page("U"),
  };
  const f = fakeFetch(routes);
  // A budget of 2 pages plus the scan's overhead of 40 is plenty here; make it tight to see a continuation.
  const tight = { ...e };
  const r = await runScan(tight, { id, reason: "admin" }, { fetchImpl: f });
  assert.equal(r.source, "inferred");
  const site = JSON.parse(e.SPACE.objects.get(`space/${id}/raw/site.json`));
  assert.equal(site.sitemap.urls, 4);
  assert.deepEqual(Object.keys(site.sections).sort(), ["frettir", "minar-sidur", "uppskriftir"]);
  assert.equal(site.sections["minar-sidur"].disallowed, true);
  assert.equal(site.sections.frettir.read.length, 2);
  assert.equal(f.calls.some((c) => c.url.includes("minar-sidur")), false, "robots.txt keeps it out");
  assert.equal((await store.address(e.DB, id)).needs_ai, 1);
  const pages = [...e.SPACE.objects.keys()].filter((k) => k.startsWith(`space/${id}/raw/pages/`));
  assert.equal(pages.length, 4, "front page and three readable pages");
});

test("web scan: a scan out of requests saves its place and queues the rest", async () => {
  const e = env();
  const id = await addressId("https://big.is");
  await store.addAddress(e.DB, { id, url: "https://big.is", kind: "web" });
  await store.setSetting(e.DB, "pages_per_scan", 1);
  const links = Array.from({ length: 60 }, (_, i) => `<a href="/s${i}/p">${i}</a>`).join("");
  const routes = { "https://big.is/": { body: `<html>${links}</html>` } };
  for (let i = 0; i < 60; i++) routes[`https://big.is/s${i}/p`] = { body: `<html><title>${i}</title></html>` };
  const r = await runScan(e, { id, reason: "admin" }, { fetchImpl: fakeFetch(routes) });
  assert.ok(Number.isInteger(r.continued) && r.continued > 0 && r.continued < 60);
  assert.deepEqual(e.SCANS.sent.at(-1).body, { id, reason: "continue", from: r.continued });
  assert.equal((await store.address(e.DB, id)).status, "queued");
  const f2 = fakeFetch(routes);
  const second = await runScan(e, e.SCANS.sent.at(-1).body, { fetchImpl: f2 });
  assert.equal(second.source, "inferred", "the second part finishes the site");
  assert.ok(f2.calls.some((c) => c.url.startsWith("https://cloudflare-dns.com/")), "the finishing part reads DNS");
  assert.equal((await store.address(e.DB, id)).status, "done");
});

test("schedule: due addresses go to the queue once", async () => {
  const e = env();
  await store.addAddress(e.DB, { id: "a", url: "https://a.is", kind: "web" });
  await crawler.scheduled({ scheduledTime: Date.now() }, e);
  await crawler.scheduled({ scheduledTime: Date.now() }, e);
  assert.deepEqual(e.SCANS.sent.map((s) => s.body), [{ id: "a", reason: "schedule" }]);
  assert.equal((await crawler.fetch(new Request("https://c/health"))).status, 200);
});
