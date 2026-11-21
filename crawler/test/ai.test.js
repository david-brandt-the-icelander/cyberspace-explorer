// The AI step with a stand-in for Claude: what is sent, what is not, what is reused, and the views written from the readings.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAi, boilerplate, sectionInput, SECTION_SCHEMA, REPO_SCHEMA, FUNCTIONS } from "../src/ai.js";
import { siteViews, repoViews, providerOf } from "../src/views.js";
import { runScan } from "../src/scan.js";
import * as store from "../src/store.js";
import { addressId } from "../src/address.js";
import { env, fakeFetch } from "./fakes.js";

/** A stand-in for Claude that answers from a table by section path, and records what it was asked. */
function fakeAsker(answers) {
  const asked = [];
  return {
    asked, model: "claude-haiku-5-5",
    async ask({ user, schema }) {
      const input = JSON.parse(user);
      asked.push(input);
      if (schema === REPO_SCHEMA) return { data: answers.repo };
      const a = answers[input.sectionPath];
      return a === "refuse" ? { declined: true, reason: "refused (cyber)" } : { data: a ?? { function: "other", audience: ["consumers"], interaction: "read", data_sensitivity: "none", lifecycle: "evergreen", topics: ["x"], name_en: "Other", summary_en: "Something.", confidence: 0.5 } };
    },
  };
}

const reading = (fn, extra = {}) => ({ function: fn, audience: ["consumers"], interaction: "read", data_sensitivity: "none", lifecycle: "evergreen", topics: ["Gift Ideas!", "gift ideas", "a", "b", "c", "d"], name_en: fn, summary_en: `A ${fn} section.`, confidence: 0.9, ...extra });

/** Seeds what a finished scan of a website leaves behind. */
async function seedSite(e, id, { noAi = [] } = {}) {
  const page = (url, title, text, loads = {}) => ({ url, title, h1: [title], description: null, text, loads, links: [], linksOut: {}, schemaTypes: [] });
  const menu = "Valmynd\nVörur\nUm okkur";
  const pages = {
    p0: page("https://shop.is/", "Shop", `${menu}\nVelkomin`, { "www.googletagmanager.com": ["script"] }),
    p1: page("https://shop.is/vorur/a", "Vara A", `${menu}\nGóð vara`, { "cdn.datocms-assets.com": ["image"] }),
    p2: page("https://shop.is/vorur/b", "Vara B", `${menu}\nÖnnur vara`, { "cdn.datocms-assets.com": ["image"] }),
    p3: page("https://shop.is/frettir/1", "Frétt", `${menu}\nNý verslun`),
    p4: page("https://shop.is/minar-sidur/x", "Mínar síður", `${menu}\nInnskráning`),
  };
  for (const [k, p] of Object.entries(pages)) await store.putJson(e.SPACE, `space/${id}/raw/pages/${k}.json`, p);
  await store.putJson(e.SPACE, `space/${id}/raw/site.json`, {
    origin: "https://shop.is", observedAt: "2026-11-19T12:00:00Z", sitemap: { urls: 40 },
    sections: {
      "": { urls: 1, samples: ["/"], read: ["p0"] }, vorur: { urls: 30, samples: ["/vorur/a", "/vorur/b"], read: ["p1", "p2"] },
      frettir: { urls: 8, samples: ["/frettir/1"], read: ["p3"] }, "minar-sidur": { urls: 1, samples: ["/minar-sidur/x"], read: ["p4"] },
    },
    dns: { A: ["1.2.3.4"], NS: ["ns01.t.is", "ns02.t.is"], MX: ["5 shop-is.mail.protection.outlook.com"] }, rdap: { registered: "2002-03-19", registrant: "Shop ehf." },
  });
  await store.putJson(e.SPACE, `space/${id}/index.json`, { kind: "web", url: "https://shop.is", source: "inferred", label: "Shop", paths: [], needsAi: 1, noAi });
  await store.addAddress(e.DB, { id, url: "https://shop.is", kind: "web" });
}

/** Validates a view against its skill's schema with Python's jsonschema, when it is installed. */
function validates(doc, kind) {
  const dir = mkdtempSync(join(tmpdir(), "view-"));
  writeFileSync(join(dir, "v.json"), JSON.stringify({ $schema: "schema.json", ...doc }));
  const schema = new URL(`../../Meta/Agents/Skills/describe-${kind}-diagram/schema.json`, import.meta.url).pathname;
  try {
    execFileSync("python3", ["-I", "-c", "import json,sys,jsonschema; jsonschema.validate(json.load(open(sys.argv[1])), json.load(open(sys.argv[2])))", join(dir, "v.json"), schema], { stdio: "pipe" });
    return true;
  } catch (e) {
    if (/No module named 'jsonschema'/.test(String(e.stderr))) return "skipped";
    throw new Error(String(e.stderr));
  }
}

test("boilerplate: lines on most pages are menus; the input cuts them and keeps three pages of 900 characters", () => {
  const pages = Array.from({ length: 6 }, (_, i) => ({ url: `https://x.is/${i}`, text: `Menu\nFooter\nOwn text ${i}\n${String(i).repeat(2000)}` }));
  const common = boilerplate(pages);
  assert.ok(common.has("Menu") && common.has("Footer") && !common.has("Own text 1"));
  const input = sectionInput({ origin: "https://x.is" }, "frettir", { urls: 6, samples: ["/frettir/1"] }, pages, common);
  assert.equal(input.pages.length, 3);
  assert.ok(input.pages[0].text.startsWith("Own text 0"));
  assert.equal(input.pages[0].text.length, 900);
  assert.equal(input.sectionPath, "/frettir");
  assert.equal(boilerplate(pages.slice(0, 4)).size, 0, "too few pages to tell");
});

test("schemas: the reading's enums are the scheme's", () => {
  assert.deepEqual(SECTION_SCHEMA.properties.function.enum, Object.keys(FUNCTIONS));
  assert.equal(SECTION_SCHEMA.additionalProperties, false);
  assert.deepEqual(new Set(Object.values(FUNCTIONS)), new Set(["commerce", "service", "content", "corporate", "fine_print"]));
});

test("AI step on a website: each section read once, noAi never sent, a refusal skips one section, views written", async () => {
  const e = env();
  const id = await addressId("https://shop.is");
  await seedSite(e, id, { noAi: ["/minar-sidur"] });
  const asker = fakeAsker({ "/": reading("utility"), "/vorur": reading("catalog", { audience: ["consumers", "nobody"] }), "/frettir": "refuse" });
  const r = await runAi(e, id, { asker });
  assert.deepEqual(asker.asked.map((a) => a.sectionPath).sort(), ["/", "/frettir", "/vorur"]);
  assert.equal(asker.asked.some((a) => JSON.stringify(a).includes("Innskráning")), false, "the noAi section's text was never sent");
  assert.equal(asker.asked.find((a) => a.sectionPath === "/vorur").pages[0].text, "Góð vara", "menus are cut");
  assert.equal(r.declined, 1);
  const idx = JSON.parse(e.SPACE.objects.get(`space/${id}/index.json`));
  assert.deepEqual(idx.paths, ["component-diagram.json", "deployment-diagram.json", "folder.json", "vorur/folder.json"]);
  assert.equal(idx.needsAi, 0);
  assert.equal((await store.address(e.DB, id)).needs_ai, 0);
  const folder = JSON.parse(e.SPACE.objects.get(`space/${id}/files/vorur/folder.json`)).entities[0];
  assert.equal(folder.function, "catalog");
  assert.equal(folder.family, "commerce");
  assert.deepEqual(folder.audience, ["consumers"], "values outside the scheme are dropped");
  assert.deepEqual(folder.topics, ["gift-ideas", "a", "b", "c", "d"], "tags tidied, deduplicated, at most five");
  const comp = JSON.parse(e.SPACE.objects.get(`space/${id}/files/component-diagram.json`));
  assert.ok(comp.components.some((c) => c.id === "zone-commerce"));
  assert.ok(comp.components.some((c) => c.name === "DatoCMS" && c.external));
  assert.ok(comp.relationships.some((x) => x.from === "section-vorur" && x.to === "ext-datocms"));

  const again = fakeAsker({ "/frettir": reading("news") });
  const r2 = await runAi(e, id, { asker: again });
  assert.deepEqual(again.asked.map((a) => a.sectionPath), ["/frettir"], "only the section without a reading is asked again");
  assert.equal(r2.reused, 2);
  assert.ok(JSON.parse(e.SPACE.objects.get(`space/${id}/index.json`)).paths.includes("frettir/folder.json"));
});

test("AI step: the views it writes follow the skills' schemas", async () => {
  const site = { origin: "https://shop.is", observedAt: "2026-11-19", sitemap: { urls: 3 }, sections: { vorur: { urls: 3, samples: ["/vorur/a"], read: [] } }, dns: { NS: ["ns1.t.is"], MX: ["10 mx.example.com"] } };
  const files = siteViews({ site, classes: { vorur: { ...reading("catalog"), family: "commerce", evidence: "pages" } }, pages: [{ url: "https://shop.is/vorur/a", loads: { "d.cloudfront.net": ["image"] } }], label: "Shop", front: null });
  assert.notEqual(validates(files["component-diagram.json"], "component"), false);
  assert.notEqual(validates(files["deployment-diagram.json"], "deployment"), false);
  const repo = repoViews({ repo: { url: "https://github.com/o/r", head: "abc1234", layout: { src: {}, "src/api": {} } }, data: { summary: "A service.", components: [{ id: "api", name: "API", folder: "src/api", responsibility: "Serves." }, { id: "ghost", name: "Ghost", folder: "nowhere", responsibility: "Made up." }], externals: [{ id: "pg", name: "PostgreSQL", responsibility: "Stores." }], relationships: [{ from: "api", to: "pg", description: "Queries." }, { from: "ghost", to: "pg", description: "x" }] }, label: "o/r" });
  const c = repo["component-diagram.json"];
  assert.deepEqual(c.components.map((x) => x.id), ["api", "ext-pg"], "a folder that doesn't exist is dropped");
  assert.deepEqual(c.relationships, [{ from: "api", to: "ext-pg", kind: "depends-on", description: "Queries." }]);
  assert.notEqual(validates(c, "component"), false);
  assert.equal(providerOf("dxyz.cloudfront.net"), "Amazon Web Services");
  assert.equal(providerOf("img.example.co.uk"), "example.co.uk");
});

test("AI step on a repository without views, and a scan that queues it only when it may run", async () => {
  const e = env({ ANTHROPIC_API_KEY: "sk-test" });
  const id = await addressId("https://github.com/o/r");
  await store.addAddress(e.DB, { id, url: "https://github.com/o/r", kind: "git" });
  const R = "https://api.github.com/repos/o/r";
  const f = fakeFetch({
    [R]: { body: { default_branch: "main" } }, [`${R}/commits/main`]: { body: "c1" },
    [`${R}/git/trees/c1?recursive=1`]: { body: { tree: ["README.md", "src/a.js"].map((path) => ({ path, type: "blob" })) } },
    "https://raw.githubusercontent.com/o/r/c1/README.md": { body: "# R" },
  });
  const scan = await runScan(e, { id, reason: "admin" }, { fetchImpl: f });
  assert.equal(scan.ai, true);
  assert.deepEqual(e.SCANS.sent.at(-1).body, { id, reason: "ai" });
  const asker = fakeAsker({ repo: { summary: "R does things.", components: [{ id: "src", name: "Source", folder: "src", responsibility: "The code." }], externals: [], relationships: [] } });
  const r = await runScan(e, { id, reason: "ai" }, { asker });
  assert.equal(r.files, 2);
  assert.equal(JSON.parse(e.SPACE.objects.get(`space/${id}/files/folder.json`)).entities[0].summary, "R does things.");

  const off = env({ ANTHROPIC_API_KEY: "sk-test" });
  await store.addAddress(off.DB, { id, url: "https://github.com/o/r", kind: "git" });
  await store.setSetting(off.DB, "ai_enabled", 0);
  assert.equal((await runScan(off, { id, reason: "admin" }, { fetchImpl: f })).ai, false, "switched off in /admin");
  const nokey = env();
  await store.addAddress(nokey.DB, { id, url: "https://github.com/o/r", kind: "git" });
  assert.equal((await runScan(nokey, { id, reason: "admin" }, { fetchImpl: f })).ai, false, "no API key");
});
