import type { ReconstructedKit, ReconstructedSegment, ShapeOperation } from "./types";

export type ReconstructionIssueSeverity = "error" | "warning";

export type ReconstructionIssue = {
  code:
    | "head-part-count"
    | "part-count"
    | "empty-mass"
    | "erased-mass"
    | "ineffective-cut"
    | "compound-coverage"
    | "disconnected-mass"
    | "repeated-stack";
  severity: ReconstructionIssueSeverity;
  message: string;
  segmentId?: string;
};

export type ReconstructionSegmentMetrics = {
  id: string;
  addCount: number;
  contributingAdds: number;
  rawSamples: number;
  occupiedSamples: number;
  largestComponentShare: number;
  ineffectiveCuts: string[];
};

export type ReconstructionAssessment = {
  ok: boolean;
  issues: ReconstructionIssue[];
  metrics: {
    totalParts: number;
    headParts: number;
    compoundCoverage: number;
  };
  segments: ReconstructionSegmentMetrics[];
};

type Vec3 = [number, number, number];
type Bounds = { min: Vec3; max: Vec3 };

const SAMPLE_LONG_AXIS = 16;
const SAMPLE_SHORT_AXIS = 6;

function rotateX([x, y, z]: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x, y * c - z * s, y * s + z * c];
}

function rotateY([x, y, z]: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c + z * s, y, -x * s + z * c];
}

function rotateZ([x, y, z]: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c - y * s, x * s + y * c, z];
}

function toLocal(point: Vec3, operation: ShapeOperation): Vec3 {
  let local: Vec3 = [
    point[0] - operation.position[0],
    point[1] - operation.position[1],
    point[2] - operation.position[2],
  ];
  local = rotateX(local, -operation.rotation[0]);
  local = rotateY(local, -operation.rotation[1]);
  return rotateZ(local, -operation.rotation[2]);
}

/** @internal Exported for renderer-parity tests. */
export function reconstructionOperationContains(operation: ShapeOperation, point: Vec3): boolean {
  const [x, y, z] = toLocal(point, operation);
  const [width, height, depth] = operation.size;
  const hx = width / 2;
  const hy = height / 2;
  const hz = depth / 2;
  const epsilon = 1e-7;

  switch (operation.shape) {
    case "sphere":
      return (x / hx) ** 2 + (y / hy) ** 2 + (z / hz) ** 2 <= 1 + epsilon;
    case "cylinder":
      return Math.abs(y) <= hy + epsilon && (x / hx) ** 2 + (z / hz) ** 2 <= 1 + epsilon;
    case "cone": {
      if (Math.abs(y) > hy + epsilon) return false;
      const radius = Math.max(0, (hy - y) / height);
      return (x / hx) ** 2 + (z / hz) ** 2 <= radius ** 2 + epsilon;
    }
    case "capsule": {
      const minimum = Math.min(width, depth);
      const radius = minimum / 2;
      const cylinderLength = Math.max(0.001, height - minimum);
      const scaledX = (x * minimum) / width;
      const scaledZ = (z * minimum) / depth;
      const capY = Math.max(0, Math.abs(y) - cylinderLength / 2);
      return scaledX ** 2 + scaledZ ** 2 + capY ** 2 <= radius ** 2 + epsilon;
    }
    case "wedge":
      return (
        Math.abs(x) <= hx + epsilon &&
        y >= -hy - epsilon &&
        y <= (-height * z) / depth + epsilon &&
        Math.abs(z) <= hz + epsilon
      );
    case "box":
    default:
      return (
        Math.abs(x) <= hx + epsilon && Math.abs(y) <= hy + epsilon && Math.abs(z) <= hz + epsilon
      );
  }
}

/** @internal Exported for renderer-parity tests. */
export function reconstructionOperationBounds(operation: ShapeOperation): Bounds {
  const half = operation.size.map((value) => value / 2) as Vec3;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        let corner: Vec3 = [half[0] * sx, half[1] * sy, half[2] * sz];
        corner = rotateZ(corner, operation.rotation[2]);
        corner = rotateY(corner, operation.rotation[1]);
        corner = rotateX(corner, operation.rotation[0]);
        for (let axis = 0; axis < 3; axis++) {
          const value = corner[axis]! + operation.position[axis]!;
          min[axis] = Math.min(min[axis], value);
          max[axis] = Math.max(max[axis], value);
        }
      }
    }
  }
  return { min, max };
}

function combinedBounds(operations: ShapeOperation[]): Bounds | null {
  if (!operations.length) return null;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const operation of operations) {
    const bounds = reconstructionOperationBounds(operation);
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], bounds.min[axis]!);
      max[axis] = Math.max(max[axis], bounds.max[axis]!);
    }
  }
  return { min, max };
}

function reflected(operation: ShapeOperation): ShapeOperation {
  return {
    ...operation,
    position: [-operation.position[0], operation.position[1], operation.position[2]],
    rotation: [operation.rotation[0], -operation.rotation[1], -operation.rotation[2]],
  };
}

function resolvedOperations(
  segment: ReconstructedSegment,
  byId: Map<string, ReconstructedSegment>,
) {
  if (!segment.mirrorOf) return segment.operations;
  return (byId.get(segment.mirrorOf)?.operations ?? []).map(reflected);
}

function componentShare(occupied: Uint8Array, nx: number, ny: number, nz: number) {
  let total = 0;
  for (const value of occupied) total += value;
  if (!total) return 0;
  const seen = new Uint8Array(occupied.length);
  let largest = 0;
  const strideY = nz;
  const strideX = ny * nz;
  for (let start = 0; start < occupied.length; start++) {
    if (!occupied[start] || seen[start]) continue;
    let size = 0;
    const queue = [start];
    seen[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor]!;
      size++;
      const x = Math.floor(index / strideX);
      const remainder = index - x * strideX;
      const y = Math.floor(remainder / strideY);
      const z = remainder - y * strideY;
      const neighbors = [
        x > 0 ? index - strideX : -1,
        x + 1 < nx ? index + strideX : -1,
        y > 0 ? index - strideY : -1,
        y + 1 < ny ? index + strideY : -1,
        z > 0 ? index - 1 : -1,
        z + 1 < nz ? index + 1 : -1,
      ];
      for (const next of neighbors) {
        if (next >= 0 && occupied[next] && !seen[next]) {
          seen[next] = 1;
          queue.push(next);
        }
      }
    }
    largest = Math.max(largest, size);
  }
  return largest / total;
}

function sampleSegment(id: string, operations: ShapeOperation[]): ReconstructionSegmentMetrics {
  const additions = operations.filter((operation) => operation.mode === "add");
  const cuts = operations.filter((operation) => operation.mode === "subtract");
  const bounds = combinedBounds(additions);
  if (!bounds) {
    return {
      id,
      addCount: 0,
      contributingAdds: 0,
      rawSamples: 0,
      occupiedSamples: 0,
      largestComponentShare: 0,
      ineffectiveCuts: cuts.map((cut) => cut.id),
    };
  }

  const dimensions = bounds.max.map((value, axis) => value - bounds.min[axis]!) as Vec3;
  const longest = Math.max(...dimensions, 1e-4);
  const counts = dimensions.map((dimension) =>
    Math.max(
      SAMPLE_SHORT_AXIS,
      Math.min(SAMPLE_LONG_AXIS, Math.ceil((dimension / longest) * SAMPLE_LONG_AXIS)),
    ),
  ) as Vec3;
  const [nx, ny, nz] = counts;
  const occupied = new Uint8Array(nx * ny * nz);
  const uniqueContribution = new Uint32Array(additions.length);
  const cutHits = new Uint32Array(cuts.length);
  let rawSamples = 0;
  let occupiedSamples = 0;

  for (let x = 0; x < nx; x++) {
    for (let y = 0; y < ny; y++) {
      for (let z = 0; z < nz; z++) {
        const point: Vec3 = [
          bounds.min[0] + ((x + 0.5) / nx) * dimensions[0],
          bounds.min[1] + ((y + 0.5) / ny) * dimensions[1],
          bounds.min[2] + ((z + 0.5) / nz) * dimensions[2],
        ];
        const containingAdds: number[] = [];
        for (let index = 0; index < additions.length; index++) {
          if (reconstructionOperationContains(additions[index]!, point)) {
            containingAdds.push(index);
          }
        }
        if (!containingAdds.length) continue;
        rawSamples++;
        let removed = false;
        for (let index = 0; index < cuts.length; index++) {
          if (reconstructionOperationContains(cuts[index]!, point)) {
            cutHits[index]++;
            removed = true;
          }
        }
        if (removed) continue;
        occupied[x * ny * nz + y * nz + z] = 1;
        occupiedSamples++;
        if (containingAdds.length === 1) uniqueContribution[containingAdds[0]!]++;
      }
    }
  }

  return {
    id,
    addCount: additions.length,
    contributingAdds: uniqueContribution.reduce(
      (count, samples) => count + (samples > 0 ? 1 : 0),
      0,
    ),
    rawSamples,
    occupiedSamples,
    largestComponentShare: componentShare(occupied, nx, ny, nz),
    ineffectiveCuts: cuts.filter((_, index) => cutHits[index] === 0).map((cut) => cut.id),
  };
}

function similarSizes(a: ShapeOperation, b: ShapeOperation) {
  return a.size.every((value, axis) => {
    const other = b.size[axis]!;
    return Math.max(value, other) / Math.max(0.0001, Math.min(value, other)) <= 1.35;
  });
}

function similarRotations(a: ShapeOperation, b: ShapeOperation) {
  return a.rotation.every((value, axis) => Math.abs(value - b.rotation[axis]!) <= 0.2);
}

function hasRepeatedStack(operations: ShapeOperation[]) {
  const additions = operations.filter((operation) => operation.mode === "add");
  for (const shape of new Set(additions.map((operation) => operation.shape))) {
    const peers = additions.filter((operation) => operation.shape === shape);
    if (peers.length < 3) continue;
    const ranges = [0, 1, 2].map((axis) => {
      const values = peers.map((operation) => operation.position[axis]!);
      return Math.max(...values) - Math.min(...values);
    });
    const axis = ranges.indexOf(Math.max(...ranges));
    const sorted = [...peers].sort((a, b) => a.position[axis]! - b.position[axis]!);
    for (let index = 0; index <= sorted.length - 3; index++) {
      const trio = sorted.slice(index, index + 3);
      const [a, b, c] = trio as [ShapeOperation, ShapeOperation, ShapeOperation];
      if (!similarSizes(a, b) || !similarSizes(b, c)) continue;
      if (!similarRotations(a, b) || !similarRotations(b, c)) continue;
      const gapA = b.position[axis]! - a.position[axis]!;
      const gapB = c.position[axis]! - b.position[axis]!;
      const averageSize = (a.size[axis]! + b.size[axis]! + c.size[axis]!) / 3;
      if (
        gapA > averageSize * 0.65 &&
        gapB > averageSize * 0.65 &&
        Math.max(gapA, gapB) / Math.max(1e-4, Math.min(gapA, gapB)) <= 1.35
      ) {
        return true;
      }
    }
  }
  return false;
}

function detailLike(segment: ReconstructedSegment, operations: ShapeOperation[]) {
  const name = `${segment.id} ${segment.label}`;
  return (
    /sensor|optic|eye|visor|camera|lens|crown|antenna|aerial|fin|horn|joint|elbow|knee|wrist|ankle/i.test(
      name,
    ) ||
    operations.every((operation) => operation.mode === "subtract" || operation.role === "optic")
  );
}

function substantial(segment: ReconstructedSegment, operations: ShapeOperation[]) {
  if (detailLike(segment, operations)) return false;
  return operations.some(
    (operation) =>
      operation.mode === "add" &&
      (operation.role === "primary" ||
        operation.role === "secondary" ||
        operation.role === "frame"),
  );
}

export function assessReconstructionPlan(kit: ReconstructedKit): ReconstructionAssessment {
  const issues: ReconstructionIssue[] = [];
  const byId = new Map(kit.segments.map((segment) => [segment.id, segment]));
  const headParts = kit.segments.filter((segment) => segment.group === "head").length;
  if (headParts < 2 || headParts > 4) {
    issues.push({
      code: "head-part-count",
      severity: "error",
      message: `Head must contain 2–4 meaningful editor parts; generated ${headParts}.`,
    });
  }
  if (kit.segments.length < 12 || kit.segments.length > 24) {
    issues.push({
      code: "part-count",
      severity: "warning",
      message: `The generated kit has ${kit.segments.length} editor parts; 12–24 is the target range.`,
    });
  }

  const resolved = kit.segments.map((segment) => ({
    segment,
    operations: resolvedOperations(segment, byId),
  }));
  const segments = resolved.map(({ segment, operations }) => sampleSegment(segment.id, operations));
  let substantialCount = 0;
  let compoundCount = 0;

  for (let index = 0; index < resolved.length; index++) {
    const { segment, operations } = resolved[index]!;
    const metrics = segments[index]!;
    if (!metrics.addCount) {
      issues.push({
        code: "empty-mass",
        severity: "error",
        segmentId: segment.id,
        message: `${segment.label} contains no additive mass.`,
      });
      continue;
    }
    if (metrics.rawSamples > 0 && metrics.occupiedSamples === 0) {
      issues.push({
        code: "erased-mass",
        severity: "error",
        segmentId: segment.id,
        message: `${segment.label} is completely erased by its cuts.`,
      });
    }
    for (const cutId of metrics.ineffectiveCuts) {
      issues.push({
        code: "ineffective-cut",
        severity: "warning",
        segmentId: segment.id,
        message: `${segment.label} cut “${cutId}” does not intersect its mass.`,
      });
    }
    if (segment.mirrorOf) continue;
    if (substantial(segment, operations)) {
      substantialCount++;
      if (metrics.contributingAdds >= 2) compoundCount++;
      if (metrics.largestComponentShare < 0.7 && metrics.occupiedSamples >= 12) {
        issues.push({
          code: "disconnected-mass",
          severity: "error",
          segmentId: segment.id,
          message: `${segment.label} reads as disconnected primitive islands.`,
        });
      }
      if (hasRepeatedStack(operations)) {
        issues.push({
          code: "repeated-stack",
          severity: "error",
          segmentId: segment.id,
          message: `${segment.label} uses a repeated, evenly spaced primitive stack.`,
        });
      }
    }
  }

  const compoundCoverage = substantialCount ? compoundCount / substantialCount : 1;
  if (substantialCount && compoundCoverage < 0.7) {
    issues.push({
      code: "compound-coverage",
      severity: "error",
      message: `Only ${Math.round(compoundCoverage * 100)}% of major masses use contributing compound forms.`,
    });
  }

  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    issues,
    metrics: { totalParts: kit.segments.length, headParts, compoundCoverage },
    segments,
  };
}
