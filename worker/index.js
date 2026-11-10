// The Worker at icelander.net/v1/apps/architecture-browser (wrangler.jsonc). The page is the source text of ../index.html.
import html from "../index.html";
import { createHandler } from "./app.js";

export default { fetch: createHandler(html) };
