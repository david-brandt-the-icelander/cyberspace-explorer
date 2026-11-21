// The Worker at cyberspace-explorer.com (wrangler.jsonc). The page is the source text of ../index.html; /admin is
// admin.html, and /crawler is the cyberspace protocol, rendered once at start-up.
import html from "../index.html";
import admin from "./admin.html";
import protocol from "../docs/cyberspace-protocol.md";
import { createHandler } from "./app.js";
import { protocolPage } from "./markdown.js";

export default { fetch: createHandler(html, undefined, { admin, protocol: protocolPage(protocol) }) };
