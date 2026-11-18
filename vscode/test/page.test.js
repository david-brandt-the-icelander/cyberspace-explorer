// Tests of the webview page: its policy, nonces, the first script and the theme, against the repository's own index.html.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");
const { webviewHtml, themeFor, folderHash } = require("../src/page");

const page = readFileSync(join(__dirname, "..", "..", "index.html"), "utf8");
const options = {
  cspSource: "https://file+.vscode-resource.vscode-cdn.net",
  nonce: "abc123",
  theme: "dark",
  hash: "#worker|~space",
  workspace: { root: "file:///w/repo", label: "repo</script>", ref: "working tree", paths: [".dev/folder.json", "worker/.dev/x.json"], base: "https://file+.vscode-resource.vscode-cdn.net/w/repo/" },
};
const html = webviewHtml(page, options);

test("every script carries the nonce, and the policy allows only those and jsDelivr", () => {
  const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(scripts.length, 3);
  for (const s of scripts) assert.match(s, /nonce="abc123"/);
  assert.match(html, /script-src 'nonce-abc123' https:\/\/cdn\.jsdelivr\.net/);
  assert.match(html, /connect-src https:\/\/file\+\.vscode-resource\.vscode-cdn\.net https:\/\/cdn\.jsdelivr\.net/);
});

test("the first script comes before the page's own theme script and can't be closed by the data it carries", () => {
  const first = html.indexOf("acquireVsCodeApi"), theirs = html.indexOf("cyberspace-explorer:theme");
  assert.ok(first > 0 && first < theirs);
  assert.ok(!html.includes("repo</script>"));
});

test("the first script hands the page the workspace, the theme and the address", () => {
  const body = html.match(/<script nonce="abc123">(\(\(\) => \{\n {2}const vscode[\s\S]*?)<\/script>/)[1];
  const posted = [], attrs = {}, listeners = {};
  const html2 = { setAttribute: (k, v) => (attrs[k] = v), dataset: {} };
  const ctx = {
    acquireVsCodeApi: () => ({ postMessage: (m) => posted.push(m), setState: (s) => (ctx.state = s) }),
    document: { documentElement: html2 },
    location: { hash: "" },
    history: { replaceState: (a, b, h) => (ctx.location.hash = h) },
    addEventListener: (t, f) => (listeners[t] = f),
    encodeURIComponent,
    JSON,
  };
  ctx.window = ctx;
  vm.runInNewContext(body, ctx);
  assert.equal(attrs["data-theme-host"], "");
  assert.equal(html2.dataset.theme, "dark");
  assert.equal(ctx.location.hash, "#worker|~space");
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.state)), { root: "file:///w/repo", hash: "#worker|~space" });
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.cyberspaceWorkspace.paths)), options.workspace.paths);
  assert.equal(ctx.cyberspaceWorkspace.label, "repo</script>");
  assert.equal(ctx.cyberspaceWorkspace.blob("worker/app.js"), "command:cyberspaceExplorer.openFile?" + encodeURIComponent('["file:///w/repo","worker/app.js"]'));
  listeners.message({ data: { type: "theme", theme: "light" } });
  assert.equal(html2.dataset.theme, "light");
  assert.equal(posted.at(-1).type, "hash");
});

test("the theme follows VS Code unless the setting names one", () => {
  assert.equal(themeFor("auto", 1), "light");
  assert.equal(themeFor("auto", 2), "dark");
  assert.equal(themeFor("auto", 3), "dark");
  assert.equal(themeFor("auto", 4), "light");
  assert.equal(themeFor("light", 2), "light");
  assert.equal(themeFor("dark", 1), "dark");
});

test("a folder's address is the page's own", () => {
  assert.equal(folderHash(""), "#");
  assert.equal(folderHash("."), "#");
  assert.equal(folderHash("worker/my part"), "#worker/my%20part");
  assert.equal(folderHash("", true), "#|~space");
});
