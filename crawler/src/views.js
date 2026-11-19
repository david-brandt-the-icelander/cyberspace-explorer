// Views made from what the AI step read: code, not the model, writes them, so they always follow Meta/Agents/Skills and
// the knowledge catalogue. Paths are tree paths: "x.json" for the address as a whole, "<section>/x.json" for one section.

import { registrable } from "./web.js";

const FAMILY_NAMES = { commerce: "Commerce", service: "Service", content: "Content", corporate: "Corporate", fine_print: "Fine print" };
const FAMILY_ORDER = ["commerce", "service", "content", "corporate", "fine_print"];
const MAX_SECTIONS = 60, MAX_EXTERNALS = 14;
const slug = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";

/** A name for an outside host: the registrable domain, or a known provider's name. */
export function providerOf(host) {
  const h = host.toLowerCase();
  const known = [
    [/cloudfront|amazonaws|awsstatic/, "Amazon Web Services"], [/googletagmanager|google-analytics|gstatic|googleapis|doubleclick|google\./, "Google"],
    [/facebook|fbcdn|instagram/, "Meta"], [/cloudflare/, "Cloudflare"], [/azure|microsoft|windows\.net|msecnd/, "Microsoft"],
    [/webflow|website-files/, "Webflow"], [/jsdelivr/, "jsDelivr"], [/unpkg/, "unpkg"], [/datocms/, "DatoCMS"], [/algolia/, "Algolia"],
    [/hotjar/, "Hotjar"], [/cookiebot/, "Cookiebot"], [/onetrust|cookielaw/, "OneTrust"], [/sentry/, "Sentry"], [/tiktok/, "TikTok"], [/linkedin|licdn/, "LinkedIn"],
  ];
  return known.find(([re]) => re.test(h))?.[1] ?? registrable(h);
}

/**
 * The views of a website, from its collected facts and its sections' readings. `classes` maps a section name to its
 * reading, or { withheld } / { declined } when it has none. Returns { path: document }.
 */
export function siteViews({ site, classes, pages, label, front }) {
  const name = label || new URL(site.origin).host;
  const read = (n) => (classes[n] && classes[n].function ? classes[n] : null);
  const sections = Object.keys(site.sections).filter((n) => n !== "" && read(n))
    .sort((a, b) => (site.sections[b].urls ?? 0) - (site.sections[a].urls ?? 0)).slice(0, MAX_SECTIONS);
  const families = FAMILY_ORDER.filter((f) => sections.some((n) => read(n).family === f));
  // Outside hosts each section's pages load, grouped by provider.
  const supplies = new Map();
  for (const p of pages) {
    const sec = new URL(p.url).pathname.replace(/^\/+/, "").split("/")[0] ?? "";
    for (const h of Object.keys(p.loads ?? {})) {
      const prov = providerOf(h);
      const s = supplies.get(prov) ?? { hosts: new Set(), sections: new Set(), pages: 0 };
      s.hosts.add(h); s.sections.add(sec); s.pages++;
      supplies.set(prov, s);
    }
  }
  const externals = [...supplies].sort((a, b) => b[1].pages - a[1].pages).slice(0, MAX_EXTERNALS);
  const ext = (prov) => `ext-${slug(prov)}`;
  const comp = (n) => `section-${slug(n)}`;
  const source = { path: "/", symbol: site.origin };

  const components = [
    { id: "site", name, responsibility: (read("")?.summary_en || site.front?.description || `The website at ${site.origin}.`).slice(0, 300), folder: "." },
    ...families.map((f) => ({ id: `zone-${f}`, name: `${FAMILY_NAMES[f]} zone`, responsibility: `The sections that are for ${FAMILY_NAMES[f].toLowerCase()}.`, folder: `zones/${f}` })),
    ...sections.map((n) => ({ id: comp(n), name: read(n).name_en || "/" + n, responsibility: `${read(n).summary_en || "/" + n} (${site.sections[n].urls || (site.sections[n].read ?? []).length} pages)`.slice(0, 300), folder: n })),
    ...externals.map(([prov, s]) => ({ id: ext(prov), name: prov, responsibility: `Loaded by ${s.pages} page(s) from ${[...s.hosts].slice(0, 3).join(", ")}.`, external: true })),
  ];
  const relationships = [
    ...families.map((f) => ({ from: "site", to: `zone-${f}`, kind: "contains", description: "A zone, by what its sections are for." })),
    ...sections.map((n) => ({ from: `zone-${read(n).family}`, to: comp(n), kind: "contains", description: `For ${read(n).audience.join(", ")}; ${read(n).interaction}.` })),
    ...externals.flatMap(([prov, s]) => [...s.sections].map((sec) => (sec === "" || sections.includes(sec) ? { from: sec === "" ? "site" : comp(sec), to: ext(prov), kind: "depends-on", description: "Its pages load from it." } : null)).filter(Boolean)),
  ];
  const files = {
    "component-diagram.json": {
      kind: "component", title: `${name}: its parts`, folder: ".",
      description: `${name} as an AI reading of its public pages sees it: ${sections.length} sections on zones by what they are for, and the outside services its pages load. Inferred, not declared by the site.`,
      sources: [source], components, relationships: dedupe(relationships),
    },
  };

  // Where it runs: the front door, DNS, mail and the providers its pages load from.
  const dns = site.dns ?? {};
  const nodes = [
    { id: "visitor", name: "Visitor's browser", kind: "client", description: "Anyone opening the site." },
    { id: "site", name: new URL(site.origin).host, kind: "host", description: `Answers at ${site.origin}${(dns.A ?? []).length ? `, at ${dns.A.slice(0, 3).join(", ")}` : ""}.` },
  ];
  const deps = [{ from: "visitor", to: "site", kind: "connects-to", description: "Opens its pages over HTTPS." }];
  const ns = [...new Set((dns.NS ?? []).map(registrable))];
  if (ns.length) { nodes.push({ id: "dns", name: ns.join(", "), kind: "external-service", description: "Answers DNS for the domain." }); deps.push({ from: "site", to: "dns", kind: "connects-to", description: "Its name is delegated there." }); }
  const mx = [...new Set((dns.MX ?? []).map((m) => providerOf(String(m).split(" ").pop())))];
  if (mx.length) { nodes.push({ id: "mail", name: mx.join(", "), kind: "external-service", description: "Receives the domain's mail." }); deps.push({ from: "site", to: "mail", kind: "connects-to", description: "MX records point there." }); }
  for (const [prov, s] of externals.slice(0, 8)) {
    nodes.push({ id: ext(prov), name: prov, kind: "external-service", description: `Serves ${[...s.hosts].slice(0, 3).join(", ")}.` });
    deps.push({ from: "visitor", to: ext(prov), kind: "connects-to", description: "The pages load from it." });
  }
  files["deployment-diagram.json"] = {
    kind: "deployment", title: `${name}: where it runs`, folder: ".", description: `What DNS and the pages themselves show about where ${name} runs.`,
    sources: [source], nodes, artifacts: [{ id: "website", name: site.origin, source: "/", deployedTo: "site", description: (front?.title ?? name).slice(0, 200) }], relationships: deps,
  };

  // The site's own record, and one per section with its reading, which Cyberspace uses to shape the section's building.
  const mix = Object.fromEntries(families.map((f) => [f, sections.filter((n) => read(n).family === f).length]));
  files["folder.json"] = {
    kind: "folder", title: name, folder: ".",
    entities: [{
      id: "site", title: name, summary: (read("")?.summary_en || site.front?.description || `The website at ${site.origin}.`).slice(0, 300),
      purpose: `What ${name} offers its visitors, as read from its public pages.`,
      details: `Read by cyberspace-crawler on ${site.observedAt?.slice(0, 10)}: ${Object.keys(site.sections).length} sections, ${site.sitemap?.urls ?? 0} URLs in its sitemaps. Sections by zone: ${families.map((f) => `${FAMILY_NAMES[f].toLowerCase()} ${mix[f]}`).join(", ") || "none read"}.`,
      evidenceStatus: "inferred", zones: mix, registered: site.rdap?.registered ?? null, registrant: site.rdap?.registrant ?? null,
      sources: [source],
    }],
  };
  for (const n of sections) {
    const c = read(n);
    files[`${n}/folder.json`] = {
      kind: "folder", title: c.name_en || "/" + n, folder: n,
      entities: [{
        id: slug(n), title: c.name_en || "/" + n, summary: c.summary_en || `The section /${n}.`, purpose: c.summary_en || `The section /${n}.`,
        evidenceStatus: "inferred", confidence: c.confidence, evidence: c.evidence,
        function: c.function, family: c.family, audience: c.audience, interaction: c.interaction, dataSensitivity: c.data_sensitivity, lifecycle: c.lifecycle, topics: c.topics,
        urls: site.sections[n].urls ?? 0, newestLastModified: site.sections[n].newest ?? null,
        sources: (site.sections[n].samples ?? []).slice(0, 3).map((p) => ({ path: p, symbol: c.name_en || n })),
      }],
    };
  }
  return files;
}

/** The views of a repository without any: the parts the AI step proposed, kept only where their folders exist. */
export function repoViews({ repo, data, label }) {
  const folders = new Set([".", ...Object.keys(repo.layout ?? {})]);
  const inLayout = (f) => folders.has(f) || [...folders].some((d) => d.startsWith(f + "/"));
  const comps = (data.components ?? []).filter((c) => c.id && inLayout(c.folder || ".")).slice(0, 12)
    .map((c) => ({ id: slug(c.id), name: c.name.slice(0, 80), responsibility: c.responsibility.slice(0, 300), folder: c.folder || "." }));
  const exts = (data.externals ?? []).slice(0, 10).map((e) => ({ id: `ext-${slug(e.id)}`, name: e.name.slice(0, 80), responsibility: e.responsibility.slice(0, 300), external: true }));
  const ids = new Map([...comps.map((c) => [c.id, c.id]), ...exts.map((e) => [e.id.slice(4), e.id])]);
  const rels = (data.relationships ?? []).map((r) => ({ from: ids.get(slug(r.from)), to: ids.get(slug(r.to)), kind: "depends-on", description: r.description.slice(0, 200) }))
    .filter((r) => r.from && r.to && r.from !== r.to);
  const name = label || repo.url;
  const source = { path: "README.md", symbol: name };
  return {
    "component-diagram.json": {
      kind: "component", title: `${name}: its parts`, folder: ".",
      description: `${data.summary.slice(0, 300)} Inferred by an AI reading of its layout, README and manifests at ${repo.head?.slice(0, 7)}.`,
      sources: [source],
      components: [...(comps.length ? comps : [{ id: "repository", name, responsibility: data.summary.slice(0, 300), folder: "." }]), ...exts],
      relationships: dedupe(rels),
    },
    "folder.json": { kind: "folder", title: name, folder: ".", entities: [{ id: "repository", title: name, summary: data.summary.slice(0, 300), purpose: data.summary.slice(0, 300), evidenceStatus: "inferred", sources: [source] }] },
  };
}

/** Relationships without repeats. */
function dedupe(rels) {
  const seen = new Set();
  return rels.filter((r) => { const k = `${r.from}>${r.to}>${r.kind}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
