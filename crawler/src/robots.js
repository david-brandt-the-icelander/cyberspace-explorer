// robots.txt (RFC 9309): which paths a user agent may fetch. Longest match wins; Allow wins a tie; * and $ are understood.

/** Parses robots.txt into the rule group that applies to `agent` (its product token, matched case-insensitively), and the sitemaps it names. */
export function parseRobots(text, agent) {
  const token = agent.toLowerCase().split("/")[0];
  const groups = [];
  const sitemaps = [];
  let current = null, lastWasAgent = false;
  for (const raw of (text ?? "").split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase(), value = line.slice(i + 1).trim();
    if (key === "sitemap") { if (value) sitemaps.push(value); continue; }
    if (key === "user-agent") {
      if (!lastWasAgent) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (current && (key === "allow" || key === "disallow")) current.rules.push({ allow: key === "allow", path: value });
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  return { rules: chosen.flatMap((g) => g.rules), sitemaps };
}

/** Turns a robots path pattern into a regular expression. */
function pattern(path) {
  const anchored = path.endsWith("$");
  const body = (anchored ? path.slice(0, -1) : path).split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp("^" + body + (anchored ? "$" : ""));
}

/** Whether `pathAndQuery` may be fetched under the parsed rules. An empty Disallow allows everything. */
export function allowed(parsed, pathAndQuery) {
  let best = null;
  for (const r of parsed.rules) {
    if (!r.path) continue;
    if (!pattern(r.path).test(pathAndQuery)) continue;
    const len = r.path.replace(/\$$/, "").length;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow };
  }
  return best ? best.allow : true;
}
