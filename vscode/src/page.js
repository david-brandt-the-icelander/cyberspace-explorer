// Turns the explorer's index.html into a webview page: a content security policy, a nonce on every script, and a first
// script that hands the page the workspace, the theme and the address it was at. No vscode import, so it is tested in Node.

/** The hosts the page loads from besides the webview: jsDelivr serves the typefaces, dagre and three.js. */
const CDN = "https://cdn.jsdelivr.net";

/** JSON safe inside a <script>: no "</script>" and no line separators can end it early. */
const scriptJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/** The policy: scripts only with the nonce or from jsDelivr, files from the webview's own resources (the workspace). */
function csp(cspSource, nonce) {
  return [
    "default-src 'none'",
    `img-src ${cspSource} https: data:`,
    `style-src ${cspSource} 'unsafe-inline' ${CDN}`,
    `font-src ${cspSource} ${CDN} data:`,
    `script-src 'nonce-${nonce}' ${CDN}`,
    `connect-src ${cspSource} ${CDN}`,
  ].join("; ");
}

/** The first script: html[data-theme] owned by the host, the workspace for the page's local source, the address restored,
 *  and messages from the extension (a new theme) and to it (the address, as the reader moves). */
function bootstrap({ workspace, theme, hash }) {
  return `(() => {
  const vscode = acquireVsCodeApi(), html = document.documentElement, root = ${scriptJson(workspace.root)};
  html.setAttribute("data-theme-host", "");
  html.dataset.theme = ${scriptJson(theme)};
  window.cyberspaceWorkspace = {
    label: ${scriptJson(workspace.label)}, ref: ${scriptJson(workspace.ref)}, paths: ${scriptJson(workspace.paths)}, base: ${scriptJson(workspace.base)},
    blob: (path) => "command:cyberspaceExplorer.openFile?" + encodeURIComponent(JSON.stringify([root, path])),
    home: "#",
  };
  const hash = ${scriptJson(hash ?? "")};
  if (hash) history.replaceState(null, "", hash);
  const tell = () => { vscode.setState({ root, hash: location.hash }); vscode.postMessage({ type: "hash", hash: location.hash }); };
  addEventListener("hashchange", tell);
  tell();
  addEventListener("message", (e) => { if (e.data?.type === "theme") html.dataset.theme = e.data.theme; });
})();`;
}

/** The webview's HTML from the page's: { cspSource, nonce, workspace: { root, label, ref, paths, base }, theme, hash }. */
function webviewHtml(page, options) {
  const { cspSource, nonce } = options;
  const withNonce = page.replace(/<script(?=[\s>])/g, `<script nonce="${nonce}"`);
  const head = `<meta http-equiv="Content-Security-Policy" content="${csp(cspSource, nonce)}">\n<script nonce="${nonce}">${bootstrap(options)}</script>\n`;
  if (!/<head>/.test(withNonce)) throw new Error("The page has no <head>.");
  return withNonce.replace(/<head>\n?/, (m) => m + head);
}

/** The theme for VS Code's colour theme kind (1 light, 2 dark, 3 high contrast, 4 high contrast light) and the setting. */
function themeFor(setting, kind) {
  if (setting === "light" || setting === "dark") return setting;
  return kind === 1 || kind === 4 ? "light" : "dark";
}

/** The page's address for a folder relative to the workspace folder ("" for its root), in Flat or in Cyberspace. */
function folderHash(folder, space = false) {
  const f = folder === "." ? "" : folder;
  return "#" + encodeURI(f) + (space ? "|~space" : "");
}

module.exports = { webviewHtml, themeFor, folderHash, csp };
