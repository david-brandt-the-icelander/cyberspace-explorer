# Cyberspace Explorer for VS Code

Browse the workspace's `.dev` views (diagrams, behavior views and knowledge files) inside VS Code: flat, as drawings, cards and tables, or in Cyberspace, as a 3D city to fly through. It is the [cyberspace explorer](https://cyberspace-explorer.com) page itself, reading the files on disk instead of a GitHub or GitLab repository, so it needs no token and shows work that isn't committed yet.

## Use

- **Cyberspace Explorer: Open** (Command Palette) opens the views of the workspace folder holding the active file, or asks which folder in a multi-root workspace.
- **Cyberspace Explorer: Open in Cyberspace (3D)** opens the same at the root folder's tower.
- **Open in Cyberspace Explorer** on a folder in the Explorer opens at that folder.
- Paths in the inspector and the cards open the file beside the explorer, or reveal the folder.
- The panel reloads when a `.dev/*.json` file (or one under `.cyberspace-explorer/`) changes, and stays where it was. **Cyberspace Explorer: Reload** does it by hand.

## Light and dark

The explorer follows VS Code's colour theme (light and high-contrast light themes are light, the rest dark), in Flat and in Cyberspace, and repaints as soon as the theme changes. Set `cyberspaceExplorer.theme` to `light` or `dark` to fix one.

## Network

The page loads its typefaces, the drawing library (dagre) and three.js from cdn.jsdelivr.net, as the website does. Offline, every drawing falls back to its tables and Cyberspace says why it can't start. The workspace's files are read through the webview and go nowhere else.

## Build

From this folder, with Node 20 or later:

```bash
npm test
npm run package
```

`npm run package` copies the repository's `index.html` and `LICENSE` here (`vscode:prepublish`) and builds `cyberspace-explorer-<version>.vsix` with `@vscode/vsce`; install it with **Extensions: Install from VSIX…**. While developing, open this folder in VS Code and press F5: the extension reads `../index.html` when `media/index.html` isn't there.
