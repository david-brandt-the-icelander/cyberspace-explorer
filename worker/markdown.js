// Just enough Markdown for docs/cyberspace-protocol.md served at /crawler: headings, paragraphs, lists, fenced code,
// tables, inline code, bold and links. Every character of the source is escaped before any markup is added.

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const DOCS = "https://github.com/david-brandt-the-icelander/cyberspace-explorer/blob/main/docs/";

/** Inline Markdown on one line: code, bold, and links, which resolve against the document's place in the repository. */
function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
      let url;
      try { url = new URL(href.replace(/&amp;/g, "&"), DOCS); } catch { return label; }
      return /^https?:$/.test(url.protocol) ? `<a href="${esc(url.href)}">${label}</a>` : label;
    });
}

/** Markdown to an HTML fragment. */
export function markdown(src) {
  const lines = src.split("\n"), out = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (/^```/.test(line.trim())) {
      const body = [];
      for (i++; i < lines.length && !/^```/.test(lines[i].trim()); i++) body.push(lines[i].replace(/^ {2,3}/, ""));
      out.push(`<pre><code>${esc(body.join("\n"))}</code></pre>`); i++; continue;
    }
    const h = line.match(/^(#{1,3}) (.+)/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^\|/.test(line)) {
      const rows = [];
      for (; i < lines.length && /^\|/.test(lines[i]); i++) rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
      const [head, , ...body] = rows;
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (/^- /.test(line)) {
      const items = [];
      for (; i < lines.length && (/^- /.test(lines[i]) || /^ {2}\S/.test(lines[i]) || (lines[i] === "" && /^( {2}|- )/.test(lines[i + 1] ?? ""))); i++) {
        if (/^- /.test(lines[i])) items.push([lines[i].slice(2)]);
        else if (/^ {2}```/.test(lines[i])) {
          const body = [];
          for (i++; i < lines.length && !/^ {2}```/.test(lines[i]); i++) body.push(lines[i].replace(/^ {2}/, ""));
          items.at(-1).push(`\u0000<pre><code>${esc(body.join("\n"))}</code></pre>`);
        } else if (lines[i].trim()) items.at(-1).push(lines[i].trim());
      }
      out.push(`<ul>${items.map((parts) => `<li>${parts.map((p) => (p.startsWith("\u0000") ? p.slice(1) : inline(p))).join(" ")}</li>`).join("")}</ul>`);
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const para = [];
    for (; i < lines.length && lines[i].trim() && !/^(#|```|\||- )/.test(lines[i]); i++) para.push(lines[i].trim());
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("\n");
}

/** The protocol as a page of its own. */
export function protocolPage(src) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>cyberspace-crawler</title><style>
:root { color-scheme: light dark; --paper: #edf1f1; --sheet: #f8fafa; --ink: #1d2b33; --ink2: #56666e; --rule: #c9d3d5; --accent: #2c6e8e; }
@media (prefers-color-scheme: dark) { :root { --paper: #10181d; --sheet: #152128; --ink: #dce5e5; --ink2: #9aabb1; --rule: #2a3a42; --accent: #6cb2d6; } }
body { margin: 0; background: var(--paper); color: var(--ink); font: 400 16px/1.6 "Avenir Next", system-ui, sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 40px max(18px, env(safe-area-inset-left)) 64px; }
h1 { font-size: 34px; line-height: 1.1; margin: 0 0 16px; } h2 { margin-top: 36px; font-size: 22px; } h1, h2 { text-wrap: balance; }
a { color: var(--accent); } code { font: .88em ui-monospace, Menlo, Consolas, monospace; }
pre { background: var(--sheet); border: 1px solid var(--rule); border-radius: 8px; padding: 12px 14px; overflow-x: auto; }
table { border-collapse: collapse; width: 100%; display: block; overflow-x: auto; } th, td { text-align: left; vertical-align: top; padding: 8px 10px; border-bottom: 1px solid var(--rule); }
th { color: var(--ink2); font-weight: 600; } li { margin: 4px 0; }
</style></head><body><main>${markdown(src)}</main></body></html>`;
}
