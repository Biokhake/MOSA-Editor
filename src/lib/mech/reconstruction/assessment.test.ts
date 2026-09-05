import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import {
  assessReconstructionPlan,
  reconstructionOperationBounds,
  reconstructionOperationContains,
} from "./assessment.ts";
import type { ReconstructedKit, ReconstructedSegment, ShapeOperation } from "./types.ts";

function operation(
  id: string,
  position: [number, number, number],
  overrides: Partial<ShapeOperation> = {},
): ShapeOperation {
  return {
    id,
    mode: "add",
    shape: "box",
    role: "primary",
    size: [0.5, 0.4, 0.4],
    position,
    rotation: [0, 0, 0],
    bevel: 0.15,
    ...overrides,
  };
}

function segment(
  id: string,
  label: string,
  group: ReconstructedSegment["group"],
  operations: ShapeOperation[],
  overrides: Partial<ReconstructedSegment> = {},
): ReconstructedSegment {
  return {
    id,
    label,
    group,
    anchor: group === "head" ? "neck" : "torso",
    mirrorOf: "",
    operations,
    ...overrides,
  };
}

const headShell = () =>
  segment("head-shell", "Head Shell", "head", [
    operation("shell-a", [-0.1, 1.72, 0], { size: [0.32, 0.28, 0.3] }),
    operation("shell-b", [0.1, 1.7, 0.02], { size: [0.32, 0.24, 0.28] }),
  ]);

const headSensor = () =>
  segment("head-sensor", "Face Sensor", "head", [
    operation("optic", [0, 1.72, 0.18], {
      role: "optic",
      size: [0.22, 0.06, 0.04],
    }),
  ]);

const headCrown = (id = "head-crown") =>
  segment(id, "Crown Antenna", "head", [
    operation("fin", [0, 1.96, 0], { role: "accent", size: [0.08, 0.28, 0.08] }),
  ]);

const torso = (operations?: ShapeOperation[]) =>
  segment(
    "torso-core",
    "Torso Core",
    "torso",
    operations ?? [operation("chest-l", [-0.14, 1.1, 0]), operation("chest-r", [0.14, 1.1, 0])],
  );

function kit(
  head: ReconstructedSegment[] = [headShell(), headSensor(), headCrown()],
): ReconstructedKit {
  return {
    version: 1,
    name: "Assessment fixture",
    sourceSummary: "fixture",
    transformationNotes: [],
    palette: {
      primary: "#eeeeee",
      secondary: "#334455",
      accent: "#cc3322",
      frame: "#222222",
      optic: "#55ddff",
    },
    segments: [...head, torso()],
  };
}

describe("reconstruction plan assessment", () => {
  it("matches Three.js XYZ Euler geometry for multi-axis rotations", () => {
    const rotated = operation("rotated", [0.2, 1.1, -0.15], {
      size: [0.8, 0.5, 0.3],
      rotation: [0.35, -0.42, 0.28],
    });
    const euler = new THREE.Euler(...rotated.rotation, "XYZ");
    const worldPoint = new THREE.Vector3(0.2, -0.1, 0.08)
      .applyEuler(euler)
      .add(new THREE.Vector3(...rotated.position))
      .toArray() as [number, number, number];
    assert.equal(reconstructionOperationContains(rotated, worldPoint), true);

    const bounds = reconstructionOperationBounds(rotated);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const corner = new THREE.Vector3(
            (rotated.size[0] / 2) * sx,
            (rotated.size[1] / 2) * sy,
            (rotated.size[2] / 2) * sz,
          )
            .applyEuler(euler)
            .add(new THREE.Vector3(...rotated.position));
          assert.ok(corner.x >= bounds.min[0] - 1e-9 && corner.x <= bounds.max[0] + 1e-9);
          assert.ok(corner.y >= bounds.min[1] - 1e-9 && corner.y <= bounds.max[1] + 1e-9);
          assert.ok(corner.z >= bounds.min[2] - 1e-9 && corner.z <= bounds.max[2] + 1e-9);
        }
      }
    }
  });

  it("accepts coherent compound kits with two, three, or four head parts", () => {
    const cases = [
      [headShell(), headSensor()],
      [headShell(), headSensor(), headCrown()],
      [headShell(), headSensor(), headCrown(), headCrown("head-rear-crown")],
    ];
    for (const head of cases) {
      const result = assessReconstructionPlan(kit(head));
      assert.equal(result.ok, true, result.issues.map((issue) => issue.message).join("; "));
    }
  });

  it("rejects one or five head parts and subtraction-only segments", () => {
    const one = assessReconstructionPlan(kit([headShell()]));
    assert.equal(one.ok, false);
    assert.ok(one.issues.some((issue) => issue.code === "head-part-count"));

    const five = assessReconstructionPlan(
      kit([
        headShell(),
        headSensor(),
        headCrown(),
        headCrown("head-rear-crown"),
        headCrown("head-side-crown"),
      ]),
    );
    assert.equal(five.ok, false);

    const empty = kit();
    empty.segments.push(
      segment("empty", "Empty", "extra", [
        operation("cut", [0, 1, 0], { mode: "subtract", role: "frame" }),
      ]),
    );
    const emptyResult = assessReconstructionPlan(empty);
    assert.ok(emptyResult.issues.some((issue) => issue.code === "empty-mass"));
  });

  it("rejects disconnected repeated stacks and accepts overlapping tapered construction", () => {
    const stacked = kit();
    stacked.segments[3] = torso([
      operation("slab-a", [-0.7, 1.1, 0], { size: [0.3, 0.4, 0.4] }),
      operation("slab-b", [0, 1.1, 0], { size: [0.3, 0.4, 0.4] }),
      operation("slab-c", [0.7, 1.1, 0], { size: [0.3, 0.4, 0.4] }),
    ]);
    const stackedResult = assessReconstructionPlan(stacked);
    assert.equal(stackedResult.ok, false);
    assert.ok(stackedResult.issues.some((issue) => issue.code === "repeated-stack"));
    assert.ok(stackedResult.issues.some((issue) => issue.code === "disconnected-mass"));

    const tapered = kit();
    tapered.segments[3] = torso([
      operation("mass-a", [-0.18, 1.1, 0], { size: [0.5, 0.44, 0.42] }),
      operation("mass-b", [0, 1.1, 0.02], { size: [0.48, 0.4, 0.4] }),
      operation("mass-c", [0.18, 1.1, 0.04], { size: [0.44, 0.36, 0.38] }),
    ]);
    assert.equal(assessReconstructionPlan(tapered).ok, true);
  });

  it("measures explicit and mirrored geometry equivalently without mutation", () => {
    const source = segment(
      "arm-r",
      "Arm R",
      "armR",
      [operation("upper", [-0.55, 1.25, 0]), operation("guard", [-0.72, 1.25, 0])],
      { anchor: "shoulderR" },
    );
    const mirror = segment("arm-l", "Arm L", "armL", [], {
      anchor: "shoulderL",
      mirrorOf: "arm-r",
    });
    const input = kit();
    input.segments.push(source, mirror);
    const before = JSON.stringify(input);
    const first = assessReconstructionPlan(input);
    const second = assessReconstructionPlan(input);
    const right = first.segments.find((metrics) => metrics.id === "arm-r");
    const left = first.segments.find((metrics) => metrics.id === "arm-l");
    assert.deepEqual(left, { ...right, id: "arm-l" });
    assert.deepEqual(first, second);
    assert.equal(JSON.stringify(input), before);
  });

  it("warns about off-body cuts and rejects complete erasure", () => {
    const partial = kit();
    partial.segments[3] = torso([
      operation("body-a", [-0.14, 1.1, 0]),
      operation("body-b", [0.14, 1.1, 0]),
      operation("recess", [0, 1.1, 0], {
        mode: "subtract",
        role: "frame",
        size: [0.12, 0.12, 0.5],
      }),
      operation("off-body", [2, 2, 2], {
        mode: "subtract",
        role: "frame",
        size: [0.1, 0.1, 0.1],
      }),
    ]);
    const partialResult = assessReconstructionPlan(partial);
    assert.equal(partialResult.ok, true);
    assert.ok(partialResult.issues.some((issue) => issue.code === "ineffective-cut"));

    const erased = kit();
    erased.segments[3] = torso([
      operation("body-a", [-0.14, 1.1, 0]),
      operation("body-b", [0.14, 1.1, 0]),
      operation("erase", [0, 1.1, 0], {
        mode: "subtract",
        role: "frame",
        size: [1.2, 1.2, 1.2],
      }),
    ]);
    assert.ok(
      assessReconstructionPlan(erased).issues.some((issue) => issue.code === "erased-mass"),
    );
  });
});
