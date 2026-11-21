// Git repositories on GitHub and GitLab: read through their APIs, and only what the history says changed since the last scan.

import { gitParts } from "./address.js";
import { putJson, getJson } from "./store.js";

const VIEW = /(^|\/)\.dev\/[^/]+\.json$/;
const TREE = /^\.cyberspace-explorer\/.+\.json$/;
const KEY_FILES = /^(readme(\.[a-z]+)?|package\.json|cargo\.toml|go\.mod|pyproject\.toml|setup\.py|pom\.xml|build\.gradle(\.kts)?|[^/]+\.csproj|dockerfile|docker-compose\.ya?ml|wrangler\.(toml|jsonc?)|agents\.md|claude\.md|\.github\/workflows\/[^/]+\.ya?ml)$/i;
const MAX_KEY_FILES = 25, MAX_KEY_BYTES = 60_000, MAX_COMPARE = 300;

/** The API calls for a repository on its host. `token` is that host's own token, never another host's. */
function api(parts, token) {
  const auth = token ? { authorization: `Bearer ${token}` } : {};
  if (parts.host === "github.com") {
    const R = `https://api.github.com/repos/${parts.owner}/${parts.repo}`;
    const gh = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...auth };
    return {
      repo: () => [R, gh],
      head: (ref) => [`${R}/commits/${encodeURIComponent(ref)}`, { ...gh, accept: "application/vnd.github.sha" }],
      tree: (sha) => [`${R}/git/trees/${sha}?recursive=1`, gh],
      compare: (a, b) => [`${R}/compare/${a}...${b}`, gh],
      raw: (sha, path) => [`https://raw.githubusercontent.com/${parts.owner}/${parts.repo}/${sha}/${path.split("/").map(encodeURIComponent).join("/")}`, auth],
      defaultBranch: (d) => d?.default_branch,
      headSha: (r) => (r.text ?? "").trim(),
      paths: async (get, sha) => {
        const t = await get(...api(parts, token).tree(sha));
        return { paths: (t.data?.tree ?? []).filter((e) => e.type === "blob").map((e) => e.path), truncated: !!t.data?.truncated };
      },
      changed: (d) => d?.files?.length >= MAX_COMPARE ? null : (d?.files ?? []).flatMap((f) => [f.filename, f.previous_filename].filter(Boolean)),
    };
  }
  const P = `https://${parts.host}/api/v4/projects/${encodeURIComponent(`${parts.owner}/${parts.repo}`)}`;
  return {
    repo: () => [P, auth],
    head: (ref) => [`${P}/repository/commits/${encodeURIComponent(ref)}`, auth],
    compare: (a, b) => [`${P}/repository/compare?from=${a}&to=${b}`, auth],
    raw: (sha, path) => [`${P}/repository/files/${encodeURIComponent(path)}/raw?ref=${sha}`, auth],
    defaultBranch: (d) => d?.default_branch,
    headSha: (r) => { try { return JSON.parse(r.text).id; } catch { return null; } },
    paths: async (get, sha) => {
      const out = [];
      for (let page = 1; page <= 50; page++) {
        const r = await get(`${P}/repository/tree?recursive=true&per_page=100&page=${page}&ref=${sha}`, auth);
        const rows = r.data ?? [];
        out.push(...rows.filter((e) => e.type === "blob").map((e) => e.path));
        if (rows.length < 100) return { paths: out, truncated: false };
      }
      return { paths: out, truncated: true };
    },
    changed: (d) => (d?.diffs ?? []).flatMap((f) => [f.new_path, f.old_path].filter(Boolean)),
  };
}

/** The repository paths that are views, inside the address's folder: the .cyberspace-explorer tree when there is one, otherwise every .dev file. */
export function viewPaths(paths, folder = "") {
  const inside = (p) => !folder || p === folder || p.startsWith(folder + "/");
  const tree = paths.filter((p) => TREE.test(p));
  return (tree.length ? tree : paths.filter((p) => VIEW.test(p) && inside(p))).sort();
}

/** The repository files a view cites as its sources. */
export function citedPaths(view) {
  const out = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      if (typeof v.path === "string") out.add(v.path);
      if (typeof v.source === "string" && !/^https?:/.test(v.source)) out.add(v.source);
      Object.values(v).forEach(walk);
    }
  };
  walk(view.sources ?? []);
  walk(view.artifacts ?? []);
  walk(view.entities ?? []);
  return [...out];
}

/** A summary of a repository's layout for the AI step: folders with their file counts and kinds of file. */
export function layout(paths) {
  const dirs = {};
  for (const p of paths) {
    const parts = p.split("/");
    const dir = parts.length > 1 ? parts.slice(0, Math.min(2, parts.length - 1)).join("/") : ".";
    const ext = (parts.at(-1).match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
    const d = (dirs[dir] ??= { files: 0, kinds: {} });
    d.files++;
    if (ext) d.kinds[ext] = (d.kinds[ext] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(dirs).sort((a, b) => b[1].files - a[1].files).slice(0, 200));
}

/**
 * Scans a repository. `prev` is the last index written for it, or null. Writes changed view files under space/<id>/files/,
 * or, when the repository has no views, a summary under space/<id>/raw/repo.json for the AI step. Returns the new index.
 */
export async function scanGit({ fetcher, bucket, id, url, prev, tokens = {} }) {
  const parts = gitParts(url);
  const A = api(parts, tokens[parts.host]);
  const get = (u, headers) => fetcher.json(u, { robots: false, headers });
  const fetchText = ([u, headers]) => fetcher.get(u, { robots: false, headers });
  const repo = await get(...A.repo());
  if (repo.status !== 200) throw new Error(`${url}: the host answered ${repo.status}${repo.status === 404 ? " (missing or private)" : ""}`);
  const ref = parts.ref ?? A.defaultBranch(repo.data);
  const headRes = await fetchText(A.head(ref));
  const head = headRes.status === 200 ? A.headSha(headRes) : null;
  if (!head) throw new Error(`${url}: could not read the head of ${ref}`);
  if (prev?.head === head) return { ...prev, unchanged: true, changed: 0 };

  const { paths, truncated } = await A.paths(get, head);
  let changedPaths = null;
  if (prev?.head) {
    const cmp = await get(...A.compare(prev.head, head));
    if (cmp.status === 200) changedPaths = A.changed(cmp.data);
  }
  const changedSet = changedPaths ? new Set(changedPaths) : null;
  const views = viewPaths(paths, parts.folder);
  const prefix = `space/${id}/files/`;
  let changed = 0;
  for (const p of views) {
    if (changedSet && !changedSet.has(p) && prev?.paths?.includes(p)) continue;
    const r = await fetchText(A.raw(head, p));
    if (r.status === 200) { await bucket.put(prefix + p, r.text, { httpMetadata: { contentType: "application/json" } }); changed++; }
  }
  for (const p of prev?.paths ?? []) if (!views.includes(p)) { await bucket.delete(prefix + p); changed++; }

  // Views whose cited sources changed since the last scan, for the explorer to mark and the AI step to look at.
  const stale = [];
  if (changedSet) {
    for (const p of views) {
      const view = await getJson(bucket, prefix + p).catch(() => null);
      if (view && citedPaths(view).some((c) => changedSet.has(c))) stale.push(p);
    }
  }

  let needsAi = 0;
  if (!views.length) {
    const before = (await getJson(bucket, `space/${id}/raw/repo.json`)) ?? { files: {} };
    const keys = paths.filter((p) => KEY_FILES.test(p) || (KEY_FILES.test(p.split("/").at(-1)) && p.split("/").length <= 2)).slice(0, MAX_KEY_FILES);
    const files = {};
    for (const p of keys) {
      if (changedSet && !changedSet.has(p) && before.files[p] != null) { files[p] = before.files[p]; continue; }
      const r = await fetchText(A.raw(head, p));
      if (r.status === 200) files[p] = r.text.slice(0, MAX_KEY_BYTES);
    }
    await putJson(bucket, `space/${id}/raw/repo.json`, {
      url, ref, head, description: repo.data?.description ?? null, topics: repo.data?.topics ?? [], language: repo.data?.language ?? null,
      paths: paths.length, truncated, layout: layout(paths), files, changedSince: prev?.head ?? null, changedPaths: changedPaths?.slice(0, 500) ?? null,
    });
    needsAi = 1;
    changed = changedPaths ? changedPaths.length : paths.length;
  }

  return { kind: "git", url, ref, head, source: views.length ? "repository" : "inferred", paths: views, stale, truncated, changed, needsAi, label: `${parts.owner}/${parts.repo}` };
}
