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
