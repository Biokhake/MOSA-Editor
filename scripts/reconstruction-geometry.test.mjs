import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import * as THREE from "three";
import { ADDITION, Evaluator } from "three-bvh-csg";
import { createServer } from "vite";

let geometryModule;
let vite;

before(async () => {
  vite = await createServer({
    root: process.cwd(),
    configFile: false,
    appType: "custom",
    server: { middlewareMode: true },
  });
  geometryModule = await vite.ssrLoadModule("/src/lib/mech/reconstruction/geometry.ts");
});

after(async () => {
  await vite?.close();
});

const operation = (overrides = {}) => ({
  id: "wedge",
  mode: "add",
  shape: "wedge",
  role: "primary",
  size: [0.8, 0.6, 1.1],
  position: [0.45, 1.2, 0.25],
  rotation: [0.21, -0.37, 0.16],
  bevel: 0,
  ...overrides,
});

const segment = (operations) => ({
  id: "source",
  label: "Source",
  group: "torso",
  anchor: "root",
  mirrorOf: "",
  operations,
});

const kit = (...segments) => ({
  version: 1,
  name: "Geometry test",
  sourceSummary: "",
  transformationNotes: [],
  palette: {
    primary: "#888888",
    secondary: "#777777",
    accent: "#ff8800",
    frame: "#222222",
    optic: "#44aaff",
  },
  segments,
});

function signedVolume(geometry) {
  const position = geometry.getAttribute("position");
  const index = geometry.index;
  let volume = 0;
  const vertex = (i) => new THREE.Vector3().fromBufferAttribute(position, i);
  const count = index?.count ?? position.count;
  for (let i = 0; i < count; i += 3) {
    const a = vertex(index ? index.getX(i) : i);
    const b = vertex(index ? index.getX(i + 1) : i + 1);
    const c = vertex(index ? index.getX(i + 2) : i + 2);
    volume += a.dot(b.cross(c)) / 6;
  }
  return volume;
}

function vertexKeys(geometry, mirrorX = false) {
  const position = geometry.getAttribute("position");
  return Array.from({ length: position.count }, (_, i) => {
    const x = (mirrorX ? -1 : 1) * position.getX(i);
    return `${x.toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`;
  }).sort();
}

describe("reconstruction compound geometry", () => {
  it("builds an outward wedge with the CSG attribute contract", () => {
    const source = segment([operation()]);
    const group = geometryModule.buildCompoundSegment(
      source,
      kit(source),
      null,
      null,
      "#ffffff",
      false,
      "dark",
    );
    const geometry = group.children[0].geometry;
    assert.deepEqual(Object.keys(geometry.attributes).sort(), ["normal", "position", "uv"]);
    assert.ok(signedVolume(geometry) > 0);
    geometryModule.disposeCompound(group);
  });

  it("keeps mirrored wedges outward and reflects their orientation across X", () => {
    const source = segment([operation()]);
    const mirror = { ...source, id: "mirror", label: "Mirror", mirrorOf: source.id, operations: [] };
    const sourceGroup = geometryModule.buildCompoundSegment(
      source,
      kit(source, mirror),
      null,
      null,
      "#ffffff",
      false,
      "dark",
    );
    const mirrorGroup = geometryModule.buildCompoundSegment(
      mirror,
      kit(source, mirror),
      null,
      null,
      "#ffffff",
      false,
      "dark",
    );
    const sourceGeometry = sourceGroup.children[0].geometry;
    const mirrorGeometry = mirrorGroup.children[0].geometry;
    assert.deepEqual(vertexKeys(sourceGeometry, true), vertexKeys(mirrorGeometry));
    assert.ok(signedVolume(sourceGeometry) > 0);
    assert.ok(signedVolume(mirrorGeometry) > 0);
    geometryModule.disposeCompound(sourceGroup);
    geometryModule.disposeCompound(mirrorGroup);
  });

  it("preserves every additive mass when a Boolean union fails", () => {
    const originalEvaluate = Evaluator.prototype.evaluate;
    const originalWarn = console.warn;
    const warnings = [];
    Evaluator.prototype.evaluate = function (...args) {
      if (args[2] === ADDITION) throw new Error("forced union failure");
      return originalEvaluate.apply(this, args);
    };
    console.warn = (...args) => warnings.push(args);
    try {
      const source = segment([
        operation({ id: "a", shape: "box", position: [-1, 1.2, 0] }),
        operation({ id: "b", shape: "sphere", position: [0, 1.2, 0] }),
        operation({ id: "c", position: [1, 1.2, 0] }),
      ]);
      const group = geometryModule.buildCompoundSegment(
        source,
        kit(source),
        null,
        null,
        "#ffffff",
        false,
        "dark",
      );
      assert.equal(group.children.length, 3);
      assert.equal(warnings.length, 2);
      assert.match(String(warnings[0][0]), /operation "b".*preserving/);
      assert.match(String(warnings[1][0]), /operation "c".*preserving/);
      geometryModule.disposeCompound(group);
    } finally {
      Evaluator.prototype.evaluate = originalEvaluate;
      console.warn = originalWarn;
    }
  });

  it("unions a wedge with a standard primitive", () => {
    const source = segment([
      operation(),
      operation({ id: "box", shape: "box", position: [0.48, 1.2, 0.25] }),
    ]);
    const group = geometryModule.buildCompoundSegment(
      source,
      kit(source),
      null,
      null,
      "#ffffff",
      true,
      "dark",
    );
    assert.equal(group.children.length, 2, "one union mesh and its edge overlay");
    assert.ok(group.children[0].geometry.getAttribute("position").count > 0);
    geometryModule.disposeCompound(group);
  });
});
