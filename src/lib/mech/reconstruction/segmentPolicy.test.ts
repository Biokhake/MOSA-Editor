import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReconstructedSegment, ShapeOperation } from "./types.ts";
import { consolidateGeneratedHead } from "./segmentPolicy.ts";

const shape = (id: string, role: ShapeOperation["role"] = "primary"): ShapeOperation => ({
  id,
  mode: "add",
  shape: "box",
  role,
  size: [0.1, 0.1, 0.1],
  position: [-0.1, 1.7, 0],
  rotation: [0.1, 0.2, 0.3],
  bevel: 0.2,
});

const segment = (
  id: string,
  label: string,
  operations: ShapeOperation[],
  mirrorOf = "",
): ReconstructedSegment => ({
  id,
  label,
  group: "head",
  anchor: "neck",
  mirrorOf,
  operations,
});

describe("generated segment policy", () => {
  it("turns micro head slots into three compound editing parts", () => {
    const input = [
      segment("helm", "Helm", [shape("shell")]),
      segment("jaw", "Jaw", [shape("jaw")]),
      segment("eye-r", "Eye R", [shape("eye", "optic")]),
      segment("eye-l", "Eye L", [], "eye-r"),
      segment("crest", "Crest", [shape("fin", "accent")]),
    ];
    const output = consolidateGeneratedHead(input);
    assert.deepEqual(
      output.map((part) => part.id),
      ["head-shell", "head-sensor", "head-crown"],
    );
    assert.equal(output[1]?.operations.length, 2, "mirrored optics belong to one sensor part");
    assert.equal(output[1]?.operations[1]?.position[0], 0.1);
    assert.ok(output.every((part) => part.mirrorOf === "" && part.anchor === "neck"));
  });

  it("leaves non-head segments intact", () => {
    const torso = { ...segment("chest", "Chest", [shape("core")]), group: "torso" as const };
    const output = consolidateGeneratedHead([torso]);
    assert.equal(output[0], torso);
  });

  it("preserves more than 24 internal forms when consolidating a head", () => {
    const input = Array.from({ length: 30 }, (_, index) =>
      segment(`plate-${index}`, `Plate ${index}`, [shape(`mass-${index}`)]),
    );
    const output = consolidateGeneratedHead(input);
    assert.equal(output.length, 1);
    assert.equal(output[0]?.operations.length, 30);
  });
});
