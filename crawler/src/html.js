// Reading a fetched HTML page: what it is called, what it says, where it links and what it loads. Regular expressions, so it runs the same in Workers and in Node.

const decode = (s) => s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }[e.toLowerCase()];
  if (named) return named;
  const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
  return Number.isFinite(code) ? String.fromCodePoint(code) : m;
});
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)`, "i"));
  return m ? decode(m[1]).trim() : null;
};
const squash = (s) => s.replace(/\s+/g, " ").trim();

/** The main readable text of a page: its <main> if it has one, without scripts, navigation, headers, footers and forms. */
export function mainText(html) {
  let body = html.replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const main = body.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (main) body = main[1];
  body = body.replace(/<(nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  body = body.replace(/<(br|\/p|\/h[1-6]|\/li|\/div|\/tr)\b[^>]*>/gi, "\n");
  return decode(body.replace(/<[^>]+>/g, " ")).split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).filter(Boolean).join("\n");
}

/** What the crawler keeps about a page; `url` is where it was fetched from. The text is kept for the AI step, not shown. */
export function readPage(html, url) {
  const base = new URL(url);
  const metas = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const k = attr(tag, "name") ?? attr(tag, "property");
    const v = attr(tag, "content");
    if (k && v != null) metas[k.toLowerCase()] = v;
  }
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const internal = new Set(), external = {}, loads = {};
  for (const tag of html.match(/<a\b[^>]*>/gi) ?? []) {
    const href = attr(tag, "href");
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    let u;
    try { u = new URL(href, base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    if (u.host === base.host) internal.add(u.pathname || "/");
    else external[u.host] = (external[u.host] ?? 0) + 1;
  }
  for (const [kind, re] of [["script", /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)/gi], ["style", /<link\b[^>]*\bhref\s*=\s*["']([^"']+)/gi], ["image", /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)/gi], ["frame", /<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)/gi]]) {
    for (const m of html.matchAll(re)) {
      let u;
      try { u = new URL(decode(m[1]), base); } catch { continue; }
      if (u.host && u.host !== base.host) (loads[u.host] ??= new Set()).add(kind);
    }
  }
  const types = new Set();
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) for (const t of m[1].matchAll(/"@type"\s*:\s*"([^"]+)"/g)) types.add(t[1]);
  const text = mainText(html);
  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => squash(decode(m[1].replace(/<[^>]+>/g, " ")))).filter(Boolean).slice(0, 3);
  return {
    url,
    title: title ? squash(decode(title[1])).slice(0, 200) : null,
    description: (metas.description ?? metas["og:description"] ?? "").slice(0, 300) || null,
    lang: html.match(/<html[^>]*\blang\s*=\s*["']([^"']+)/i)?.[1] ?? null,
    h1,
    words: text.split(/\s+/).filter(Boolean).length,
    links: [...internal].sort().slice(0, 300),
    linksOut: external,
    loads: Object.fromEntries(Object.entries(loads).map(([h, k]) => [h, [...k].sort()])),
    schemaTypes: [...types].sort(),
    text: text.slice(0, 20_000),
  };
}

/** The section a path belongs to: its first segment ('' for the front page). */
export const sectionOf = (path) => (path.replace(/^\/+/, "").split("/")[0] ?? "");

/** The URLs a sitemap or sitemap index lists, and whether it is an index. */
export function readSitemap(xml) {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decode(m[1]));
  const index = /<sitemapindex\b/i.test(xml);
  const lastmods = [...xml.matchAll(/<url>[\s\S]*?<\/url>/gi)].map((m) => [m[0].match(/<loc>\s*([^<\s]+)/i)?.[1], m[0].match(/<lastmod>\s*([^<\s]+)/i)?.[1] ?? null]);
  return { index, urls: index ? locs : lastmods.filter(([u]) => u).map(([u, lastmod]) => ({ url: decode(u), lastmod })) };
}
