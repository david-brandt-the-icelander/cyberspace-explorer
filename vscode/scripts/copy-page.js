// Copies the explorer's page (the repository's index.html) and the licence into the extension, where the package reads them.
const { copyFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

const here = join(__dirname, ".."), root = join(here, "..");
mkdirSync(join(here, "media"), { recursive: true });
copyFileSync(join(root, "index.html"), join(here, "media", "index.html"));
copyFileSync(join(root, "LICENSE"), join(here, "LICENSE"));
console.log("media/index.html and LICENSE copied from the repository root");
