import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// Cyberspace's pure functions live in index.html between two markers; run that block on its own.
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const block = html.match(/\/\* space-world:start \*\/([\s\S]*?)\/\* space-world:end \*\//);
assert.ok(block, "index.html has a space-world block");
const context = vm.createContext({});
vm.runInContext(block[1], context);
const { parseSpaceHash, spaceHash, switchHash } = vm.runInContext("({ parseSpaceHash, spaceHash, switchHash })", context);
// Objects made in the other context have another Object.prototype: compare them as plain data.
const parse = (h) => ({ ...parseSpaceHash(h) });

const ADDRESSES = [
  // [as spaceHash writes it, as a person writes it, what it shows]
  ["#|~space", "#|~space", { mode: "space", folder: "", focus: null, scene: "tower" }],
  ["#|view%3Acomponent-diagram.json|~space", "#|view:component-diagram.json|~space", { mode: "space", folder: "", focus: "view:component-diagram.json", scene: "tower" }],
  ["#|view%3Acomponent-diagram.json|~space:city", "#|view:component-diagram.json|~space:city", { mode: "space", folder: "", focus: "view:component-diagram.json", scene: "city" }],
  ["#|component%3Aloader|~space:city", "#|component:loader|~space:city", { mode: "space", folder: "", focus: "component:loader", scene: "city" }],
  ["#|component%3Aloader|~space:street", "#|component:loader|~space:street", { mode: "space", folder: "", focus: "component:loader", scene: "street" }],
  ["#|view%3Ause-case.json%23read-a-folder|~space:city", "#|view:use-case.json#read-a-folder|~space:city", { mode: "space", folder: "", focus: "view:use-case.json#read-a-folder", scene: "city" }],
  ["#worker/my%20part|component%3Ahandler|~space:city", "#worker/my part|component:handler|~space:city", { mode: "space", folder: "worker/my part", focus: "component:handler", scene: "city" }],
  ["#worker|~space:skyline", "#worker|~space:skyline", { mode: "space", folder: "worker", focus: null, scene: "skyline" }],
  ["#|~space:skyline", "#|~space:skyline", { mode: "space", folder: "", focus: null, scene: "skyline" }],
];

test("every address in the table reads the same in both spellings, and spaceHash writes the encoded one", () => {
  for (const [encoded, plain, want] of ADDRESSES) {
    assert.deepEqual(parse(encoded), want, encoded);
    assert.deepEqual(parse(plain), want, plain);
    assert.equal(spaceHash(want), encoded);
    assert.deepEqual(parse(spaceHash(parse(plain))), want);
  }
});

test("without the marker as its last segment an address is Flat, as before", () => {
  assert.deepEqual(parse("#|component:loader"), { mode: "flat", folder: "", focus: "component:loader", scene: null });
  assert.deepEqual(parse("#|component%3Aloader"), { mode: "flat", folder: "", focus: "component:loader", scene: null });
  assert.deepEqual(parse("#worker"), { mode: "flat", folder: "worker", focus: null, scene: null });
  assert.deepEqual(parse("#~waiting"), { mode: "flat", folder: "~waiting", focus: null, scene: null });
  assert.deepEqual(parse(""), { mode: "flat", folder: "", focus: null, scene: null });
  // One segment is a folder, whatever it is called.
  assert.equal(parse("#~space").mode, "flat");
  // The marker counts only as the last segment.
  assert.equal(parse("#|~space|component:loader").mode, "flat");
});

test("Waiting has no 3D form: #~waiting|~space is the root's tower", () => {
  assert.deepEqual(parse("#~waiting|~space"), { mode: "space", folder: "", focus: null, scene: "tower" });
  assert.deepEqual(parse("#~waiting|~space"), parse("#|~space"));
});

test("a scene that isn't one is the tower, and a bad escape is read as written", () => {
  assert.equal(parse("#|~space:moon").scene, "tower");
  assert.equal(parse("#|~space:tower").scene, "tower");
  assert.equal(spaceHash({ folder: "", scene: "tower" }), "#|~space");
  assert.deepEqual(parse("#|view:100%|~space"), { mode: "space", folder: "", focus: "view:100%", scene: "tower" });
});

test("switching modes keeps the place", () => {
  // Flat → Cyberspace
  assert.equal(switchHash("space", { folder: "worker", kind: "component", part: "handler", view: "component-diagram.json" }), "#worker|component%3Ahandler|~space:city");
  assert.equal(switchHash("space", { folder: "worker", view: "component-diagram.json" }), "#worker|view%3Acomponent-diagram.json|~space");
  assert.equal(switchHash("space", { folder: "worker" }), "#worker|~space");
  assert.equal(switchHash("space", { waiting: true }), "#|~space");
  // Cyberspace → Flat
  assert.equal(switchHash("flat", { folder: "worker", kind: "component", part: "handler", view: "component-diagram.json" }), "#worker|component%3Ahandler");
  assert.equal(switchHash("flat", { folder: "worker", view: "component-diagram.json" }), "#worker|view%3Acomponent-diagram.json");
  assert.equal(switchHash("flat", { folder: "" }), "#");
  // And back again lands where it started.
  for (const [encoded] of ADDRESSES) {
    const { folder, focus } = parse(encoded);
    const [kind, ...name] = focus?.split(":") ?? [""];
    const at = kind === "view" ? { folder, view: name.join(":") } : { folder, kind: kind || null, part: name.join(":") || null };
    assert.deepEqual(parse(switchHash("flat", at)), { mode: "flat", folder, focus, scene: null });
  }
});

// ── The city world ────────────────────────────────────────────────────────

const { cityWorldFrom } = vm.runInContext("({ cityWorldFrom })", context);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const leaf = (key, more = {}) => ({ key, label: key.toUpperCase(), info: { title: key }, ...more });
const edge = (key, from, to, more = {}) => ({ key, from, to, ...more });
/** A hand-written layout: boxes centred at (x, y) in sheet px. */
const sheet = (boxes, w, h) => ({ box: new Map(Object.entries(boxes).map(([k, [x, y, bw, bh]]) => [k, { x, y, w: bw, h: bh }])), w, h });

// Two clusters, one inside the other; six leaves, one of them outside; seven edges.
const TWO = {
  dir: "LR",
  nodes: [
    { key: "outer", cluster: true, label: "Outer", info: {} },
    { key: "inner", cluster: true, label: "Inner", parent: "outer", info: {} },
    leaf("a", { parent: "outer" }), leaf("b", { parent: "inner" }), leaf("c", { parent: "inner" }),
    leaf("d"), leaf("e"), leaf("x", { ext: true }),
  ],
  edges: [edge("r0", "a", "b"), edge("r1", "b", "c"), edge("r2", "c", "d"), edge("r3", "d", "e"), edge("r4", "a", "x"), edge("r5", "e", "x"), edge("r6", "a", "d")],
};
const TWO_L = sheet({ outer: [300, 300, 520, 440], inner: [380, 340, 300, 280], a: [140, 200, 120, 56], b: [320, 300, 120, 56], c: [440, 400, 120, 56], d: [700, 200, 120, 56], e: [700, 400, 120, 56], x: [900, 300, 120, 56] }, 1000, 600);

test("a model of two clusters and six leaves stands as 2 plates, 5 towers, 1 beacon and 7 beams", () => {
  const w = cityWorldFrom(TWO, TWO_L, "component", "LR");
  assert.equal(w.plates.length, 2);
  assert.equal(w.towers.length, 5);
  assert.equal(w.beacons.length, 1);
  assert.equal(w.beams.length, 7);
  const deg = { a: 3, b: 2, c: 2, d: 3, e: 2 };
  for (const t of w.towers) { assert.equal(t.degree, deg[t.key], t.key); assert.ok(near(t.h, 2.2 + 1.3 * deg[t.key]), t.key); }
  const outer = w.plates.find((p) => p.key === "outer"), inner = w.plates.find((p) => p.key === "inner");
  assert.equal(outer.base, 0);
  assert.equal(inner.base, outer.base + 0.5);
  assert.equal(inner.depth, 1);
  // A plate is its box, 40 px a unit, shrunk 0.2 on every side, centred on the sheet, the top of the sheet furthest away.
  assert.ok(near(outer.x0, (40 - 500) / 40 + 0.2) && near(outer.x1, (560 - 500) / 40 - 0.2));
  assert.ok(near(outer.z1, (300 - 80) / 40 - 0.2) && near(outer.z0, (300 - 520) / 40 + 0.2));
  // A tower stands on its innermost plate.
  const b = w.towers.find((t) => t.key === "b"), a = w.towers.find((t) => t.key === "a"), d = w.towers.find((t) => t.key === "d");
  assert.equal(b.plate, "inner"); assert.equal(b.base, 1);
  assert.equal(a.plate, "outer"); assert.equal(a.base, 0.5);
  assert.equal(d.plate, null); assert.equal(d.base, 0);
  // Beams leave a tower's top centre and reach a beacon's centre; the beam to a beacon is amber.
  const r4 = w.beams.find((x) => x.key === "r4"), beacon = w.beacons[0];
  assert.deepEqual([...r4.points[0]], [a.x, a.base + a.h, a.z]);
  assert.deepEqual([...r4.points[32]], [beacon.x, beacon.y, beacon.z]);
  assert.equal(r4.ext, true);
  assert.equal(w.beams.find((x) => x.key === "r0").ext, false);
  assert.equal(beacon.y, 6.5);
  assert.equal(w.beams.every((x) => x.points.length === 33), true);
});

test("a tower's height stops growing at nine beams", () => {
  const model = { dir: "LR", nodes: [leaf("hub"), ...Array.from({ length: 12 }, (_, i) => leaf("p" + i))], edges: Array.from({ length: 12 }, (_, i) => edge("r" + i, "hub", "p" + i)) };
  const L = sheet(Object.fromEntries(model.nodes.map((n, i) => [n.key, [100 + i * 200, 100, 100, 50]])), 2700, 200);
  const hub = cityWorldFrom(model, L, "component", "LR").towers.find((t) => t.key === "hub");
  assert.equal(hub.degree, 12);
  assert.ok(near(hub.h, 13.9));
});

test("towers 2 units apart are 1.6 wide, and no two footprints overlap", () => {
  const model = { dir: "LR", nodes: ["a", "b", "c", "d"].map((k) => leaf(k)), edges: [] };
  const L = sheet({ a: [100, 100, 60, 40], b: [180, 100, 60, 40], c: [260, 100, 60, 40], d: [180, 180, 60, 40] }, 400, 300);
  const w = cityWorldFrom(model, L, "component", "LR");
  for (const t of w.towers) assert.ok(near(t.side, 1.6), t.key);
  for (const s of w.towers) for (const t of w.towers) if (s !== t) assert.ok(Math.abs(s.x - t.x) >= (s.side + t.side) / 2 - 1e-9 || Math.abs(s.z - t.z) >= (s.side + t.side) / 2 - 1e-9);
  // A lone tower is 2.2 wide.
  assert.equal(cityWorldFrom({ dir: "LR", nodes: [leaf("a")], edges: [] }, sheet({ a: [50, 50, 60, 40] }, 100, 100), "component", "LR").towers[0].side, 2.2);
});

test("a transition back to the same state is a closed circle of radius 1.2 standing on the tower", () => {
  const model = { dir: "LR", nodes: [leaf("s"), leaf("t")], edges: [edge("t0", "s", "s", { self: true }), edge("t1", "s", "t")] };
  const w = cityWorldFrom(model, sheet({ s: [100, 100, 96, 42], t: [400, 100, 96, 42] }, 500, 200), "state", "LR");
  const s = w.towers.find((t) => t.key === "s"), loop = w.beams.find((b) => b.key === "t0");
  assert.equal(s.degree, 2);
  assert.equal(loop.points.length, 33);
  loop.points[0].forEach((v, i) => assert.ok(near(v, loop.points[32][i])));
  const top = s.base + s.h, centre = [s.x, top + 1.2, s.z];
  for (const p of loop.points) {
    assert.ok(near(Math.hypot(p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]), 1.2));
    assert.ok(p[1] >= top - 1e-9);
  }
  assert.ok(near(loop.points[0][1], top));
});

test("five beams between the same two towers stand on five arcs, their crests 0.55 apart, in the order of the edges", () => {
  const edges = [edge("e0", "p", "q"), edge("e1", "q", "p"), edge("e2", "p", "q"), edge("e3", "q", "p"), edge("e4", "p", "q")];
  const crests = (first, second) => {
    // The same two towers, named so that one sorts first and then the other.
    const name = { p: first, q: second };
    const model = { dir: "LR", nodes: [leaf(first), leaf(second)], edges: edges.map((e) => ({ ...e, from: name[e.from], to: name[e.to] })) };
    const w = cityWorldFrom(model, sheet({ [first]: [100, 100, 96, 42], [second]: [500, 100, 96, 42] }, 600, 200), "state", "LR");
    return w.beams.map((b) => b.points[16]);
  };
  const runs = [crests("p", "q"), crests("q", "p")];
  for (const c of runs) {
    assert.equal(c.length, 5);
    // The towers stand along x, so the arcs fan out along z, each 0.55 from the next, in the order of the edges.
    const zs = c.map((p) => p[2]), step = zs[1] - zs[0];
    assert.ok(near(Math.abs(step), 0.55), String(zs));
    for (let i = 1; i < 5; i++) assert.ok(near(zs[i] - zs[i - 1], step));
    assert.ok(near(zs[2], 0));
    for (const p of c) assert.ok(near(p[1], c[0][1]));
  }
  // Whichever end sorts first, the fan is in the order of the edges, from one side to the other.
  assert.ok(near(Math.abs(runs[0][0][2] - runs[0][4][2]), 2.2) && near(Math.abs(runs[1][0][2] - runs[1][4][2]), 2.2));
});

test("without a layout, nine parts stand in three rows of three, 5 units apart", () => {
  const model = { dir: "LR", nodes: Array.from({ length: 9 }, (_, i) => leaf("n" + i)), edges: [edge("r0", "n0", "n8")] };
  const w = cityWorldFrom(model, null, "component", "LR");
  const xs = [...new Set(w.towers.map((t) => +t.x.toFixed(6)))].sort((a, b) => a - b), zs = [...new Set(w.towers.map((t) => +t.z.toFixed(6)))].sort((a, b) => a - b);
  assert.deepEqual(xs.map((x) => x - xs[0]), [0, 5, 10]);
  assert.deepEqual(zs.map((z) => z - zs[0]), [0, 5, 10]);
  for (const z of zs) assert.equal(w.towers.filter((t) => near(t.z, z, 1e-6)).length, 3);
  assert.equal(w.beams.length, 1);
  // A cluster stands as a plate round its parts.
  const grouped = { dir: "LR", nodes: [{ key: "g", cluster: true, label: "G", info: {} }, leaf("a", { parent: "g" }), leaf("b", { parent: "g" }), leaf("c")], edges: [] };
  const g = cityWorldFrom(grouped, null, "component", "LR"), plate = g.plates[0];
  assert.equal(g.plates.length, 1);
  for (const t of g.towers.filter((t) => t.plate === "g")) assert.ok(t.x - t.side / 2 >= plate.x0 && t.x + t.side / 2 <= plate.x1 && t.z - t.side / 2 >= plate.z0 && t.z + t.side / 2 <= plate.z1);
});

test("every drawn kind stands, with an outside part, a start point, a final state, an alternative outcome and a part with views of its own", () => {
  const box = (nodes) => sheet(Object.fromEntries(nodes.map((n, i) => [n.key, n.cluster ? [400, 300, 760, 560] : [100 + (i % 4) * 180, 150 + Math.floor(i / 4) * 140, 120, 50]])), 900, 700);
  const KINDS = {
    component: { dir: "LR", nodes: [{ key: "g", cluster: true, label: "Group", info: {} }, leaf("a", { parent: "g", nav: "#worker" }), leaf("b", { parent: "g" }), leaf("x", { ext: true })], edges: [edge("r0", "a", "b"), edge("r1", "b", "x")] },
    deployment: { dir: "LR", nodes: [{ key: "h", cluster: true, label: "Host", info: {} }, leaf("art:p", { parent: "h" }), leaf("c"), leaf("svc", { ext: true })], edges: [edge("r0", "c", "h", { label: "calls" }), edge("dep:q", "art:p", "svc", { cls: "dotted" })] },
    class: { dir: "TB", nodes: [leaf("A"), leaf("B", { nav: "#engine" }), leaf("C")], edges: [edge("r0", "A", "B", { reversed: true }), edge("r1", "C", "A", { cls: "dashed" })] },
    state: { dir: "LR", nodes: [leaf("idle"), leaf("done", { terminal: true }), { key: "__start", w: 16, h: 16 }], edges: [edge("start", "__start", "idle"), edge("t0", "idle", "done", { label: "go" }), edge("t1", "idle", "idle", { self: true })] },
    "use-case": { dir: "TB", nodes: [leaf("u:s1", { glyph: "person" }), leaf("u:s2", { glyph: "server" }), leaf("u:alt0", { glyph: "branch", ext: true })], edges: [edge("n0", "u:s1", "u:s2"), edge("n1", "u:s1", "u:alt0", { cls: "dashed", label: "if not" })] },
    "user-journey": { dir: "LR", nodes: [leaf("j:a", { glyph: "person" }), leaf("j:b", { glyph: "person" })], edges: [edge("n0", "j:a", "j:b")] },
  };
  const finite = (x) => (Array.isArray(x) ? x.every(finite) : x && typeof x === "object" ? Object.values(x).every(finite) : typeof x !== "number" || Number.isFinite(x));
  for (const [kind, model] of Object.entries(KINDS)) {
    for (const L of [box(model.nodes), null]) {
      const w = cityWorldFrom(model, L, kind, model.dir);
      assert.ok(finite([w.plates, w.towers, w.beacons, w.markers, w.beams.map((b) => b.points), w.bounds]), kind);
      assert.equal(w.beams.length, model.edges.length, kind);
      assert.equal(w.beacons.length > 0, kind === "component" || kind === "deployment", kind);
      for (const t of w.towers) assert.equal(t.name, model.nodes.find((n) => n.key === t.key).label, kind);
      assert.equal(w.kind, kind);
      assert.equal(w.dir, model.dir);
    }
  }
  const state = cityWorldFrom(KINDS.state, box(KINDS.state.nodes), "state", "LR");
  assert.deepEqual([...state.markers.map((m) => m.key)], ["__start"]);
  assert.equal(state.towers.some((t) => t.key === "__start"), false);
  assert.equal(state.towers.find((t) => t.key === "done").final, true);
  assert.equal(state.towers.find((t) => t.key === "idle").final, false);
  assert.equal(state.beams.find((b) => b.key === "t0").label, "go");
  const uc = cityWorldFrom(KINDS["use-case"], box(KINDS["use-case"].nodes), "use-case", "TB"), alt = uc.towers.find((t) => t.key === "u:alt0");
  assert.equal(alt.alt, true);
  assert.equal(alt.h, 2.2);
  assert.equal(uc.beams.find((b) => b.key === "n1").dashed, true);
  const comp = cityWorldFrom(KINDS.component, box(KINDS.component.nodes), "component", "LR");
  assert.equal(comp.parts.get("a").nav, "#worker");
  assert.deepEqual([...comp.beacons.map((b) => b.key)], ["x"]);
  // A class diagram's outside types are towers: ext means something else there.
  assert.equal(cityWorldFrom({ ...KINDS.class, nodes: [...KINDS.class.nodes, leaf("Ext", { ext: true })] }, null, "class", "TB").beacons.length, 0);
});

// ── Selection ─────────────────────────────────────────────────────────────

const { cityNeighbours, cityPlateOf, cityHash } = vm.runInContext("({ cityNeighbours, cityPlateOf, cityHash })", context);
const hood = (w, key) => { const h = cityNeighbours(w, key); return h && { key: h.key, beams: [...h.beams], near: [...h.near] }; };

test("selecting a part of the two-cluster city lights the beams that touch it and the parts at their other ends", () => {
  const w = cityWorldFrom(TWO, TWO_L, "component", "LR");
  assert.deepEqual(hood(w, "a"), { key: "a", beams: ["r0", "r4", "r6"], near: ["b", "x", "d"] });
  assert.deepEqual(hood(w, "d"), { key: "d", beams: ["r2", "r3", "r6"], near: ["c", "e", "a"] });
  // A plate can be selected; here no beam touches one.
  assert.deepEqual(hood(w, "inner"), { key: "inner", beams: [], near: [] });
  // Nothing else can: an unknown key is no selection.
  assert.equal(cityNeighbours(w, "nowhere"), null);
  // The plate a part stands on is its innermost; a nested plate stands on its parent; the bare ground has none.
  assert.equal(cityPlateOf(w, "b").key, "inner");
  assert.equal(cityPlateOf(w, "a").key, "outer");
  assert.equal(cityPlateOf(w, "inner").key, "outer");
  assert.equal(cityPlateOf(w, "d"), null);
  assert.equal(cityPlateOf(w, "outer"), null);
});

test("a selected beacon lights its own beams and the towers they reach", () => {
  const w = cityWorldFrom(TWO, TWO_L, "component", "LR");
  assert.deepEqual(hood(w, "x"), { key: "x", beams: ["r4", "r5"], near: ["a", "e"] });
});

test("a part's loop back to itself lights and is no neighbour of it; fanned beams each light once, their other end near once", () => {
  const loop = cityWorldFrom({ dir: "LR", nodes: [leaf("s"), leaf("t"), { key: "__start" }], edges: [edge("start", "__start", "s"), edge("t0", "s", "s", { self: true }), edge("t1", "s", "t"), edge("t2", "t", "s")] },
    sheet({ s: [100, 100, 96, 42], t: [400, 100, 96, 42], __start: [20, 100, 16, 16] }, 500, 200), "state", "LR");
  // The start point's beam lights, but a start point is no part: it is never near, and it can't be selected.
  assert.deepEqual(hood(loop, "s"), { key: "s", beams: ["start", "t0", "t1", "t2"], near: ["t"] });
  assert.equal(cityNeighbours(loop, "__start"), null);
  const fan = ["e0", "e1", "e2", "e3", "e4"].map((k, i) => edge(k, i % 2 ? "q" : "p", i % 2 ? "p" : "q"));
  const w = cityWorldFrom({ dir: "LR", nodes: [leaf("p"), leaf("q"), leaf("r")], edges: [...fan, edge("e5", "q", "r")] }, sheet({ p: [100, 100, 96, 42], q: [500, 100, 96, 42], r: [900, 100, 96, 42] }, 1000, 200), "state", "LR");
  assert.deepEqual(hood(w, "p"), { key: "p", beams: ["e0", "e1", "e2", "e3", "e4"], near: ["q"] });
  assert.deepEqual(hood(w, "q"), { key: "q", beams: ["e0", "e1", "e2", "e3", "e4", "e5"], near: ["p", "r"] });
});

test("selecting writes the part's own address and clearing the view's, which read alike in both spellings", () => {
  const component = { kind: "component", file: "component-diagram.json" };
  const cases = [
    // [view, key selected, folder, selected (as written, as a person writes it), cleared (as written, as a person writes it)]
    [component, "loader", "", ["#|component%3Aloader|~space:city", "#|component:loader|~space:city"], ["#|view%3Acomponent-diagram.json|~space:city", "#|view:component-diagram.json|~space:city"]],
    [component, "handler", "worker", ["#worker|component%3Ahandler|~space:city", "#worker|component:handler|~space:city"], ["#worker|view%3Acomponent-diagram.json|~space:city", "#worker|view:component-diagram.json|~space:city"]],
    // A use case's step is keyed <use case>:<step>, as the models key it, so the address names the use case too.
    [{ kind: "use-case", file: "use-case.json", entity: "read-a-folder" }, "read-a-folder:open", "", ["#|use-case%3Aread-a-folder%3Aopen|~space:city", "#|use-case:read-a-folder:open|~space:city"], ["#|view%3Ause-case.json%23read-a-folder|~space:city", "#|view:use-case.json#read-a-folder|~space:city"]],
  ];
  for (const [view, key, folder, [selected, selectedPlain], [cleared, clearedPlain]] of cases) {
    assert.equal(cityHash(folder, view, key), selected);
    assert.equal(cityHash(folder, view, null), cleared);
    assert.deepEqual(parse(selectedPlain), parse(selected));
    assert.deepEqual(parse(clearedPlain), parse(cleared));
    assert.deepEqual(parse(selected), { mode: "space", folder, focus: `${view.kind}:${key}`, scene: "city" });
    assert.deepEqual(parse(cleared), { mode: "space", folder, focus: `view:${view.file}${view.entity ? "#" + view.entity : ""}`, scene: "city" });
    // Shown flat, the part's address is the part in Flat.
    assert.deepEqual(parse(switchHash("flat", { folder, kind: view.kind, part: key })), { mode: "flat", folder, focus: `${view.kind}:${key}`, scene: null });
  }
  // In the street the selection is the street's.
  assert.equal(cityHash("", component, "loader", "street"), "#|component%3Aloader|~space:street");
});

// ── The folder tower ──────────────────────────────────────────────────────

const { towerWorldFrom, floorPlan, floorScale, FLOOR } = vm.runInContext("({ towerWorldFrom, floorPlan, floorScale, FLOOR })", context);
// The page's own kinds, which towerWorldFrom is given: KIND_ORDER, KNOWLEDGE (from its groups) and the drawn kinds (MODELS).
const page = vm.createContext({});
for (const re of [/^const KIND_ORDER = .*$/m, /^const KNOWLEDGE_GROUPS = \[[\s\S]*?^\];$/m, /^const KNOWLEDGE = .*$/m]) vm.runInContext(html.match(re)[0], page);
const KINDS = vm.runInContext("({ order: KIND_ORDER, knowledge: KNOWLEDGE })", page);
KINDS.drawn = [...html.match(/^const MODELS = \{(.*)\};$/m)[1].matchAll(/"?([\w-]+)"?:/g)].map((m) => m[1]);
// The root's 24 .dev files at commit 239ab8e (2026-11-13): each file's kind, path and titles.
const ROOT = JSON.parse(await readFile(new URL("./fixtures/space/root-tower.json", import.meta.url), "utf8")).files;
// The tower world is plain data; made in the other context, it is compared as such.
const towerOf = (docs) => JSON.parse(JSON.stringify(towerWorldFrom(docs, KINDS)));

test("the root's 24 files stand as a tower of 7 drawn, 3 written and 14 knowledge floors, the top one at 26.95", () => {
  assert.deepEqual(KINDS.drawn, ["component", "deployment", "class", "state", "use-case", "user-journey"]);
  const w = towerOf(ROOT);
  assert.equal(w.floors.length, 24);
  assert.deepEqual(w.groups.map((g) => [g.name, g.count]), [["drawn", 7], ["written", 3], ["knowledge", 14]]);
  assert.equal(w.floors[0].kind, "component");
  assert.equal(w.drawer, 0);
  assert.ok(near(w.top, 26.95), String(w.top));
  assert.equal(w.climb, 0);
  // Bottom to top, as artboard 1 stands them (without plan.json, which came after).
  assert.deepEqual(w.floors.map((f) => f.file), [
    "component-diagram.json", "deployment-diagram.json", "drawing.state-diagram.json", "page.state-diagram.json", "token-panel.state-diagram.json", "use-case.json", "user-journey.json",
    "capability.json", "feature.json", "operation.json",
    "vision.json", "stakeholders.json", "requirements.json", "quality-requirements.json", "glossary.json", "backlog.json", "decisions.json", "folder.json", "contracts.json", "verification.json", "delivery.json", "runbooks.json", "limitations.json", "references.json",
  ]);
  // Floors 1.05 apart, 1.4 more between groups.
  for (let i = 1; i < 24; i++) {
    const gap = w.floors[i].group !== w.floors[i - 1].group ? 1.05 + 1.4 : 1.05;
    assert.ok(near(w.floors[i].y - w.floors[i - 1].y, gap, 1e-6), `floor ${i}`);
  }
  // Labels: the kind as words, and the view's title.
  assert.equal(w.floors.find((f) => f.kind === "quality-requirements").word, "quality requirements");
  assert.equal(w.floors.find((f) => f.kind === "use-case").word, "use case");
  assert.equal(w.floors[0].title, ROOT.find((d) => d.kind === "component").title);
});

test("a taller stack opens climbed: by 1.05 with a 25th file", () => {
  const plan = { kind: "plan", path: ".dev/plan.json", title: "How the browser gets Cyberspace", entities: [{ id: "cyberspace-mode", title: "Build Cyberspace" }] };
  const w = towerOf([...ROOT, plan]);
  assert.equal(w.floors.length, 25);
  assert.ok(near(w.top, 28));
  assert.ok(near(w.climb, 1.05), String(w.climb));
  // A 25th drawn file climbs the same, and stands with the drawn ones.
  const more = towerOf([...ROOT, { kind: "state", path: ".dev/space.state-diagram.json", title: "Cyberspace" }]);
  assert.ok(near(more.climb, 1.05));
  assert.deepEqual(more.groups.map((g) => g.count), [8, 3, 14]);
});

test("a written floor shows a bar per card and a knowledge floor a line per record, as long as their titles, at most 4 and 6", () => {
  const w = towerOf(ROOT);
  for (const f of w.floors) {
    const records = ROOT.find((d) => d.path === f.path).entities ?? [];
    assert.deepEqual(f.bars, f.group === "written" ? records.slice(0, 4).map((e) => String(e.name ?? e.title ?? e.id).length) : [], f.file);
    assert.deepEqual(f.lines, f.group === "knowledge" ? records.slice(0, 6).map((e) => String(e.title ?? e.name ?? e.id).length) : [], f.file);
  }
  assert.ok(w.floors.some((f) => f.lines.length === 6));
  assert.ok(w.floors.filter((f) => f.group === "written").every((f) => f.bars.length > 0));
});

test("a folder with no drawn views has no drawer, and its first group starts on the ground", () => {
  const github = [
    { kind: "folder", path: ".github/.dev/folder.json", title: "The pipeline" },
    { kind: "backlog", path: ".github/.dev/backlog.json", title: "Work wanted on the pipeline" },
    { kind: "feature", path: ".github/.dev/feature.json", title: "What the pipeline offers", entities: [{ id: "a", name: "Test" }] },
  ];
  const w = towerOf(github);
  assert.equal(w.drawer, -1);
  assert.deepEqual(w.groups.map((g) => [g.name, g.count]), [["written", 1], ["knowledge", 2]]);
  assert.deepEqual(w.floors.map((f) => f.kind), ["feature", "backlog", "folder"]);
  assert.deepEqual(w.floors.map((f) => f.y), [0, 2.45, 3.5]);
  assert.equal(w.climb, 0);
  const none = towerOf([]);
  assert.equal(none.floors.length, 0);
  assert.equal(none.drawer, -1);
});

test("a city stands on its floor at k = min(0.36, 15 / width, 11 / depth): about 0.23 for this repository's component city", () => {
  // 40.6 × 47.4 units on 2026-11-13.
  const k = floorScale({ x0: -20.3, x1: 20.3, z0: -23.7, z1: 23.7 });
  assert.ok(Math.abs(k - 0.23) < 0.005, String(k));
  assert.ok(near(k * 47.4, 11));
  assert.equal(floorScale({ x0: 0, x1: 10, z0: 0, z1: 10 }), 0.36);
  assert.ok(near(floorScale({ x0: 0, x1: 60, z0: 0, z1: 20 }), 0.25));
});

test("a drawn floor's plan is its city's flat layout, inside 13 × 9 units: a tile per part, an outline per plate, a line per beam", () => {
  const plan = floorPlan(cityWorldFrom(TWO, TWO_L, "component", "LR"));
  assert.equal(plan.outlines.length, 2);
  assert.equal(plan.tiles.length, 6);
  assert.equal(plan.lines.length, 7);
  const all = [...plan.tiles, ...plan.outlines];
  assert.ok(all.every((t) => t.x0 >= -6.5 - 1e-9 && t.x1 <= 6.5 + 1e-9 && t.z0 >= -4.5 - 1e-9 && t.z1 <= 4.5 + 1e-9));
  // The sheet is 1000 × 600 px, so its width fills the 13 units: 0.013 a pixel.
  assert.ok(near(Math.min(...all.map((t) => t.x0)), (40 - 500) * 0.013) && near(Math.max(...all.map((t) => t.x1)), (960 - 500) * 0.013));
  // Without a layout, the grid's boxes are the plan.
  const grid = floorPlan(cityWorldFrom({ dir: "LR", nodes: Array.from({ length: 9 }, (_, i) => leaf("n" + i)), edges: [] }, null, "component", "LR"));
  assert.equal(grid.tiles.length, 9);
  assert.equal(FLOOR.w * FLOOR.d, 192);
});

test("sliding a floor out, entering its city and going up again write addresses that read back the same", () => {
  const views = [
    ["", { kind: "deployment", file: "deployment-diagram.json" }, "#|view%3Adeployment-diagram.json|~space", "#|view%3Adeployment-diagram.json|~space:city"],
    ["worker", { kind: "component", file: "component-diagram.json" }, "#worker|view%3Acomponent-diagram.json|~space", "#worker|view%3Acomponent-diagram.json|~space:city"],
    ["", { kind: "use-case", file: "use-case.json", entity: "switch-modes" }, "#|view%3Ause-case.json%23switch-modes|~space", "#|view%3Ause-case.json%23switch-modes|~space:city"],
  ];
  for (const [folder, view, tower, city] of views) {
    const focus = `view:${view.file}${view.entity ? "#" + view.entity : ""}`;
    // Sliding out: the tower, with that view's focus.
    assert.equal(spaceHash({ folder, focus }), tower);
    assert.deepEqual(parse(tower), { mode: "space", folder, focus, scene: "tower" });
    // Entering: the same place in the city; going up: the same place in the tower again.
    assert.equal(cityHash(folder, view, null, "city"), city);
    assert.deepEqual(parse(city), { ...parse(tower), scene: "city" });
    assert.equal(cityHash(folder, view, null, "tower"), tower);
    assert.equal(spaceHash(parse(city)), city);
  }
  // Sliding back leaves the folder's tower; a written floor's or a record's inspector is named by view: or entity:.
  assert.deepEqual(parse("#|~space"), { mode: "space", folder: "", focus: null, scene: "tower" });
  assert.deepEqual(parse("#|view:capability.json|~space"), { mode: "space", folder: "", focus: "view:capability.json", scene: "tower" });
  assert.deepEqual(parse("#|entity:backlog.json#cyberspace-mode|~space"), { mode: "space", folder: "", focus: "entity:backlog.json#cyberspace-mode", scene: "tower" });
  assert.equal(spaceHash(parse("#|entity:backlog.json#cyberspace-mode|~space")), "#|entity%3Abacklog.json%23cyberspace-mode|~space");
});

// ── The street ────────────────────────────────────────────────────────────

const { streetPose, walkStep, groundAt, streetWhere, EYE } = vm.runInContext("({ streetPose, walkStep, groundAt, streetWhere, EYE })", context);
const sin20 = Math.sin((20 * Math.PI) / 180), cos20 = Math.cos((20 * Math.PI) / 180);
const close = (a, b, eps = 1e-9) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < eps);
/** A hand-written city world: towers { key, x, z, side, base, h }, plates and beacons as cityWorldFrom makes them. */
const street = ({ dir = "LR", towers = [], plates = [], beacons = [], bounds = null }) => {
  const parts = new Map([...towers, ...plates, ...beacons].map((p) => [p.key, { key: p.key, parent: p.parent ?? null, info: {} }]));
  const boxes = [
    ...towers.map((t) => [t.x - t.side / 2, t.x + t.side / 2, t.z - t.side / 2, t.z + t.side / 2, t.base + t.h]),
    ...plates.map((p) => [p.x0, p.x1, p.z0, p.z1, p.base + 0.5]),
    ...beacons.map((b) => [b.x - 1.25, b.x + 1.25, b.z - 1.25, b.z + 1.25, b.y + 1.3]),
  ];
  const B = bounds ?? { x0: Math.min(...boxes.map((a) => a[0])), x1: Math.max(...boxes.map((a) => a[1])), z0: Math.min(...boxes.map((a) => a[2])), z1: Math.max(...boxes.map((a) => a[3])), top: Math.max(...boxes.map((a) => a[4])) };
  return {
    kind: "component", dir, markers: [], beams: [], parts, bounds: B,
    towers: towers.map((t) => ({ name: t.key, plate: t.parent ?? null, ...t })), plates: plates.map((p) => ({ name: p.key, depth: 0, ...p })), beacons: beacons.map((b) => ({ name: b.key, ...b })),
  };
};
const pose = (w, key) => { const p = streetPose(w, key); return { eye: [...p.eye], target: [...p.target] }; };

test("walking to a part of a left-to-right city, the eye stands 12 units across the flow, turned 20° upstream, looking up at it", () => {
  const w = street({ towers: [{ key: "a", x: 3, z: 5, side: 2.2, base: 0, h: 6.1 }, { key: "far", x: 40, z: 40, side: 2.2, base: 0, h: 2.2 }] });
  const p = pose(w, "a");
  assert.ok(close(p.eye, [3 - 12 * sin20, 1.7, 5 - 12 * cos20]), String(p.eye));
  // The centre line at min(0.55 × h, 6.5) above its base.
  assert.ok(close(p.target, [3, 0.55 * 6.1, 5]), String(p.target));
  // A tall tower is looked at 6.5 above its base, and one on a plate from its base.
  const tall = street({ towers: [{ key: "t", x: 0, z: 0, side: 2.2, base: 0.5, h: 13.9 }] });
  assert.ok(close(pose(tall, "t").target, [0, 7, 0]));
  // The flow runs left to right in front of the reader: the eye looks along +z, turned a little downstream.
  const look = p.target.map((v, i) => v - p.eye[i]);
  assert.ok(look[2] > 0 && look[0] > 0 && look[0] < look[2]);
});

test("walking to a part of a top-to-bottom city, the eye stands across that flow", () => {
  const w = street({ dir: "TB", towers: [{ key: "a", x: -2, z: 1, side: 2.2, base: 0, h: 3.5 }] });
  const p = pose(w, "a");
  assert.ok(close(p.eye, [-2 - 12 * cos20, 1.7, 1 + 12 * sin20]), String(p.eye));
  // The flow runs down the sheet, towards -z, which is to the reader's right: they look along +x.
  const look = p.target.map((v, i) => v - p.eye[i]);
  assert.ok(look[0] > 0 && look[2] < 0 && -look[2] < look[0]);
});

test("an eye that would stand in a tower's footprint grown by 0.6 steps a unit at a time further out, and stands on the plate it is over", () => {
  const at = (k) => [3 - k * sin20, 5 - k * cos20];
  const [bx, bz] = at(12);
  const w = street({ towers: [{ key: "a", x: 3, z: 5, side: 2.2, base: 0, h: 6.1 }, { key: "b", x: bx, z: bz, side: 2, base: 0, h: 3 }] });
  // 13 units out the eye is 0.94 from b's centre along z, inside 1 + 0.6; 14 units out, 1.88, clear of it.
  assert.ok(close(pose(w, "a").eye, [at(14)[0], 1.7, at(14)[1]]), String(pose(w, "a").eye));
  const plated = street({ towers: [{ key: "a", x: 3, z: 5, side: 2.2, base: 0, h: 6.1 }], plates: [{ key: "p", x0: bx - 2, x1: bx + 2, z0: bz - 2, z1: bz + 2, base: 0.5 }] });
  assert.ok(Math.abs(pose(plated, "a").eye[1] - (1 + 1.7)) < 1e-9);
});

test("with nothing selected the eye walks to the centre of the bounds; a beacon is looked at by its height, a plate by its thickness", () => {
  const w = street({ towers: [{ key: "a", x: -10, z: -6, side: 2, base: 0, h: 4 }, { key: "b", x: 10, z: 6, side: 2, base: 0, h: 12 }], beacons: [{ key: "x", x: 20, y: 6.5, z: 0 }], plates: [{ key: "p", x0: -12, x1: -8, z0: -8, z1: -4, base: 0 }] });
  const B = w.bounds, c = [(B.x0 + B.x1) / 2, (B.z0 + B.z1) / 2];
  assert.ok(close(pose(w, null).target, [c[0], Math.min(0.55 * B.top, 6.5), c[1]]));
  assert.ok(close(pose(w, null).eye, [c[0] - 12 * sin20, 1.7, c[1] - 12 * cos20]));
  assert.ok(close(pose(w, "x").target, [20, Math.min(0.55 * 7.8, 6.5), 0]));
  assert.ok(close(pose(w, "p").target, [-10, 0.275, -6]));
});

test("this repository's Loader, as artboard 3 stands it: the eye at (−14.1, 1.7, −31.2), looking at (−10.0, 6.0, −20.0)", () => {
  // The component city of 2026-11-13, as far as the arrival needs it: Loader (6 beams, height 10.0) on Repository reading,
  // where the spec's worked example puts it to a hundredth, the two adapters beside it and the GitHub and GitLab beacons.
  const w = street({
    towers: [
      { key: "loader", x: -10.0, z: -19.96, side: 2.2, base: 0.5, h: 10.0, parent: "reading" },
      { key: "github", x: -4.3, z: -18.9, side: 2.2, base: 0.5, h: 6.1, parent: "reading" },
      { key: "gitlab", x: -4.3, z: -22.1, side: 2.2, base: 0.5, h: 4.8, parent: "reading" },
      { key: "router", x: -20.3, z: -5.2, side: 2.2, base: 0, h: 4.8 },
    ],
    plates: [{ key: "reading", x0: -12.4, x1: -1.6, z0: -24.3, z1: -13.9, base: 0 }],
    beacons: [{ key: "gh", x: 1.2, y: 6.5, z: -18.9 }, { key: "gl", x: 1.2, y: 8, z: -22.1 }],
  });
  const p = pose(w, "loader"), one = (v) => Math.round(v * 10) / 10 || 0;
  assert.deepEqual(p.eye.map(one), [-14.1, 1.7, -31.2]);
  assert.deepEqual(p.target.map(one), [-10.0, 6.0, -20.0]);
  // The eye arrives on open ground beside Repository reading, as the status line says.
  assert.deepEqual({ ...streetWhere(w, p.eye[0], p.eye[2]) }, { over: null, near: "reading" });
});

test("walking into a tower slides along it; over its top, or through a beacon or a plate, the eye walks on", () => {
  const w = street({ towers: [{ key: "t", x: 0, z: 0, side: 2, base: 0, h: 5 }], beacons: [{ key: "b", x: 0, y: 6.5, z: 6 }], plates: [{ key: "p", x0: -8, x1: -4, z0: -2, z1: 2, base: 0 }] });
  // Straight at its face: it stops with the eye's circle (r 0.4) against it.
  assert.ok(close([...walkStep(w, [-3, 0.2], [3, 0], 1.7)], [-1.4, 0.2]));
  // At a slant: it keeps all of the step along the face, and none into it.
  assert.ok(close([...walkStep(w, [-2, -0.5], [3, 1], 1.7)], [-1.4, 0.5]));
  // Round a corner it goes on (the corner, round to the eye's circle, turns it a little), never inside the footprint grown
  // by the eye's radius.
  const [x, z] = walkStep(w, [-3, -0.5], [5, 5], 1.7);
  assert.ok(Math.abs(z - 4.5) < 0.1 && x > -1.4 && x < 2, `${x}, ${z}`);
  assert.ok(Math.max(Math.abs(x) - 1, 0) ** 2 + Math.max(Math.abs(z) - 1, 0) ** 2 >= EYE.r ** 2 - 1e-9);
  // Above the tower's top it isn't in the way; beacons and plates never are.
  assert.ok(close([...walkStep(w, [-3, 0.2], [6, 0], 5.5)], [3, 0.2]));
  assert.ok(close([...walkStep(w, [-3, 6], [6, 0], 1.7)], [3, 6]));
  assert.ok(close([...walkStep(w, [-10, 0], [8, 0], 1.7)], [-2, 0]));
  // A fast step doesn't pass through a thin tower.
  const thin = street({ towers: [{ key: "t", x: 0, z: 0, side: 0.3, base: 0, h: 5 }] });
  assert.ok(walkStep(thin, [-2, 0], [4, 0], 1.7)[0] <= -0.55 + 1e-9);
});

test("plates are steps: the ground under the eye is the top of the highest plate there", () => {
  const w = street({ towers: [{ key: "t", x: 20, z: 20, side: 2, base: 0, h: 3 }], plates: [{ key: "outer", x0: -10, x1: 10, z0: -10, z1: 10, base: 0 }, { key: "inner", x0: -4, x1: 4, z0: -4, z1: 4, base: 0.5, depth: 1 }] });
  assert.equal(groundAt(w, -20, 0), 0);
  assert.equal(groundAt(w, -8, 0), 0.5);
  assert.equal(groundAt(w, 0, 0), 1);
  // Walking onto it isn't stopped: the plate's edge is a step, not a wall.
  assert.ok(close([...walkStep(w, [-15, 0], [15, 0], 1.7)], [0, 0]));
  assert.deepEqual({ ...streetWhere(w, 0, 0) }, { over: "inner", near: "t" });
  assert.deepEqual({ ...streetWhere(w, -15, 0) }, { over: null, near: "t" });
});

test("walking stops at the world's bounds grown by 30 units", () => {
  const w = street({ towers: [{ key: "t", x: 0, z: 0, side: 2, base: 0, h: 3 }], bounds: { x0: -10, x1: 10, z0: -5, z1: 5, top: 3 } });
  assert.ok(close([...walkStep(w, [0, 3], [100, 0], 1.7)], [40, 3]));
  assert.ok(close([...walkStep(w, [0, 3], [-100, -100], 1.7)], [-40, -35]));
  assert.ok(close([...walkStep(w, [39, 34], [5, 5], 1.7)], [40, 35]));
});

test("street addresses read back the same, with a part and without", () => {
  const rows = [
    ["", { kind: "component", file: "component-diagram.json" }, "loader", "#|component%3Aloader|~space:street", "component:loader"],
    ["", { kind: "component", file: "component-diagram.json" }, null, "#|view%3Acomponent-diagram.json|~space:street", "view:component-diagram.json"],
    ["worker/my part", { kind: "deployment", file: "deployment-diagram.json" }, "edge", "#worker/my%20part|deployment%3Aedge|~space:street", "deployment:edge"],
    ["", { kind: "use-case", file: "use-case.json", entity: "switch-modes" }, null, "#|view%3Ause-case.json%23switch-modes|~space:street", "view:use-case.json#switch-modes"],
  ];
  for (const [folder, view, key, hash, focus] of rows) {
    assert.equal(cityHash(folder, view, key, "street"), hash);
    const want = { mode: "space", folder, focus, scene: "street" };
    assert.deepEqual(parse(hash), want);
    assert.deepEqual(parse(decodeURIComponent(hash)), want);
    assert.equal(spaceHash(want), hash);
    // Esc rises to the same place in the city.
    assert.deepEqual(parse(cityHash(folder, view, key, "city")), { ...want, scene: "city" });
  }
});

// ── Looking at the selection ──────────────────────────────────────────────

const { orbitTarget, partStand, streetAim, faceAngles, turnBy, turnDegrees, turnMs, leastMove, leastTurn } = vm.runInContext("({ orbitTarget, partStand, streetAim, faceAngles, turnBy, turnDegrees, turnMs, leastMove, leastTurn })", context);
/** Where an eye stands seen from a point at the rig's angles, `d` away: eyeOf in index.html. */
const eyeAt = (p, { azimuth, elevation }, d) => {
  const a = (azimuth * Math.PI) / 180, e = (elevation * Math.PI) / 180;
  return [p[0] + d * Math.cos(e) * Math.sin(a), p[1] + d * Math.sin(e), p[2] - d * Math.cos(e) * Math.cos(a)];
};
const angles = (x) => ({ azimuth: x.azimuth, elevation: x.elevation });

test("the orbit camera turns about a part's middle: half way up a tower or a plate, a beacon's diamond, moved where its city stands", () => {
  const w = street({ towers: [{ key: "loader", x: -10, z: -19.96, side: 2.2, base: 0.5, h: 10 }], beacons: [{ key: "gh", x: 1.2, y: 6.5, z: -18.9 }], plates: [{ key: "reading", x0: -12.4, x1: -1.6, z0: -24.3, z1: -13.9, base: 0 }] });
  assert.ok(close(orbitTarget(w, "loader"), [-10, 5.5, -19.96]));
  assert.ok(close(orbitTarget(w, "gh"), [1.2, 6.5, -18.9]));
  assert.ok(close(orbitTarget(w, "reading"), [-7, 0.25, -19.1]));
  // A city standing as a layer, 60 units right of the first.
  assert.ok(close(orbitTarget(w, "loader", 60), [50, 5.5, -19.96]));
  assert.equal(orbitTarget(w, "nothing"), null);
  // Its box, for the keyboard to bring into view.
  assert.ok(close([...partStand(w, "loader").box], [-11.1, 0.5, -21.06, -8.9, 10.5, -18.86]));
});

test("the eye faces a point at the angles an orbit pose reads it from; the pitch stays within ±60°", () => {
  // Straight ahead along +z, to the right (+x), and behind.
  assert.deepEqual(angles(faceAngles([0, 0, 0], [0, 0, 10])), { azimuth: 0, elevation: 0 });
  assert.ok(near(faceAngles([0, 0, 0], [10, 0, 0]).azimuth, -90));
  assert.ok(near(Math.abs(faceAngles([0, 0, 0], [0, 0, -10]).azimuth), 180));
  // From the angles it gives, the eye is where it stands.
  for (const [eye, p] of [[[-14.1, 1.7, -31.2], [-10, 6, -20]], [[3, 9, 2], [-4, 1, 7]], [[0, 1.7, 0], [5, 1.7, -5]]]) {
    const a = faceAngles(eye, p), d = Math.hypot(...eye.map((v, i) => v - p[i]));
    assert.ok(close(eyeAt(p, a, d), eye, 1e-9), String(eyeAt(p, a, d)));
  }
  // Looking up at a tower's top from beside it: no more than 60° up.
  assert.equal(faceAngles([0, 1.7, 0], [0, 30, 1]).elevation, -60);
  assert.equal(faceAngles([0, 30, 0], [0, 0, 1], 90).elevation > 60, true);
  // Arriving by this repository's Loader, the street's pose already faces it: selecting it turns nothing.
  const pose = streetPose(street({ towers: [{ key: "loader", x: -10, z: -19.96, side: 2.2, base: 0.5, h: 10 }] }), "loader");
  const s = partStand(street({ towers: [{ key: "loader", x: -10, z: -19.96, side: 2.2, base: 0.5, h: 10 }] }), "loader");
  assert.ok(close([...streetAim(s)], [...pose.target]));
});

test("the eye turns the shorter way round, for 250 ms and 3 more a degree, at most 700", () => {
  assert.equal(turnBy(170, -170), 20);
  assert.equal(turnBy(-170, 170), -20);
  assert.equal(turnBy(10, 370), 0);
  assert.equal(Math.abs(turnBy(0, 180)), 180);
  assert.equal(turnBy(-400, 50), 90);
  assert.ok(near(turnDegrees({ azimuth: 0, elevation: 0 }, { azimuth: 90, elevation: 0 }), 90, 1e-9));
  assert.ok(near(turnDegrees({ azimuth: -170, elevation: 0 }, { azimuth: 170, elevation: 0 }), 20, 1e-9));
  assert.ok(near(turnDegrees({ azimuth: 30, elevation: 0 }, { azimuth: 30, elevation: -40 }), 40, 1e-9));
  assert.ok(near(turnDegrees({ azimuth: 0, elevation: 0 }, { azimuth: 180, elevation: 0 }), 180, 1e-6));
  assert.deepEqual([0, 10, 50, 150, 180].map(turnMs), [250, 280, 400, 700, 700]);
});

test("the least move brings a box or a point inside a rectangle, and none when it is inside", () => {
  const room = { x0: 260, y0: 60, x1: 1060, y1: 780 }, move = (box, rect) => [...leastMove(box, rect)];
  assert.deepEqual(move({ x0: 400, x1: 450, y0: 300, y1: 360 }, room), [0, 0]);
  // Under the inspector on the right, and above the top.
  assert.deepEqual(move({ x0: 1100, x1: 1160, y0: 30, y1: 90 }, room), [-100, 30]);
  // Off the left edge, and a point below the bottom.
  assert.deepEqual(move({ x0: -80, x1: -20, y0: 300, y1: 300 }, room), [340, 0]);
  assert.deepEqual(move({ x0: 500, x1: 500, y0: 900, y1: 900 }, room), [0, -120]);
  // Larger than the rectangle along an axis: its middle to the rectangle's.
  assert.deepEqual(move({ x0: 0, x1: 1000, y0: 100, y1: 900 }, room), [160, -80]);
  // Touching the edge is inside.
  assert.deepEqual(move({ x0: 260, x1: 300, y0: 740, y1: 780 }, room), [0, 0]);
});

test("the least turn brings a part into the window of the view, the way that turns least, and none when it is inside", () => {
  const room = { left: 30, right: 30, up: 20, down: 20 }, at = { azimuth: 0, elevation: 0 }, eye = [0, 1.7, 0];
  const toward = (deg, d = 10, y = 1.7) => faceAngles(eye, [d * Math.sin((deg * Math.PI) / 180), y, d * Math.cos((deg * Math.PI) / 180)], 90);
  // 10° right of where the eye looks: inside, nothing turns.
  assert.deepEqual(angles(leastTurn(at, [toward(10)], room)), at);
  // 40° right: the eye turns 10° right, and the point stands at the window's right edge.
  const r = leastTurn(at, [toward(40)], room);
  assert.ok(near(r.azimuth, -10, 1e-9) && near(r.elevation, 0, 1e-9), JSON.stringify(r));
  assert.ok(near(turnBy(toward(40).azimuth, r.azimuth), 30, 1e-9));
  // Behind the eye, a little to the left: it turns left until the part is at the window's left edge.
  const b = leastTurn(at, [toward(-170)], room);
  assert.ok(near(b.azimuth, 140, 1e-9), JSON.stringify(b));
  // A part's corners: the whole of it comes in, so the far corner is at the edge.
  const c = leastTurn(at, [toward(36), toward(44)], room);
  assert.ok(near(c.azimuth, -14, 1e-9), JSON.stringify(c));
  // High above: it looks up only as far as the window needs, and never past 60°.
  const up = leastTurn(at, [faceAngles(eye, [0, 40, 3], 90)], room);
  assert.equal(up.elevation, -60);
  const some = leastTurn(at, [faceAngles(eye, [0, 1.7 + 10 * Math.tan((30 * Math.PI) / 180), 10], 90)], room);
  assert.ok(near(some.elevation, -10, 1e-9) && near(some.azimuth, 0, 1e-9), JSON.stringify(some));
});

// ── The skyline and layers ────────────────────────────────────────────────

const { skylineWorldFrom, buildingCorners, BUILDING, layerOffsets, LAYER_GAP, spaceSceneFor, spacePlaceOf } = vm.runInContext("({ skylineWorldFrom, buildingCorners, BUILDING, layerOffsets, LAYER_GAP, spaceSceneFor, spacePlaceOf })", context);
const RETRO = JSON.parse(await readFile(new URL("./fixtures/space/retro-folders.json", import.meta.url), "utf8"));
const skyline = (folders) => JSON.parse(JSON.stringify(skylineWorldFrom(folders.map((f) => ({ folder: f.folder, floors: f.kinds ?? f.floors })))));
/** Whether two buildings' footprints overlap: no axis of either rectangle separates them. */
const overlaps = (a, b) => {
  const A = buildingCorners(a), B = buildingCorners(b);
  for (const P of [A, B]) for (let i = 0; i < 4; i++) {
    const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % 4], n = [z0 - z1, x1 - x0], on = (Q) => Q.map(([x, z]) => x * n[0] + z * n[1]);
    const p = on(A), q = on(B);
    if (Math.max(...p) <= Math.min(...q) || Math.max(...q) <= Math.min(...p)) return false;
  }
  return true;
};
/** Angles in [0, 2π) from +z, clockwise seen from above: +x is a quarter turn on. */
const bearing = (b) => (Math.atan2(b.x, b.z) + 2 * Math.PI) % (2 * Math.PI);

test("retro-games' 93 folders of 2026-11-13 stand on rings 20 units apart, no two footprints overlapping", () => {
  assert.equal(RETRO.folders.length, 93);
  assert.equal(RETRO.folders.reduce((s, f) => s + f.kinds.length, 0), 491);
  const w = skyline(RETRO.folders);
  assert.equal(w.buildings.length, 93);
  assert.equal(w.ring, 20);
  for (let i = 0; i < w.buildings.length; i++) for (let j = i + 1; j < w.buildings.length; j++) assert.ok(!overlaps(w.buildings[i], w.buildings[j]), `${w.buildings[i].folder} and ${w.buildings[j].folder}`);
  // A building is as tall as its views: 0.3 and 0.5 a file.
  const files = new Map(RETRO.folders.map((f) => [f.folder, f.kinds.length]));
  for (const b of w.buildings) assert.ok(near(b.h, 0.3 + 0.5 * files.get(b.folder)), b.folder);
  // Each folder stands on the ring of its depth, a dashed line to the folder it is in.
  for (const b of w.buildings) assert.ok(near(Math.hypot(b.x, b.z), 20 * b.depth, 1e-5), b.folder);
  assert.equal(w.lines.length, 92);
  assert.deepEqual(w.lines.find(([f]) => f === "games/hivestorm"), ["games/hivestorm", "games"]);
  // The bounds hold every footprint, and the tallest building: lodestar's 16 files.
  for (const b of w.buildings) for (const [x, z] of buildingCorners(b)) assert.ok(x >= w.bounds.x0 - 1e-9 && x <= w.bounds.x1 + 1e-9 && z >= w.bounds.z0 - 1e-9 && z <= w.bounds.z1 + 1e-9);
  assert.ok(near(w.bounds.top, 8.3));
});

test("this repository's five folders keep ring 14, the root at the origin and the rest round it", () => {
  const five = ["", ".github", "crates", "test", "worker"].map((folder) => ({ folder, floors: ["component", "folder"] }));
  const w = skyline(five);
  assert.equal(w.ring, 14);
  assert.deepEqual([w.buildings[0].x, w.buildings[0].z, w.buildings[0].depth], [0, 0, 0]);
  for (const b of w.buildings.slice(1)) { assert.equal(b.depth, 1); assert.ok(near(Math.hypot(b.x, b.z), 14, 1e-5)); assert.equal(b.parent, ""); }
  for (const b of w.buildings) assert.ok(near(b.h, 1.3));
});

test("the root's first child stands behind the centre, and the rest follow it clockwise seen from above, in folder order", () => {
  const w = skyline(["", "a", "b", "c", "d"].map((folder) => ({ folder, floors: ["component"] })));
  const kids = w.buildings.filter((b) => b.depth === 1);
  assert.deepEqual(kids.map((b) => b.folder), ["a", "b", "c", "d"]);
  // Four equal needs share the circle: the first in the middle of the first quarter, from +z towards +x.
  assert.ok(near(bearing(kids[0]), Math.PI / 4, 1e-6) && kids[0].z > 0 && kids[0].x > 0);
  const turns = kids.map(bearing);
  for (let i = 1; i < turns.length; i++) assert.ok(turns[i] > turns[i - 1], "clockwise");
  // A folder with a subtree needs the angle its subtree needs, and its children share its span.
  const deep = skyline(["", "a", "a/x", "a/y", "b"].map((folder) => ({ folder, floors: ["component"] })));
  const a = deep.buildings.find((b) => b.folder === "a"), kidsOfA = deep.buildings.filter((b) => b.parent === "a");
  assert.equal(kidsOfA.length, 2);
  assert.ok(near(bearing(a), (bearing(kidsOfA[0]) + bearing(kidsOfA[1])) / 2, 1e-9));
  assert.ok(bearing(kidsOfA[0]) < bearing(kidsOfA[1]));
});

test("one folder is one building at the origin; folders with no parent are the first ring, and the centre is empty", () => {
  const one = skyline([{ folder: "", floors: ["component", "vision"] }]);
  assert.equal(one.buildings.length, 1);
  assert.deepEqual([one.buildings[0].x, one.buildings[0].z, one.buildings[0].h], [0, 0, 1.3]);
  assert.equal(one.ring, 14);
  assert.deepEqual(one.lines, []);
  const tops = skyline(["games", "games/chess", "tools"].map((folder) => ({ folder, floors: ["component"] })));
  assert.equal(tops.buildings.length, 3);
  assert.ok(tops.buildings.every((b) => Math.hypot(b.x, b.z) > 1), "nothing at the centre");
  assert.deepEqual(tops.buildings.filter((b) => b.depth === 1).map((b) => b.folder), ["games", "tools"]);
  assert.equal(tops.buildings.find((b) => b.folder === "games/chess").depth, 2);
  assert.deepEqual(tops.lines, [["games/chess", "games"]]);
});

test("a building's footprint is 4.5 along its ring and 6 towards the centre", () => {
  const w = skyline(["", "a"].map((folder) => ({ folder, floors: ["component"] }))), b = w.buildings[1];
  const c = buildingCorners(b), side = (i, j) => Math.hypot(c[i][0] - c[j][0], c[i][1] - c[j][1]);
  assert.ok(near(side(0, 1), BUILDING.w) && near(side(1, 2), BUILDING.d));
  // Its depth points at the centre: the middle of its near side is 3 nearer the centre than its own.
  const mid = (i, j) => Math.hypot((c[i][0] + c[j][0]) / 2, (c[i][1] + c[j][1]) / 2);
  assert.ok(near(Math.min(mid(0, 1), mid(2, 3)), Math.hypot(b.x, b.z) - 3, 1e-9));
});

test("a second and a third city each stand 12 units right of the last one's bounds", () => {
  const first = { x0: -20, x1: 20.3 }, second = { x0: -7, x1: 9 }, third = { x0: -30, x1: 4 };
  const dx = layerOffsets([first, second, third]);
  assert.equal(LAYER_GAP, 12);
  assert.equal(dx[0], 0);
  assert.ok(near(second.x0 + dx[1], first.x1 + 12));
  assert.ok(near(third.x0 + dx[2], second.x1 + dx[1] + 12));
  assert.deepEqual([...layerOffsets([first])], [0]);
});

test("a skyline address opens the tower in a repository of one folder, and the skyline otherwise", () => {
  assert.equal(spaceSceneFor("skyline", 1), "tower");
  assert.equal(spaceSceneFor("skyline", 0), "tower");
  assert.equal(spaceSceneFor("skyline", 5), "skyline");
  for (const scene of ["tower", "city", "street"]) assert.equal(spaceSceneFor(scene, 1), scene);
});

test("switching to Flat from the skyline opens the folder", () => {
  assert.equal(switchHash("flat", spacePlaceOf(parse("#worker|~space:skyline"))), "#worker");
  assert.equal(switchHash("flat", spacePlaceOf(parse("#|~space:skyline"))), "#");
  // Whatever else the address names.
  assert.equal(switchHash("flat", spacePlaceOf(parse("#worker|component:handler|~space:skyline"))), "#worker");
  // The other scenes keep the part or view, as before.
  assert.equal(switchHash("flat", spacePlaceOf(parse("#worker|component:handler|~space:city"))), "#worker|component%3Ahandler");
  assert.equal(switchHash("flat", spacePlaceOf(parse("#|view:use-case.json#a|~space:city"))), "#|view%3Ause-case.json%23a");
});

test("every row of Switching modes keeps the place, both ways", () => {
  const rows = [
    // Flat, folder F, tab K open, part P selected
    [switchHash("space", { folder: "worker", kind: "component", part: "handler", view: "component-diagram.json" }), "#worker|component%3Ahandler|~space:city"],
    // Flat, tab K open, nothing selected: the first file of K when K is drawn, the folder's tower otherwise
    [switchHash("space", { folder: "worker", view: "component-diagram.json" }), "#worker|view%3Acomponent-diagram.json|~space"],
    [switchHash("space", { folder: "worker", view: null }), "#worker|~space"],
    // Flat, Waiting
    [switchHash("space", { waiting: true }), "#|~space"],
    // Cyberspace, any scene, part P of kind K selected
    ...["", ":city", ":street"].map((s) => [switchHash("flat", spacePlaceOf(parse(`#worker|component:handler|~space${s}`))), "#worker|component%3Ahandler"]),
    // Cyberspace, no selection, view V; and the tower with no view named
    [switchHash("flat", spacePlaceOf(parse("#worker|view:deployment-diagram.json|~space:city"))), "#worker|view%3Adeployment-diagram.json"],
    [switchHash("flat", spacePlaceOf(parse("#worker|~space"))), "#worker"],
    // Cyberspace, the skyline, folder F
    [switchHash("flat", spacePlaceOf(parse("#worker|~space:skyline"))), "#worker"],
  ];
  for (const [got, want] of rows) assert.equal(got, want);
});

// ── Finish: the keyboard's order, the layers' draw calls, the labels' contrast ──

const { partOrder, cityCalls, layerFits, DRAW_BUDGET } = vm.runInContext("({ partOrder, cityCalls, layerFits, DRAW_BUDGET })", context);

test("Tab walks a city's parts along its flow, a rank at a time, a plate before what stands on it", () => {
  // Left to right: ranks by x, each from the back of the sheet (+z) forwards.
  const lr = {
    dir: "LR",
    plates: [{ key: "p", x0: 3, x1: 9, z0: -2, z1: 6 }],
    towers: [{ key: "a", x: 0, z: 0 }, { key: "c", x: 5, z: -1 }, { key: "b", x: 5, z: 4 }, { key: "e", x: 10.1, z: 0 }],
    beacons: [{ key: "x", x: 10, z: 3 }],
  };
  assert.deepEqual([...partOrder(lr)], ["a", "p", "b", "c", "x", "e"]);
  // Top to bottom: ranks from the back, each from the left.
  const tb = { dir: "TB", plates: [], towers: [{ key: "low", x: 0, z: -5 }, { key: "right", x: 4, z: 5 }, { key: "left", x: -4, z: 5 }], beacons: [] };
  assert.deepEqual([...partOrder(tb)], ["left", "right", "low"]);
});

test("a city's draw calls are counted from its world, as buildCity draws it", () => {
  const beam = (from, to) => ({ from, to });
  // The component city of this repository: the glass of its plates, towers and beacons, their edges, and its ribbons.
  const component = { plates: [{}], towers: [{ alt: false }], beacons: [{}], markers: [], beams: [beam("a", "b")], traces: [beam("a", "b")] };
  assert.equal(cityCalls(component), 5);
  // A state machine: towers, their edges, and the ribbons (traces, pads, the start point).
  assert.equal(cityCalls({ plates: [], towers: [{ alt: false }], beacons: [], markers: [{}], beams: [beam("s", "a"), beam("a", "a")], traces: [beam("s", "a"), beam("a", "a")] }), 3);
  // A use case: an alternative outcome's dashed edges are glow lines like the rest; a city of towers alone still has their pads.
  assert.equal(cityCalls({ plates: [], towers: [{ alt: false }, { alt: true }], beacons: [], markers: [], beams: [], traces: [] }), 3);
});

test("the Layers panel keeps a city scene within 40 draw calls, with a selection and a trace under the pointer", () => {
  assert.equal(DRAW_BUDGET, 40);
  // This repository's drawn views of 2026-11-16: component 5, deployment 5, four state machines 3 each, a use case and a user
  // journey 3 each; the scene keeps 4, the sky, the floor and the lit beams' core and glow. All of them stand in 32.
  const standing = [5, 5, 3, 3, 3, 3, 3];
  assert.ok(layerFits(standing, 3), "the last one fits: 28 standing, 32 with a part selected");
  assert.ok(layerFits([5, 5, 5, 5, 5, 5, 3], 3));
  assert.ok(!layerFits([5, 5, 5, 5, 5, 5, 3], 5), "one more component city would pass 40 with a part selected");
  // A view standing in the place of another counts only the difference.
  assert.ok(layerFits([5, 5, 5, 5, 5, 5, 3], 5, 3));
  assert.ok(!layerFits([33], 4));
});

// ── Traces on the floor (G2) ─────────────────────────────────────────────

const { traceAt, TRACE } = vm.runInContext("({ traceAt, TRACE })", context);
const COMPONENT = JSON.parse(await readFile(new URL("./fixtures/space/component-city.json", import.meta.url), "utf8"));
/** The fixture's layout as layout() returns it: boxes by key and dagre's points on each edge, in sheet px. */
const fixtureSheet = (F) => ({ w: F.L.w, h: F.L.h, box: new Map(Object.entries(F.L.box).map(([k, [x, y, w, h]]) => [k, { x, y, w, h }])), edges: F.L.edges.map((e) => ({ key: e.key, pts: e.pts.map(([x, y]) => ({ x, y })) })) });
/** A trace's runs: each pair of its points, flat ones (along x or z) and climbs (a wall's vertical). */
const runsOf = (t) => [...t.points].slice(1).map((q, i) => [t.points[i], q]);
const axis = ([p, q]) => [0, 1, 2].filter((k) => Math.abs(p[k] - q[k]) > 1e-9);
/** Runs of a trace through a tower's footprint, other than its own ends'. */
const through = (w, t) => [...w.towers].filter((o) => o.key !== t.from && o.key !== t.to && runsOf(t).some(([p, q]) => {
  const s = o.side / 2;
  return Math.max(p[0], q[0]) > o.x - s && Math.min(p[0], q[0]) < o.x + s && Math.max(p[2], q[2]) > o.z - s && Math.min(p[2], q[2]) < o.z + s;
})).map((o) => o.key);
/** Whether a point stands on a square pad's ring. */
const onPad = (p, pad) => near(Math.max(Math.abs(p[0] - pad.x), Math.abs(p[2] - pad.z)), pad.half, 1e-6) && near(p[1], pad.y, 1e-6);

test("this repository's component city routes a trace per beam along dagre's points, every run square, clear of towers, pad to pad", () => {
  const w = cityWorldFrom({ nodes: COMPONENT.nodes, edges: COMPONENT.edges, dir: COMPONENT.dir }, fixtureSheet(COMPONENT), COMPONENT.kind, COMPONENT.dir);
  assert.deepEqual(w.traces.map((t) => t.key), w.beams.map((b) => b.key));
  assert.equal(w.traces.length, 40);
  const pad = (key) => w.pads.find((p) => p.key === key && p.kind !== "plate"), plates = new Set(w.plates.map((p) => p.key));
  for (const t of w.traces) {
    // Along x, along z, or up a plate's wall: one axis a run.
    for (const r of runsOf(t)) assert.equal(axis(r).length, 1, `${t.key}: ${JSON.stringify(r)}`);
    assert.deepEqual(through(w, t), [], t.key);
    // From a pin on the source's pad to a pin on the target's; a plate is reached at a pad of its own on its top.
    for (const [key, p] of [[t.from, t.points[0]], [t.to, t.points[t.points.length - 1]]]) {
      if (plates.has(key)) assert.ok(w.pads.some((q) => q.key === key && q.kind === "plate" && near(q.x, p[0]) && near(q.z, p[2]) && near(q.y, p[1])), `${t.key} at ${key}`);
      else assert.ok(onPad(p, pad(key)), `${t.key} at ${key}`);
    }
  }
  // A pad per tower, its footprint grown by 0.25, and a 2 × 2 one under each beacon.
  for (const t of w.towers) assert.ok(near(pad(t.key).half, t.side / 2 + 0.25) && near(pad(t.key).y, t.base));
  for (const b of w.beacons) assert.ok(near(pad(b.key).half, 1) && pad(b.key).y === 0);
  // Loader's five outgoing traces leave its downstream side (+x, the layout running left to right), 0.3 apart, ordered by where
  // they head: the one heading furthest back (+z) from the back of the side.
  const loader = pad("loader"), out = w.traces.filter((t) => t.from === "loader");
  assert.equal(out.length, 5);
  for (const t of out) assert.ok(near(t.points[0][0], loader.x + loader.half), t.key);
  const pins = out.map((t) => t.points[0][2]), heads = out.map((t) => (t.points[2] ?? t.points[t.points.length - 1])[2]);
  const byPin = out.map((_, i) => i).sort((a, b) => pins[b] - pins[a]), byHead = out.map((_, i) => i).sort((a, b) => heads[b] - heads[a]);
  assert.deepEqual(byPin, byHead);
  const sorted = pins.slice().sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) assert.ok(near(sorted[i] - sorted[i - 1], 0.3, 1e-9));
  assert.ok(near((sorted[0] + sorted[4]) / 2, loader.z, 1e-9), "round the side's middle");
});

// A part on a plate nested in a plate; two parts on the ground, one with a loop and one with two; a beacon; three edges
// between the same two parts, with dagre's points alike.
const ROUTED = {
  dir: "LR",
  nodes: [
    { key: "outer", cluster: true, label: "Outer", info: {} },
    { key: "inner", cluster: true, label: "Inner", parent: "outer", info: {} },
    leaf("n", { parent: "inner" }), leaf("a"), leaf("b"), leaf("x", { ext: true }),
  ],
  edges: [edge("l1", "a", "a"), edge("l2", "b", "b"), edge("l3", "b", "b"), edge("e1", "a", "x"), edge("e2", "n", "a"), edge("p1", "a", "b"), edge("p2", "a", "b"), edge("p3", "a", "b")],
};
const ROUTED_L = {
  ...sheet({ outer: [250, 400, 360, 360], inner: [250, 400, 220, 220], n: [250, 400, 100, 48], a: [640, 400, 100, 48], b: [1000, 400, 100, 48], x: [1000, 120, 100, 48] }, 1200, 800),
  edges: [
    { key: "e1", pts: [{ x: 690, y: 390 }, { x: 820, y: 200 }, { x: 950, y: 130 }] },
    { key: "e2", pts: [{ x: 300, y: 400 }, { x: 590, y: 400 }] },
    ...["p1", "p2", "p3"].map((key) => ({ key, pts: [{ x: 690, y: 400 }, { x: 820, y: 480 }, { x: 950, y: 400 }] })),
  ],
};

test("loops are hairpins downstream, a beacon is reached at its pad, a nested part climbs both walls, parallel traces take lanes", () => {
  const w = cityWorldFrom(ROUTED, ROUTED_L, "component", "LR"), tr = (k) => w.traces.find((t) => t.key === k), pad = (k) => w.pads.find((p) => p.key === k);
  assert.equal(w.traces.length, 8);
  // A loop leaves the pad's downstream side 0.18 above its middle, runs 0.6 out, across, and back in 0.18 below; a second loop
  // on the same part stands 0.3 further out and 0.12 wider.
  const a = pad("a"), b = pad("b"), l1 = tr("l1"), l2 = tr("l2"), l3 = tr("l3");
  assert.equal(l1.self, true);
  assert.deepEqual([...l1.points].map((p) => [+(p[0] - a.x).toFixed(6), +(p[2] - a.z).toFixed(6)]), [[a.half, 0.18], [a.half + 0.6, 0.18], [a.half + 0.6, -0.18], [a.half, -0.18]].map(([x, z]) => [+x.toFixed(6), +z.toFixed(6)]));
  const outOf = (t) => Math.max(...t.points.map((p) => p[0])) - b.x, wide = (t) => Math.max(...t.points.map((p) => p[2])) - b.z;
  assert.ok(near(outOf(l3) - outOf(l2), 0.3) && near(wide(l3) - wide(l2), 0.12));
  // The beacon's trace ends on the 2 × 2 pad on the floor under it, and is magenta.
  const e1 = tr("e1"), x = pad("x");
  assert.equal(x.half, 1);
  assert.ok(onPad(e1.points[e1.points.length - 1], x) && e1.ext);
  // The part on the nested plate: its trace drops down the inner plate's wall, then the outer one's, and reaches a on the ground.
  const e2 = tr("e2"), climbs = runsOf(e2).filter((r) => axis(r)[0] === 1 && axis(r).length === 1);
  assert.deepEqual(climbs.map(([p, q]) => [p[1], q[1]]), [[1, 0.5], [0.5, 0]]);
  assert.equal(e2.points[0][1], 1);
  // The three parallel traces take three lanes 0.3 apart where they run together along the flow.
  const middle = ["p1", "p2", "p3"].map((k) => runsOf(tr(k)).slice(1, -1).filter((r) => axis(r)[0] === 0).sort((r, s) => Math.abs(s[1][0] - s[0][0]) - Math.abs(r[1][0] - r[0][0]))[0][0][2]).sort((m, n) => m - n);
  assert.ok(near(middle[1] - middle[0], 0.3, 1e-9) && near(middle[2] - middle[1], 0.3, 1e-9), JSON.stringify(middle));
  for (const t of w.traces) assert.deepEqual(through(w, t), [], t.key);
});

test("without a layout each trace is one Z between its pins, or where that crosses a tower two by a street clear of towers", () => {
  // Nine parts in rows of three, 5 units apart: a0 a1 a2 / b0 b1 b2 / c0 c1 c2.
  const keys = ["a0", "a1", "a2", "b0", "b1", "b2", "c0", "c1", "c2"];
  const model = { dir: "LR", nodes: keys.map((k) => leaf(k)), edges: [edge("next", "a0", "a1"), edge("far", "a0", "a2"), edge("down", "a0", "c2"), edge("back", "c2", "a0"), edge("col", "a1", "c1")] };
  const w = cityWorldFrom(model, null, "component", "LR"), tr = (k) => w.traces.find((t) => t.key === k);
  for (const t of w.traces) {
    assert.deepEqual(through(w, t), [], t.key);
    for (const r of runsOf(t)) assert.equal(axis(r).length, 1, t.key);
  }
  // Next door: one Z (here a straight line, the two pins facing each other in one row).
  assert.ok(runsOf(tr("next")).length <= 3);
  // Two along, in the same row: the Z would run through a1, so it goes round by the street beside the row.
  assert.equal(runsOf(tr("far")).length, 5);
  assert.ok(runsOf(tr("col")).length <= 3);
});

test("the skyline's lines to parent folders are traces square to the rings, siblings in lanes 0.35 apart that never cross", () => {
  const w = skyline(RETRO.folders), by = new Map(w.buildings.map((b) => [b.folder, b]));
  assert.equal(w.traces.length, 92);
  assert.deepEqual(new Set(w.traces.map((t) => t.key)), new Set(w.buildings.filter((b) => b.parent !== null).map((b) => b.folder)));
  const radius = (p) => Math.hypot(p[0], p[2]), turn = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const lanes = new Map();
  for (const t of w.traces) {
    const b = by.get(t.from), p = by.get(t.to);
    assert.equal(p.folder, b.parent);
    // Each run along a radius (both ends on one line through the centre) or round a ring (both ends as far from it).
    for (const [s, e] of runsOf(t)) {
      const radial = Math.abs(s[0] * e[2] - s[2] * e[0]) < 1e-4 && s[0] * e[0] + s[2] * e[2] >= 0, round = Math.abs(radius(s) - radius(e)) < 1e-4;
      assert.ok(radial || round, `${t.key}: ${JSON.stringify([s, e])}`);
    }
    // It starts at the side of the folder's pad facing the centre, and ends at its parent's pad.
    assert.ok(near(radius(t.points[0]), 20 * b.depth - 3.35, 1e-5), t.key);
    if (p.depth) {
      assert.ok(near(radius(t.points[t.points.length - 1]), 20 * p.depth + 3.35, 1e-5), t.key);
      const lane = radius(t.points[1]);
      if (!lanes.has(p.folder)) lanes.set(p.folder, []);
      lanes.get(p.folder).push({ b, lane, sweep: turn(p.angle - b.angle) });
    }
  }
  let shared = 0;
  for (const kids of lanes.values()) {
    if (kids.length < 2) continue;
    shared++;
    const rs = kids.map((k) => k.lane).sort((m, n) => m - n);
    for (let i = 1; i < rs.length; i++) assert.ok(near(rs[i] - rs[i - 1], 0.35, 1e-5));
    // No sibling's run in crosses another's run round: a run round that spans a sibling's angle is on a lane inside its.
    for (const i of kids) for (const j of kids) if (i !== j && Math.abs(turn(i.b.angle - (j.b.angle))) < Math.abs(j.sweep) && Math.sign(turn(i.b.angle - j.b.angle)) === Math.sign(j.sweep)) assert.ok(j.lane < i.lane, `${j.b.folder} round past ${i.b.folder}`);
  }
  assert.ok(shared > 5);
  // A folder of the first ring goes straight in to the root's pad.
  const games = w.traces.find((t) => t.key === "games");
  assert.equal(games.points.length, 2);
});

test("traceAt finds the trace nearest a point within 0.3, and none further", () => {
  const w = { traces: [{ key: "a", points: [[0, 0, 0], [4, 0, 0], [4, 0, 3]] }, { key: "b", points: [[0, 0.5, 1], [4, 0.5, 1]] }] };
  assert.equal(TRACE.near, 0.3);
  assert.equal(traceAt(w, 2, 0.2).key, "a");
  assert.equal(traceAt(w, 2, 0.75).key, "b");
  assert.equal(traceAt(w, 4.25, 2).key, "a");
  assert.equal(traceAt(w, 2, 0.5), null);
  assert.equal(traceAt(w, 4.4, 0), null);
  assert.equal(traceAt({ traces: [] }, 0, 0), null);
});

// ── The token blocks and the labels' contrast: Flat and Cyberspace in light and dark (decision theme-switch) ──

// index.html's style sheet: the light :root, which holds Cyberspace's own tokens too, and the dark block under
// :root[data-theme="dark"].
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const tokens = (body) => Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map(([, k, v]) => [k, v]));
const LIGHT = tokens(css.match(/\n {2}:root \{([^}]*)\}/)[1]);
const DARK = tokens(css.match(/\n {2}:root\[data-theme="dark"\] \{([^}]*)\}/)[1]);
// The palette the spec names (Rendering, Palette): its table's tokens and their dark and light values.
const spec = await readFile(new URL("../docs/cyberspace-mode-spec.md", import.meta.url), "utf8");
const PALETTE = Object.fromEntries([...spec.matchAll(/^\| `--(space-[\w-]+)` \| `(#[0-9a-f]{6})` \| `(#[0-9a-f]{6})` \|/gm)].map(([, k, dark, light]) => [k, { dark, light }]));

test("every colour token has a light value and a dark one", () => {
  assert.ok(Object.keys(DARK).length >= 40);
  assert.deepEqual(Object.keys(DARK).sort(), Object.keys(LIGHT).sort());
  // The old copies are gone: no media query and no :root.space block picks colours any more.
  assert.ok(!/prefers-color-scheme/.test(css));
  assert.ok(!/:root\.space/.test(css));
});

test("every --space-* token the spec's palette names is defined once in each theme, at the palette's values", () => {
  assert.equal(Object.keys(PALETTE).length, 23);
  for (const [name, { dark, light }] of Object.entries(PALETTE)) {
    assert.equal(css.split(`--${name}:`).length - 1, 2, `--${name} is defined once in each theme`);
    assert.equal(LIGHT[name], light, `--${name} is the spec's ${light} by day`);
    assert.equal(DARK[name], dark, `--${name} is the spec's ${dark} by night`);
  }
  // And Cyberspace defines nothing the palette doesn't name.
  assert.deepEqual(Object.keys(LIGHT).filter((k) => k.startsWith("space-") && !(k in PALETTE)), []);
});

const THEMES = { light: LIGHT, dark: { ...LIGHT, ...DARK } };

// Label text against its pill: the colours the rules give, mixed as the browser mixes them, in sRGB.
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const mix = (a, p, b) => a.map((v, i) => v * p + b[i] * (1 - p));
const luminance = (c) => { const [r, g, b] = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
/** A colour a rule gives, `var(--x)` or `color-mix(in srgb, var(--x) p%, var(--y) | transparent)` (over `under`), in a theme. */
const colour = (value, t, under = null) => {
  const m = value.match(/color-mix\(in srgb, var\(--([\w-]+)\) (\d+)%, (?:var\(--([\w-]+)\)|transparent)\)/);
  if (!m) return rgb(t[value.match(/var\(--([\w-]+)\)/)[1]]);
  return mix(rgb(t[m[1]]), +m[2] / 100, m[3] ? rgb(t[m[3]]) : under);
};
/** A property of the rule for exactly `selector`. */
const rule = (selector, prop) => css.match(new RegExp(`(?:^|[\\n{]) *${selector.replace(/[.]/g, "\\.")} \\{[^}]*?(?:^|[ ;{])${prop}: ([^;]+);`))?.[1];

test("in Cyberspace label text stands 4.5:1 against its pill over every part of the sky, in light and dark", () => {
  for (const [name, t] of Object.entries(THEMES)) {
  for (const sky of ["space-sky-horizon", "space-sky-mid", "space-sky-zenith", "space-sky-band", "space-fog"]) {
    const pill = colour(rule(".sl", "background"), t, rgb(t[sky]));
    const pairs = {
      "a part's label": colour(rule(".sl", "color"), t),
      "a neighbour's label": colour(rule(".sl.near", "color"), t),
      "a beacon's label": colour(rule(".sl.beacon", "color"), t),
      "a building's folder segment": colour(rule(".sl .seg", "color"), t),
    };
    for (const [what, text] of Object.entries(pairs)) assert.ok(contrast(text, pill) >= 4.5, `${name}, ${sky}: ${what} is ${contrast(text, pill).toFixed(2)}:1`);
    const beamPill = colour(rule(".sbl", "background"), t, rgb(t[sky]));
    assert.ok(contrast(colour(rule(".sbl", "color"), t), beamPill) >= 4.5, `${name}, ${sky}: a beam's label`);
  }
  // Selected: --space-pill on a pill of --space-hot, and a selected building's folder segment at 70% of it.
  const hot = colour(rule(".sl.sel", "background"), t), text = colour(rule(".sl.sel", "color"), t);
  assert.ok(contrast(text, hot) >= 4.5, `${name}: the selected label`);
  assert.ok(contrast(mix(text, 0.7, hot), hot) >= 4.5, `${name}: the selected building's segment`);
  }
});

test("Flat's labels stand 4.5:1 against what they are drawn on, in light and dark", () => {
  for (const [name, t] of Object.entries(THEMES)) {
    // A part's name and its kind on its plate; a relationship's label on its tab.
    const plate = rgb(t.plate), tab = colour(rule(".elabel rect", "fill"), t);
    for (const [what, text, under] of [["a part's name", colour(rule(".dg text", "fill"), t), plate], ["a part's kind", colour(rule(".dg .sub", "fill"), t), plate], ["a relationship's label", colour(rule(".elabel text", "fill"), t), tab]]) {
      assert.ok(contrast(text, under) >= 4.5, `${name}: ${what} is ${contrast(text, under).toFixed(2)}:1`);
    }
  }
});
