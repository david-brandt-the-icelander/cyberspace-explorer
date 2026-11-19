// /.well-known/cyberspace.json: how a cooperating website tells the crawler what to show (docs/cyberspace-protocol.md).

export const WELL_KNOWN = "/.well-known/cyberspace.json";
const RELATIONS = new Set(["subsidiary", "parent", "sibling", "partner", "same-owner", "service", "other"]);
const MAX_FILES = 500, MAX_RELATED = 50;

/** Checks a site's cyberspace.json and returns what it declares, or { error } saying what is wrong with it. `origin` is the site it came from. */
export function readDeclaration(data, origin) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { error: "not a JSON object" };
  if (data.cyberspace !== 1) return { error: "cyberspace must be 1" };
  const out = { name: typeof data.name === "string" ? data.name.slice(0, 200) : null, repository: null, tree: null, related: [], noAi: [] };
  if (data.repository != null) {
    if (typeof data.repository !== "string" || !/^https:\/\/(github\.com|gitlab\.com)\/[^/]+\/[^/]+/.test(data.repository)) return { error: "repository must be an https address on github.com or gitlab.com" };
    out.repository = data.repository;
  }
  if (data.tree != null) {
    const t = data.tree;
    if (!t || typeof t.base !== "string" || !Array.isArray(t.files)) return { error: "tree needs base and files" };
    let base;
    try { base = new URL(t.base, origin); } catch { return { error: "tree.base is not a URL" }; }
    if (base.protocol !== "https:" && base.origin !== origin) return { error: "tree.base must be https" };
    const files = t.files.filter((f) => typeof f === "string" && /^[^/][^\\]*\.json$/.test(f) && !f.split("/").includes("..")).slice(0, MAX_FILES);
    out.tree = { base: base.href.endsWith("/") ? base.href : base.href + "/", files };
  }
  if (!out.repository && !out.tree) return { error: "declare a repository or a tree" };
  for (const r of Array.isArray(data.related) ? data.related.slice(0, MAX_RELATED) : []) {
    const url = typeof r === "string" ? r : r?.url;
    if (typeof url !== "string" || !/^https?:\/\//.test(url)) continue;
    out.related.push({ url, relation: RELATIONS.has(r?.relation) ? r.relation : "other" });
  }
  for (const p of Array.isArray(data.noAi) ? data.noAi.slice(0, 200) : []) if (typeof p === "string" && p.startsWith("/")) out.noAi.push(p);
  return out;
}

/** Whether a path falls under one of the sections a site asked the AI step not to read. */
export const noAi = (declaration, path) => !!declaration?.noAi?.some((p) => path === p || path.startsWith(p.endsWith("/") ? p : p + "/"));
