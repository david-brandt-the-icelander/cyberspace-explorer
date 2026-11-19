// Websites: what a cooperating site declares at /.well-known/cyberspace.json, or else what can be read from its robots.txt,
// sitemaps, pages, DNS and registration, gathered for the AI step.

import { WELL_KNOWN, readDeclaration, noAi, givesViews } from "./wellknown.js";
import { readPage, readSitemap, sectionOf } from "./html.js";
import { putJson, getJson } from "./store.js";
import { BudgetSpent } from "./fetcher.js";

const MAX_SITEMAPS = 20, SAMPLES_PER_SECTION = 3, MAX_SECTIONS = 120;
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");

/** The registrable domain of a host: its last two labels, or three under a second-level suffix such as co.uk. */
export function registrable(host) {
  const p = host.toLowerCase().split(".");
  return p.length >= 3 && ["co", "com", "org", "net", "ac", "gov"].includes(p.at(-2)) && p.at(-1).length === 2 ? p.slice(-3).join(".") : p.slice(-2).join(".");
}

/** A TXT record with any verification token replaced: SPF and DMARC records stay whole, others keep only the name before the token. */
export function redactTxt(data) {
  const s = String(data).replace(/^"|"$/g, "");
  return /^v=/i.test(s) ? s : s.replace(/^([A-Za-z0-9_.-]+[=:]).*$/s, "$1[redacted]");
}

/** DNS records of a host through DNS over HTTPS. TXT records keep only what names a service, never a token. */
async function dns(fetcher, host) {
  const out = {};
  for (const type of ["A", "AAAA", "CNAME", "NS", "MX", "TXT"]) {
    const r = await fetcher.json(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, { robots: false, headers: { accept: "application/dns-json" } });
    out[type] = (r.data?.Answer ?? []).map((a) => type === "TXT" ? redactTxt(a.data) : String(a.data).replace(/\.$/, ""));
  }
  return out;
}

/** Registration facts from RDAP: dates, status, name servers and the registrant's organisation name when public. */
async function rdap(fetcher, domain) {
  const r = await fetcher.json(`https://rdap.org/domain/${domain}`, { robots: false });
  const d = r.data;
  if (!d) return null;
  const ev = Object.fromEntries((d.events ?? []).map((e) => [e.eventAction, e.eventDate]));
  const registrant = (d.entities ?? []).find((e) => e.roles?.includes("registrant"));
  const fn = registrant?.vcardArray?.[1]?.find((f) => f[0] === "fn")?.[3] ?? null;
  const kind = registrant?.vcardArray?.[1]?.find((f) => f[0] === "kind")?.[3] ?? null;
  return { registered: ev.registration ?? null, changed: ev["last changed"] ?? null, expires: ev.expiration ?? ev["soft expiration"] ?? null,
    status: d.status ?? [], nameservers: (d.nameservers ?? []).map((n) => n.ldhName?.toLowerCase()), registrant: kind === "org" ? fn : null };
}

/** Reads every sitemap robots.txt names (or /sitemap.xml), following one level of sitemap index; returns the site's sections with their sizes and samples. */
async function sitemaps(fetcher, origin, named) {
  const queue = named.length ? [...named] : [`${origin}/sitemap.xml`];
  const seen = new Set(), sections = {};
  let urls = 0, read = 0;
  while (queue.length && read < MAX_SITEMAPS) {
    const sm = queue.shift();
    if (seen.has(sm)) continue;
    seen.add(sm);
    const r = await fetcher.get(sm);
    read++;
    if (r.status !== 200 || !r.text) continue;
    const s = readSitemap(r.text);
    if (s.index) { queue.push(...s.urls); continue; }
    for (const { url, lastmod } of s.urls) {
      let u;
      try { u = new URL(url); } catch { continue; }
      if (u.origin !== origin) continue;
      urls++;
      const sec = (sections[sectionOf(u.pathname)] ??= { urls: 0, newest: null, samples: [] });
      sec.urls++;
      if (lastmod && (!sec.newest || lastmod > sec.newest)) sec.newest = lastmod;
      if (sec.samples.length < SAMPLES_PER_SECTION) sec.samples.push(u.pathname + u.search);
    }
  }
  return { read, urls, sections };
}

/**
 * Scans a website. `prev` is its last index or null; `from` is where a scan cut short by its budget left off.
 * Returns the new index, with `continueFrom` set when the budget ran out before every section was read.
 */
export async function scanWeb({ fetcher, bucket, id, url: origin, prev, from = 0, addRelated }) {
  const wk = await fetcher.json(origin + WELL_KNOWN);
  let declarationError = null, partial = null;
  if (wk.status === 200) {
    const decl = readDeclaration(wk.data, origin);
    if (decl.error) declarationError = decl.error;
    else if (givesViews(decl)) return declared({ fetcher, bucket, id, origin, prev, decl, addRelated, changed: wk.changed });
    else partial = decl;
  }
  const related = [];
  if (partial && addRelated) for (const r of partial.related) related.push(await addRelated(r.url, r.relation, false));

  const raw = `space/${id}/raw/`;
  const before = (await getJson(bucket, raw + "site.json")) ?? { sections: {} };
  const host = new URL(origin).host;
  const robots = await fetcher.robotsFor(origin);
  const front = await fetcher.get(origin + "/");
  if (front.status === 0) throw new Error(`${origin} did not answer`);
  const frontPage = front.status === 200 ? readPage(front.text, origin + "/") : null;
  const maps = await sitemaps(fetcher, origin, robots.sitemaps);

  // Sections: from the sitemaps, and from the front page's own links when there is no sitemap.
  const sections = maps.sections;
  for (const link of frontPage?.links ?? []) {
    const sec = (sections[sectionOf(link)] ??= { urls: 0, newest: null, samples: [] });
    if (sec.samples.length < SAMPLES_PER_SECTION && !sec.samples.includes(link)) sec.samples.push(link);
  }
  const names = Object.keys(sections).sort((a, b) => sections[b].urls - sections[a].urls).slice(0, MAX_SECTIONS);
  const work = names.flatMap((n) => sections[n].samples.map((p) => [n, p]));
  let changedPages = front.changed ? 1 : 0, i = from, continueFrom = null;
  if (frontPage) await putJson(bucket, `${raw}pages/${await sha(origin + "/")}.json`, frontPage);
  try {
    for (; i < work.length; i++) {
      const [name, path] = work[i];
      const pageUrl = origin + path;
      const r = await fetcher.get(pageUrl);
      const sec = sections[name];
      sec.read ??= [];
      if (r.status === "disallowed") { sec.disallowed = true; continue; }
      if (r.status !== 200 || !r.text || !/<html|<body|<!doctype/i.test(r.text.slice(0, 2000))) continue;
      const key = await sha(pageUrl);
      sec.read.push(key);
      if (r.changed) { changedPages++; await putJson(bucket, `${raw}pages/${key}.json`, readPage(r.text, pageUrl)); }
    }
  } catch (e) {
    if (!(e instanceof BudgetSpent)) throw e;
    continueFrom = i;
  }
  for (const n of names) if (!sections[n].read && before.sections[n]?.read) sections[n].read = before.sections[n].read;

  const site = {
    origin, observedAt: new Date().toISOString(), declarationError,
    robots: { sitemaps: robots.sitemaps, rules: robots.rules.length },
    sitemap: { read: maps.read, urls: maps.urls },
    front: frontPage && { ...frontPage, text: undefined },
    sections: Object.fromEntries(names.map((n) => [n, sections[n]])),
    dns: continueFrom === null ? await dns(fetcher, host).catch(() => null) : before.dns ?? null,
    rdap: continueFrom === null ? await rdap(fetcher, registrable(host)).catch(() => null) : before.rdap ?? null,
  };
  await putJson(bucket, raw + "site.json", site);
  return {
    kind: "web", url: origin, source: "inferred", paths: prev?.source === "inferred" ? prev.paths ?? [] : [],
    label: partial?.name ?? frontPage?.title?.slice(0, 80) ?? host, changed: changedPages, needsAi: changedPages > 0 || (prev?.needsAi ?? 0) ? 1 : 0,
    continueFrom, declarationError, name: partial?.name ?? null, noAi: partial?.noAi ?? [], related: related.filter(Boolean),
  };
}

/** A cooperating site: its declared views are copied, its repository and related addresses are added for the crawler. */
async function declared({ fetcher, bucket, id, origin, prev, decl, addRelated, changed }) {
  const prefix = `space/${id}/files/`;
  let paths = [], files = 0;
  if (decl.tree) {
    for (const f of decl.tree.files) {
      const r = await fetcher.get(decl.tree.base + f);
      if (r.status !== 200) continue;
      try { JSON.parse(r.text); } catch { continue; }
      if (r.changed || !prev?.paths?.includes(f)) { await bucket.put(prefix + f, r.text, { httpMetadata: { contentType: "application/json" } }); files++; }
      paths.push(f);
    }
    for (const p of prev?.paths ?? []) if (!paths.includes(p)) { await bucket.delete(prefix + p); files++; }
  }
  const related = [];
  if (addRelated) {
    if (decl.repository) related.push(await addRelated(decl.repository, "repository", true));
    for (const r of decl.related) related.push(await addRelated(r.url, r.relation, false));
  }
  return {
    kind: "web", url: origin, source: "well-known", label: decl.name, paths, changed: files + (changed ? 1 : 0), needsAi: 0,
    repository: decl.repository, related: related.filter(Boolean), noAi: decl.noAi,
  };
}

export { noAi };
