import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeReconstructedKit } from "./validation.ts";

const operation = (overrides: Record<string, unknown> = {}) => ({
  id: "core",
  mode: "add",
  shape: "box",
  role: "primary",
  size: [0.2, 0.2, 0.2],
  position: [0, 1, 0],
  rotation: [0, 0, 0],
  bevel: 0.2,
  ...overrides,
});

const segment = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  label: id,
  group: "torso",
  anchor: "torso",
  mirrorOf: "",
  operations: [operation()],
  ...overrides,
});

const kit = (segments: unknown[]) => ({
  version: 1,
  name: "Fixture",
  sourceSummary: "fixture",
  transformationNotes: [],
  palette: {
    primary: "#eeeeee",
    secondary: "#334455",
    accent: "#cc3322",
    frame: "#222222",
    optic: "#55ddff",
  },
  segments,
});

describe("reconstructed kit validation", () => {
  it("returns detached valid data and permits an intentional empty kit", () => {
    const parsed = sanitizeReconstructedKit(kit([segment("chest")]));
    assert.equal(parsed.segments[0]?.id, "chest");
    assert.notEqual(parsed.segments, kit([segment("chest")]).segments);
    assert.deepEqual(sanitizeReconstructedKit(kit([])).segments, []);
  });

  it("rejects duplicate normalized ids", () => {
    assert.throws(
      () => sanitizeReconstructedKit(kit([segment("Head Shell"), segment("head-shell")])),
      /Duplicate segment id/,
    );
  });

  it("rejects dangling and chained mirrors", () => {
    assert.throws(
      () => sanitizeReconstructedKit(kit([segment("left", { mirrorOf: "missing", operations: [] })])),
      /mirrors missing segment/,
    );
    assert.throws(
      () =>
        sanitizeReconstructedKit(
          kit([
            segment("source"),
            segment("middle", { mirrorOf: "source", operations: [] }),
            segment("end", { mirrorOf: "middle", operations: [] }),
          ]),
        ),
      /cannot mirror another mirrored segment/,
    );
  });

  it("rejects nonfinite geometry", () => {
    assert.throws(
      () =>
        sanitizeReconstructedKit(
          kit([segment("bad", { operations: [operation({ position: [0, Number.NaN, 0] })] })]),
        ),
      /finite numbers/,
    );
  });
});
