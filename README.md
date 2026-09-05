# MOSA Editor

MOSA Editor converts a single robot or mecha thumbnail into an original, editable 3D kit.
The editor and articulated rig survive from the original MOSA project, while the new reconstruction path treats segmentation as an output of the design rather than a fixed input checklist.

## Reconstruction pipeline

1. A user selects one PNG or JPEG thumbnail.
2. Server-side vision analysis describes the whole silhouette, mass rhythm, palette and inferred depth.
3. The analysis emits a dynamic list of editable regions bound to the retained MOSA rig.
4. Every region contains overlapping additive and subtractive solids.
5. `three-bvh-csg` unions those solids into compound masses and cuts recesses, vents and openings.
6. The resulting regions appear in the existing Parts and Details panels and support transform, color, visibility, symmetry, posing, explode, save and export controls.

The thumbnail itself is not persisted. Only the compact reconstruction plan and editor state are saved locally.

## Design contract

- Whole-form interpretation comes before segmentation.
- Segments are dynamic per source image and may be added or omitted.
- The skeleton defines articulation and attachment coordinates, not the exterior silhouette.
- Large masses must be compound forms; isolated primitive stacks are rejected by the reconstruction prompt.
- The generated kit must change signature contours, sensors, panel rhythm and mass distribution and must not reproduce logos or franchise marks.

## Development

```bash
npm ci
npm run typecheck
npm run build
sh startup.sh
```

Runtime image analysis requires the server-only `XAI_API_KEY`. The request is made only after the user chooses an image and presses the thumbnail import control; the key is never exposed to the browser.

## Branches

- `main`: preserved MOSA import baseline.
- `engine/thumbnail-kit-v2`: new single-thumbnail reconstruction engine.
