import type {
  CompoundRole,
  CompoundShape,
  ReconstructedKit,
  ReconstructedSegment,
  ShapeOperation,
} from "./types";

export const MAX_RECONSTRUCTED_SEGMENTS = 40;
// Generated micro-panels can be consolidated into one meaningful editor part.
// Keep enough internal forms for that merge while retaining a hard import bound.
export const MAX_OPERATIONS_PER_SEGMENT = 96;

const VALID_GROUPS = new Set([
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
const VALID_ANCHORS = new Set([
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
const VALID_SHAPES = new Set<CompoundShape>([
  "box",
  "sphere",
  "cylinder",
  "cone",
  "capsule",
  "wedge",
]);
const VALID_ROLES = new Set<CompoundRole>(["primary", "secondary", "accent", "frame", "optic"]);

const PALETTE_FALLBACK = {
  primary: "#d8d9d4",
  secondary: "#33455f",
  accent: "#bd3a32",
  frame: "#292d33",
  optic: "#71d8ff",
} as const;

export class ReconstructionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReconstructionValidationError";
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ReconstructionValidationError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function cleanId(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new ReconstructionValidationError(`${label} must be a string.`);
  }
  const id = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!id) throw new ReconstructionValidationError(`${label} must not be empty.`);
  return id;
}

function cleanText(value: unknown, fallback: string, max: number): string {
  return (typeof value === "string" && value.trim() ? value.trim() : fallback).slice(0, max);
}

function cleanColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : fallback;
}

function boundedTriple(
  value: unknown,
  label: string,
  lo: number,
  hi: number,
): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new ReconstructionValidationError(`${label} must contain exactly three numbers.`);
  }
  return value.map((item) => {
    if (typeof item !== "number" || !Number.isFinite(item)) {
      throw new ReconstructionValidationError(`${label} must contain only finite numbers.`);
    }
    return Math.max(lo, Math.min(hi, item));
  }) as [number, number, number];
}

function sanitizeOperation(value: unknown, segmentId: string, index: number): ShapeOperation {
  const raw = record(value, `Operation ${index + 1} in segment "${segmentId}"`);
  const id = cleanId(raw.id, `Operation ${index + 1} id in segment "${segmentId}"`);
  if (raw.mode !== "add" && raw.mode !== "subtract") {
    throw new ReconstructionValidationError(`Operation "${id}" has an invalid mode.`);
  }
  if (!VALID_SHAPES.has(raw.shape as CompoundShape)) {
    throw new ReconstructionValidationError(`Operation "${id}" has an invalid shape.`);
  }
  if (!VALID_ROLES.has(raw.role as CompoundRole)) {
    throw new ReconstructionValidationError(`Operation "${id}" has an invalid role.`);
  }
  if (typeof raw.bevel !== "number" || !Number.isFinite(raw.bevel)) {
    throw new ReconstructionValidationError(`Operation "${id}" has an invalid bevel.`);
  }
  return {
    id,
    mode: raw.mode,
    shape: raw.shape as CompoundShape,
    role: raw.role as CompoundRole,
    size: boundedTriple(raw.size, `Operation "${id}" size`, 0.008, 1.2),
    position: boundedTriple(raw.position, `Operation "${id}" position`, -2.4, 2.4),
    rotation: boundedTriple(raw.rotation, `Operation "${id}" rotation`, -Math.PI, Math.PI),
    bevel: Math.max(0, Math.min(1, raw.bevel)),
  };
}

function sanitizeSegment(value: unknown, index: number): ReconstructedSegment {
  const raw = record(value, `Segment ${index + 1}`);
  const id = cleanId(raw.id, `Segment ${index + 1} id`);
  if (!VALID_GROUPS.has(String(raw.group))) {
    throw new ReconstructionValidationError(`Segment "${id}" has an invalid group.`);
  }
  if (!VALID_ANCHORS.has(String(raw.anchor))) {
    throw new ReconstructionValidationError(`Segment "${id}" has an invalid anchor.`);
  }
  if (!Array.isArray(raw.operations)) {
    throw new ReconstructionValidationError(`Segment "${id}" operations must be an array.`);
  }
  if (raw.operations.length > MAX_OPERATIONS_PER_SEGMENT) {
    throw new ReconstructionValidationError(
      `Segment "${id}" exceeds the ${MAX_OPERATIONS_PER_SEGMENT}-operation limit.`,
    );
  }
  const operations = raw.operations.map((operation, operationIndex) =>
    sanitizeOperation(operation, id, operationIndex),
  );
  const operationIds = new Set<string>();
  for (const operation of operations) {
    if (operationIds.has(operation.id)) {
      throw new ReconstructionValidationError(
        `Segment "${id}" contains duplicate operation id "${operation.id}".`,
      );
    }
    operationIds.add(operation.id);
  }
  const mirrorOf = raw.mirrorOf === "" ? "" : cleanId(raw.mirrorOf, `Segment "${id}" mirrorOf`);
  return {
    id,
    label: cleanText(raw.label, id, 64),
    group: raw.group as ReconstructedSegment["group"],
    anchor: raw.anchor as ReconstructedSegment["anchor"],
    mirrorOf,
    operations,
  };
}

function validateMirrors(segments: ReconstructedSegment[]) {
  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  for (const segment of segments) {
    if (!segment.mirrorOf) continue;
    if (segment.mirrorOf === segment.id) {
      throw new ReconstructionValidationError(`Segment "${segment.id}" cannot mirror itself.`);
    }
    const source = byId.get(segment.mirrorOf);
    if (!source) {
      throw new ReconstructionValidationError(
        `Segment "${segment.id}" mirrors missing segment "${segment.mirrorOf}".`,
      );
    }
    if (source.mirrorOf) {
      throw new ReconstructionValidationError(
        `Segment "${segment.id}" cannot mirror another mirrored segment.`,
      );
    }
  }
}

export type SanitizeReconstructedKitOptions = {
  allowVersionOmitted?: boolean;
  minimumSegments?: number;
};

/**
 * Parse an untrusted v1 reconstruction into a detached, bounded value.
 * Structural and reference errors are rejected; numeric geometry is clamped
 * to the renderer's supported domain.
 */
export function sanitizeReconstructedKit(
  value: unknown,
  options: SanitizeReconstructedKitOptions = {},
): ReconstructedKit {
  const raw = record(value, "Reconstructed kit");
  if (raw.version !== 1 && !(options.allowVersionOmitted && raw.version == null)) {
    throw new ReconstructionValidationError("Only reconstructed kit version 1 is supported.");
  }
  if (!Array.isArray(raw.segments)) {
    throw new ReconstructionValidationError("Reconstructed kit segments must be an array.");
  }
  if (raw.segments.length > MAX_RECONSTRUCTED_SEGMENTS) {
    throw new ReconstructionValidationError(
      `Reconstructed kits are limited to ${MAX_RECONSTRUCTED_SEGMENTS} segments.`,
    );
  }
  const minimumSegments = options.minimumSegments ?? 0;
  if (raw.segments.length < minimumSegments) {
    throw new ReconstructionValidationError(
      `The image did not yield enough editable mechanical regions (minimum ${minimumSegments}).`,
    );
  }
  const segments = raw.segments.map(sanitizeSegment);
  const segmentIds = new Set<string>();
  for (const segment of segments) {
    if (segmentIds.has(segment.id)) {
      throw new ReconstructionValidationError(`Duplicate segment id "${segment.id}".`);
    }
    segmentIds.add(segment.id);
  }
  validateMirrors(segments);

  const palette = record(raw.palette, "Reconstructed kit palette");
  return {
    version: 1,
    name: cleanText(raw.name, "MOSA RECONSTRUCTION", 72),
    sourceSummary: cleanText(raw.sourceSummary, "Single-view mechanical reconstruction", 320),
    transformationNotes: Array.isArray(raw.transformationNotes)
      ? raw.transformationNotes.slice(0, 8).map((note) => String(note).slice(0, 180))
      : [],
    palette: {
      primary: cleanColor(palette.primary, PALETTE_FALLBACK.primary),
      secondary: cleanColor(palette.secondary, PALETTE_FALLBACK.secondary),
      accent: cleanColor(palette.accent, PALETTE_FALLBACK.accent),
      frame: cleanColor(palette.frame, PALETTE_FALLBACK.frame),
      optic: cleanColor(palette.optic, PALETTE_FALLBACK.optic),
    },
    segments,
  };
}
