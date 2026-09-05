import { createServerFn } from "@tanstack/react-start";
import type { CompoundRole, CompoundShape } from "./types";
import { consolidateGeneratedHead } from "./segmentPolicy";
import { sanitizeReconstructedKit } from "./validation";
import { assessReconstructionPlan } from "./assessment";

const MODEL = "grok-4.6";
const MAX_DATA_URL = 12_000_000;
const GROUPS = new Set([
  "head",
  "torso",
  "waist",
  "armR",
  "armL",
  "legR",
  "legL",
  "back",
  "weapon",
  "extra",
]);
const ANCHORS = new Set([
  "root",
  "torso",
  "neck",
  "shoulderR",
  "elbowR",
  "wristR",
  "shoulderL",
  "elbowL",
  "wristL",
  "hipR",
  "kneeR",
  "ankleR",
  "hipL",
  "kneeL",
  "ankleL",
]);
const SHAPES = new Set<CompoundShape>(["box", "sphere", "cylinder", "cone", "capsule", "wedge"]);
const ROLES = new Set<CompoundRole>(["primary", "secondary", "accent", "frame", "optic"]);

const KIT_SCHEMA = {
  name: "mosa_reconstructed_kit",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["name", "sourceSummary", "transformationNotes", "palette", "segments"],
    properties: {
      name: { type: "string" },
      sourceSummary: { type: "string" },
      transformationNotes: { type: "array", items: { type: "string" } },
      palette: {
        type: "object",
        additionalProperties: false,
        required: ["primary", "secondary", "accent", "frame", "optic"],
        properties: {
          primary: { type: "string" },
          secondary: { type: "string" },
          accent: { type: "string" },
          frame: { type: "string" },
          optic: { type: "string" },
        },
      },
      segments: {
        type: "array",
        minItems: 5,
        maxItems: 40,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "label", "group", "anchor", "mirrorOf", "operations"],
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            group: { type: "string", enum: [...GROUPS] },
            anchor: { type: "string", enum: [...ANCHORS] },
            mirrorOf: { type: "string" },
            operations: {
              type: "array",
              maxItems: 14,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "mode", "shape", "role", "size", "position", "rotation", "bevel"],
                properties: {
                  id: { type: "string" },
                  mode: { type: "string", enum: ["add", "subtract"] },
                  shape: { type: "string", enum: [...SHAPES] },
                  role: { type: "string", enum: [...ROLES] },
                  size: { type: "array", minItems: 3, maxItems: 3, items: { type: "number" } },
                  position: { type: "array", minItems: 3, maxItems: 3, items: { type: "number" } },
                  rotation: { type: "array", minItems: 3, maxItems: 3, items: { type: "number" } },
                  bevel: { type: "number" },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `You are MOSA's single-view mechanical reconstruction planner. Convert one robot/mecha thumbnail into an editable 3D construction plan made from OVERLAPPING compound solids, not isolated boxes laid side by side.

Coordinate system: metres, +Y up, +X is the robot's left (image right in a frontal view), +Z forward. Feet touch Y=0 and a normal humanoid unit is about 1.8m tall. All operation positions are WHOLE-BODY coordinates. Rotations are radians XYZ.

Design the whole silhouette first, then segment it for editing. Use 12-24 meaningful segments; the segment list is dynamic and should follow the visible design rather than a fixed Gundam parts checklist. Segment by masses a user would move, swap, hide, or recolor. Do not turn surface details into editor parts.

The head must use only 2-4 editor segments: a compound head shell, a face/sensor module, and optional crown/antenna or rear equipment. Eyes, brows, cheeks, nose, mouth, jaw plates, vents, and panel lines are ADD/SUBTRACT operations inside those segments, never separate segments. Apply the same principle elsewhere: keep armour masses, articulated limbs, joints, and equipment meaningful rather than splitting every plate.

Each substantial segment should normally contain 3-10 overlapping ADD solids. Make adjacent ADD solids overlap enough to union into a continuous designed mass. Use SUBTRACT solids for face recesses, vents, waist gaps, armour openings and silhouette cuts. Avoid plain cans, stacks, repeated bars and decorative dots.

Bind every segment to the nearest rig anchor. Right is the robot's right (negative X); Left is positive X. A mirrored segment may set mirrorOf to the source segment id and leave operations empty. Otherwise mirrorOf is an empty string.

Preserve the source's broad mechanical lineage and recognizable mass rhythm, but create an original MOSA interpretation: change the signature head/crest, sensor arrangement, major contour ratios, panel rhythm, and at least one major mass distribution. Never reproduce logos, lettering or franchise marks. Explain those changes in transformationNotes.

The result must be physically coherent, balanced in neutral pose, and readable from the source view as well as a 3/4 orbit view.`;

export const analyzeThumbnail = createServerFn({ method: "POST" })
  .validator((input: { imageDataUrl: string; fileName: string }) => {
    if (!input || typeof input.imageDataUrl !== "string" || typeof input.fileName !== "string") {
      throw new Error("A thumbnail image and file name are required.");
    }
    return { imageDataUrl: input.imageDataUrl, fileName: input.fileName.slice(0, 180) };
  })
  .handler(async ({ data }) => {
    if (!/^data:image\/(png|jpeg);base64,/i.test(data.imageDataUrl)) {
      return { ok: false as const, error: "Use a PNG or JPEG thumbnail." };
    }
    if (data.imageDataUrl.length > MAX_DATA_URL) {
      return { ok: false as const, error: "The thumbnail is too large. Use an image under 8 MB." };
    }
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey)
      return {
        ok: false as const,
        error: "Image reconstruction is unavailable in this environment.",
      };

    let response: Response;
    try {
      response = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(90_000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: MODEL,
          store: false,
          temperature: 0.25,
          max_tokens: 14000,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: data.imageDataUrl, detail: "high" } },
                {
                  type: "text",
                  text: `Reconstruct this thumbnail (${data.fileName}) as a new editable MOSA kit.`,
                },
              ],
            },
          ],
          response_format: { type: "json_schema", json_schema: KIT_SCHEMA },
        }),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      return {
        ok: false as const,
        error: timedOut
          ? "Image analysis timed out. Please try the thumbnail again."
          : "Image analysis could not reach the reconstruction service.",
      };
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 240);
      return { ok: false as const, error: `Image analysis failed (${response.status}). ${detail}` };
    }
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return { ok: false as const, error: "Image analysis returned an empty result." };
    try {
      const sanitized = sanitizeReconstructedKit(JSON.parse(content), {
        allowVersionOmitted: true,
        minimumSegments: 5,
      });
      const kit = sanitizeReconstructedKit(
        { ...sanitized, segments: consolidateGeneratedHead(sanitized.segments) },
        { minimumSegments: 5 },
      );
      const assessment = assessReconstructionPlan(kit);
      if (!assessment.ok) {
        const reason = assessment.issues.find((issue) => issue.severity === "error");
        return {
          ok: false as const,
          error: `The generated shape needs another design pass. ${reason?.message ?? "The compound-form quality gate failed."}`,
          diagnostics: assessment,
        };
      }
      return { ok: true as const, kit, diagnostics: assessment };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Invalid reconstruction data.",
      };
    }
  });
