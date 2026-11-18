// The Cyberspace Explorer extension: the explorer's page in a webview panel, reading a workspace folder's .dev files.
const vscode = require("vscode");
const { randomBytes } = require("node:crypto");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { webviewHtml, themeFor, folderHash } = require("./page");

/** The .dev files the page reads, and the root tree that can stand in for them. */
const VIEWS = "{**/.dev/*.json,.cyberspace-explorer/**/*.json}";
const SKIP = "**/{node_modules,target,.git}/**";

/** One open panel per workspace folder, by its URI. */
const panels = new Map();
let page = null;

// The page, from media/ in a package or the repository's own index.html while developing.
async function pageHtml(context) {
  if (page) return page;
  for (const p of [join(context.extensionPath, "media", "index.html"), join(context.extensionPath, "..", "index.html")]) {
    try { return (page = await readFile(p, "utf8")); } catch { /* try the next */ }
  }
  throw new Error("The explorer's index.html is missing: run npm run vscode:prepublish in vscode/.");
}

// The theme the setting and VS Code's colour theme give.
function theme() {
  return themeFor(vscode.workspace.getConfiguration("cyberspaceExplorer").get("theme"), vscode.window.activeColorTheme.kind);
}

// The workspace folder to show: the one holding the given URI or the active editor's file, else the reader's pick.
async function pickFolder(uri) {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const at = uri ?? vscode.window.activeTextEditor?.document.uri;
  const holding = at && vscode.workspace.getWorkspaceFolder(at);
  if (holding) return holding;
  if (folders.length <= 1) return folders[0];
  return vscode.window.showWorkspaceFolderPick({ placeHolder: "Which folder's views?" });
}

// Every view file in a workspace folder, as paths relative to it with forward slashes.
async function listViews(folder) {
  const found = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, VIEWS), SKIP);
  return found.map((u) => vscode.workspace.asRelativePath(u, false)).sort();
}

// Writes the page into a panel's webview for its folder, at the address it was at.
async function render(context, entry) {
  const { panel, folder } = entry;
  const paths = await listViews(folder);
  const nonce = randomBytes(16).toString("hex");
  panel.webview.html = webviewHtml(await pageHtml(context), {
    cspSource: panel.webview.cspSource,
    nonce,
    theme: theme(),
    hash: entry.hash,
    workspace: { root: folder.uri.toString(), label: folder.name, ref: "working tree", paths, base: panel.webview.asWebviewUri(folder.uri).toString().replace(/\/?$/, "/") },
  });
}

// Sets up a panel for a folder: its options, its messages, and a reload when its views change on disk.
function adopt(context, panel, folder, hash) {
  const entry = { panel, folder, hash, timer: null };
  panels.set(folder.uri.toString(), entry);
  panel.webview.options = {
    enableScripts: true,
    enableCommandUris: ["cyberspaceExplorer.openFile"],
    localResourceRoots: [folder.uri, vscode.Uri.joinPath(context.extensionUri, "media")],
  };
  panel.title = `Cyberspace · ${folder.name}`;
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "icon.svg");
  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, VIEWS));
  const later = () => { clearTimeout(entry.timer); entry.timer = setTimeout(() => render(context, entry), 400); };
  const subs = [
    watcher, watcher.onDidChange(later), watcher.onDidCreate(later), watcher.onDidDelete(later),
    panel.webview.onDidReceiveMessage((m) => { if (m?.type === "hash" && typeof m.hash === "string") entry.hash = m.hash; }),
  ];
  panel.onDidDispose(() => { clearTimeout(entry.timer); subs.forEach((s) => s.dispose()); panels.delete(folder.uri.toString()); });
  return render(context, entry);
}

// Opens or reveals the panel for a folder; `hash`, when given, is where it goes.
async function open(context, folder, hash) {
  if (!folder) { vscode.window.showInformationMessage("Open a folder to explore its .dev views."); return; }
  const had = panels.get(folder.uri.toString());
  if (had) {
    had.panel.reveal();
    if (hash !== undefined && hash !== had.hash) { had.hash = hash; await render(context, had); }
    return;
  }
  const panel = vscode.window.createWebviewPanel("cyberspaceExplorer", `Cyberspace · ${folder.name}`, vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
  await adopt(context, panel, folder, hash);
}

// Opens a file the page links to, or reveals a folder in the Explorer.
async function openFile(root, path) {
  const uri = vscode.Uri.joinPath(vscode.Uri.parse(root), ...String(path).split("/").filter((p) => p && p !== "."));
  const stat = await vscode.workspace.fs.stat(uri).catch(() => null);
  if (!stat) { vscode.window.showWarningMessage(`${path} is not in the workspace.`); return; }
  if (stat.type & vscode.FileType.Directory) await vscode.commands.executeCommand("revealInExplorer", uri);
  else await vscode.window.showTextDocument(uri, { preview: true, viewColumn: vscode.ViewColumn.Beside });
}

function activate(context) {
  const run = (id, fn) => context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  run("cyberspaceExplorer.open", async () => open(context, await pickFolder()));
  run("cyberspaceExplorer.openSpace", async () => open(context, await pickFolder(), folderHash("", true)));
  run("cyberspaceExplorer.openFolder", async (uri) => {
    const folder = await pickFolder(uri);
    if (folder) await open(context, folder, folderHash(uri ? uri.path.slice(folder.uri.path.length).replace(/^\/+/, "") : ""));
  });
  run("cyberspaceExplorer.reload", async () => { page = null; for (const e of panels.values()) await render(context, e); });
  run("cyberspaceExplorer.openFile", openFile);
  // A new colour theme or setting reaches every panel without a reload: the page repaints, Cyberspace included.
  const retheme = () => { for (const e of panels.values()) e.panel.webview.postMessage({ type: "theme", theme: theme() }); };
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme(retheme),
    vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration("cyberspaceExplorer.theme")) retheme(); }),
    // After a reload of VS Code, panels come back where they were.
    vscode.window.registerWebviewPanelSerializer("cyberspaceExplorer", {
      async deserializeWebviewPanel(panel, state) {
        const folder = (vscode.workspace.workspaceFolders ?? []).find((f) => f.uri.toString() === state?.root) ?? (await pickFolder());
        if (!folder) { panel.dispose(); return; }
        await adopt(context, panel, folder, state?.hash);
      },
    }),
  );
}

module.exports = { activate, deactivate() {} };
