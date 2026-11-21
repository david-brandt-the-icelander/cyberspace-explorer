// Addresses the crawler explores: what kind each is and its one normalized spelling.

const GIT_HOSTS = new Set(["github.com", "gitlab.com"]);

/** A URL's normalized form and kind: a repository on GitHub or GitLab is git, anything else on http(s) is web. Throws on anything else. */
export function normalize(raw) {
  const u = new URL(String(raw).trim().includes("://") ? String(raw).trim() : `https://${String(raw).trim()}`);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`Not a web address: ${raw}`);
  if (u.username || u.password) throw new Error("Addresses may not carry credentials.");
  const host = u.hostname.toLowerCase();
  if (GIT_HOSTS.has(host)) {
    const parts = u.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
    if (parts.length < 2) throw new Error(`Not a repository: ${raw}`);
    const tree = parts[2] === "tree" || parts[2] === "-" ? "/" + parts.slice(2).join("/") : "";
    return { kind: "git", url: `https://${host}/${parts[0]}/${parts[1]}${tree}`.replace(/\/+$/, ""), host };
  }
  return { kind: "web", url: `${u.protocol}//${host}${u.port ? ":" + u.port : ""}`, host };
}

/** A short stable id for a normalized URL, used as the database key and the storage prefix. */
export async function addressId(url) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url));
  return [...new Uint8Array(digest).slice(0, 10)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The parts of a git address: host, owner, repository, and the ref and folder when the URL names them. */
export function gitParts(url) {
  const u = new URL(url);
  const [owner, repo, ...rest] = u.pathname.split("/").filter(Boolean);
  let ref = null, folder = "";
  if (rest[0] === "tree") { ref = rest[1] ?? null; folder = rest.slice(2).join("/"); }
  if (rest[0] === "-" && rest[1] === "tree") { ref = rest[2] ?? null; folder = rest.slice(3).join("/"); }
  return { host: u.hostname, owner, repo, ref, folder };
}
