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
