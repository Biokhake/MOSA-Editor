import type { ReconstructedSegment, ShapeOperation } from "./types";
import { MAX_OPERATIONS_PER_SEGMENT, ReconstructionValidationError } from "./validation.ts";

const HEAD_BUCKETS = {
  shell: {
    id: "head-shell",
    label: "Head Shell",
  },
  sensor: {
    id: "head-sensor",
    label: "Face / Sensor",
  },
  crown: {
    id: "head-crown",
    label: "Crown / Antenna",
  },
} as const;

type HeadBucket = keyof typeof HEAD_BUCKETS;

const CROWN_WORDS = /crest|crown|antenna|aerial|fin|horn|mast|plume/i;
const SENSOR_WORDS = /face|sensor|optic|eye|visor|camera|lens|brow|nose|mouth/i;

function headBucket(segment: ReconstructedSegment): HeadBucket {
  const name = `${segment.id} ${segment.label}`;
  if (CROWN_WORDS.test(name)) return "crown";
  if (SENSOR_WORDS.test(name) || segment.operations.some((op) => op.role === "optic")) {
    return "sensor";
  }
  return "shell";
}

export function reflectedOperation(op: ShapeOperation): ShapeOperation {
  return {
    ...op,
    position: [-op.position[0], op.position[1], op.position[2]],
    rotation: [op.rotation[0], -op.rotation[1], -op.rotation[2]],
  };
}

/**
 * Small facial plates remain geometric operations inside a compound head mass.
 * They are not useful editor-level parts, so generated heads are normalized to
 * at most three meaningful controls: shell, sensor module, and crown hardware.
 */
export function consolidateGeneratedHead(segments: ReconstructedSegment[]) {
  const head = segments.filter((segment) => segment.group === "head");
  if (!head.length) return segments;

  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  const buckets = new Map<HeadBucket, ShapeOperation[]>();
  for (const segment of head) {
    const bucket = headBucket(segment);
    const source = segment.mirrorOf ? byId.get(segment.mirrorOf) : undefined;
    const sourceOperations = source?.operations.length ? source.operations : segment.operations;
    const operations = segment.mirrorOf
      ? sourceOperations.map(reflectedOperation)
      : sourceOperations;
    const existing = buckets.get(bucket) ?? [];
    for (const operation of operations) {
      existing.push({
        ...operation,
        id: `${segment.id}-${operation.id}`.slice(0, 64),
      });
    }
    buckets.set(bucket, existing);
  }

  const consolidated = (Object.keys(HEAD_BUCKETS) as HeadBucket[]).flatMap((bucket) => {
    const operations = buckets.get(bucket) ?? [];
    if (!operations.length) return [];
    const descriptor = HEAD_BUCKETS[bucket];
    if (operations.length > MAX_OPERATIONS_PER_SEGMENT) {
      throw new ReconstructionValidationError(
        `${descriptor.label} exceeds the ${MAX_OPERATIONS_PER_SEGMENT}-operation consolidation limit.`,
      );
    }
    return [
      {
        id: descriptor.id,
        label: descriptor.label,
        group: "head" as const,
        anchor: "neck" as const,
        mirrorOf: "",
        operations,
      },
    ];
  });

  const removedIds = new Set(head.map((segment) => segment.id));
  const rest = segments
    .filter((segment) => segment.group !== "head")
    .map((segment) => (removedIds.has(segment.mirrorOf) ? { ...segment, mirrorOf: "" } : segment));
  return [...consolidated, ...rest];
}
