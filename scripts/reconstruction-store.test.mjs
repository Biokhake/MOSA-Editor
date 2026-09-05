import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createServer } from "vite";

let vite;
let useStudio;

const op = {
  id: "mass",
  mode: "add",
  shape: "wedge",
  role: "primary",
  size: [0.2, 0.2, 0.2],
  position: [-0.2, 1.5, 0.1],
  rotation: [0.1, 0.2, 0.3],
  bevel: 0.1,
};

const source = {
  id: "helm",
  label: "Shell",
  group: "head",
  anchor: "neck",
  mirrorOf: "",
  operations: [op],
};

const mirror = {
  id: "head-side-l",
  label: "Head Side L",
  group: "head",
  anchor: "neck",
  mirrorOf: "helm",
  operations: [],
};

const kit = {
  version: 1,
  name: "Lifecycle fixture",
  sourceSummary: "fixture",
  transformationNotes: [],
  palette: {
    primary: "#eeeeee",
    secondary: "#334455",
    accent: "#cc3322",
    frame: "#222222",
    optic: "#55ddff",
  },
  segments: [source, mirror],
};

before(async () => {
  vite = await createServer({
    root: process.cwd(),
    configFile: false,
    appType: "custom",
    server: { middlewareMode: true },
  });
  ({ useStudio } = await vite.ssrLoadModule("/src/lib/mech/store.ts"));
});

after(async () => {
  await vite?.close();
});

describe("reconstructed segment lifecycle", () => {
  it("duplicates a mirrored segment as an independent reflected part", () => {
    useStudio.getState().loadReconstructedKit(kit);
    assert.equal(useStudio.getState().duplicateReconstructedSegment("head-side-l"), true);
    const state = useStudio.getState();
    const copy = state.reconstructedKit.segments.find((part) => part.id === state.selected);
    assert.equal(copy.mirrorOf, "");
    assert.equal(copy.operations[0].position[0], 0.2);
    assert.equal(state.slots[copy.id].px, 0.04);
  });

  it("materializes a mirror before deleting its source", () => {
    useStudio.getState().loadReconstructedKit(kit);
    assert.equal(useStudio.getState().removeReconstructedSegment("helm"), true);
    const remaining = useStudio.getState().reconstructedKit.segments[0];
    assert.equal(remaining.id, "head-side-l");
    assert.equal(remaining.mirrorOf, "");
    assert.equal(remaining.operations[0].position[0], 0.2);
  });

  it("allows deleting the final reconstructed segment", () => {
    const single = { ...kit, segments: [source] };
    useStudio.getState().loadReconstructedKit(single);
    assert.equal(useStudio.getState().removeReconstructedSegment("helm"), true);
    const state = useStudio.getState();
    assert.deepEqual(state.reconstructedKit.segments, []);
    assert.equal(state.selected, "");
  });

  it("does not apply legacy head scaling to a colliding reconstructed id", () => {
    useStudio.getState().loadReconstructedKit({ ...kit, segments: [source] });
    useStudio.getState().resetTransforms();
    const slot = useStudio.getState().slots.helm;
    assert.deepEqual([slot.sx, slot.sy, slot.sz], [1, 1, 1]);
  });

  it("adds a starter at the selected group's rig anchor", () => {
    useStudio.getState().loadReconstructedKit({ ...kit, segments: [] });
    useStudio.getState().setGroupFilter("head");
    assert.equal(useStudio.getState().addReconstructedSegment(), true);
    const added = useStudio.getState().reconstructedKit.segments[0];
    assert.equal(added.anchor, "neck");
    assert.ok(added.operations[0].position[1] > 1, "head starter should appear at head height");
  });

  it("uses one canonical id for limb starters and their slot state", () => {
    useStudio.getState().loadReconstructedKit({ ...kit, segments: [] });
    useStudio.getState().setGroupFilter("armL");
    assert.equal(useStudio.getState().addReconstructedSegment(), true);
    let state = useStudio.getState();
    assert.equal(state.selected, "starter-arml");
    assert.ok(state.slots[state.selected]);
    assert.equal(useStudio.getState().addReconstructedSegment(), true);
    state = useStudio.getState();
    assert.equal(state.selected, "starter-arml-2");
    assert.ok(state.slots[state.selected]);
  });
});
