import * as THREE from "three";
import { Brush, Evaluator, ADDITION, SUBTRACTION } from "three-bvh-csg";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { ReconstructedKit, ReconstructedSegment, ShapeOperation } from "./types";
import { RIG_NODE_BY_ID } from "../rig";
import { getLineMat } from "../palette";

const evaluator = new Evaluator();
evaluator.useGroups = false;
evaluator.attributes = ["position", "normal", "uv"];

function wedgeGeometry(size: [number, number, number]) {
  const [w, h, d] = size;
  const points = [
    [-w / 2, -h / 2, -d / 2],
    [w / 2, -h / 2, -d / 2],
    [w / 2, -h / 2, d / 2],
    [-w / 2, -h / 2, d / 2],
    [-w / 2, h / 2, -d / 2],
    [w / 2, h / 2, -d / 2],
  ] as const;
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const addFace = (corners: readonly number[]) => {
    const offset = vertices.length / 3;
    const faceUvs =
      corners.length === 4
        ? ([0, 0, 1, 0, 1, 1, 0, 1] as const)
        : ([0, 0, 1, 0, 0, 1] as const);
    for (const corner of corners) vertices.push(...points[corner]!);
    uvs.push(...faceUvs);
    if (corners.length === 4) {
      indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
    } else {
      indices.push(offset, offset + 1, offset + 2);
    }
  };

  // Separate face vertices keep the normals and UV seams crisp. All faces use
  // outward counter-clockwise winding, yielding a positive signed volume.
  addFace([0, 1, 2, 3]); // bottom
  addFace([0, 4, 5, 1]); // back
  addFace([3, 2, 5, 4]); // slope
  addFace([0, 3, 4]); // left
  addFace([1, 5, 2]); // right

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function prepareGeometry(geometry: THREE.BufferGeometry) {
  geometry.computeVertexNormals();
  if (!geometry.getAttribute("uv")) {
    geometry.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(geometry.getAttribute("position").count * 2, 2),
    );
  }
  return geometry;
}

function reverseWinding(geometry: THREE.BufferGeometry) {
  const index = geometry.index;
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const second = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, second);
    }
    index.needsUpdate = true;
  } else {
    for (const attribute of Object.values(geometry.attributes)) {
      for (let i = 0; i < attribute.count; i += 3) {
        for (let component = 0; component < attribute.itemSize; component++) {
          const second = attribute.getComponent(i + 1, component);
          attribute.setComponent(i + 1, component, attribute.getComponent(i + 2, component));
          attribute.setComponent(i + 2, component, second);
        }
      }
      attribute.needsUpdate = true;
    }
  }
}

function baseGeometry(op: ShapeOperation) {
  const [x, y, z] = op.size;
  switch (op.shape) {
    case "sphere":
      return new THREE.SphereGeometry(x / 2, 20, 14).scale(1, y / x, z / x);
    case "cylinder":
      return new THREE.CylinderGeometry(x / 2, x / 2, y, 20).scale(1, 1, z / x);
    case "cone":
      return new THREE.ConeGeometry(x / 2, y, 20).scale(1, 1, z / x);
    case "capsule":
      return new THREE.CapsuleGeometry(
        Math.min(x, z) / 2,
        Math.max(0.001, y - Math.min(x, z)),
        6,
        12,
      ).scale(x / Math.min(x, z), 1, z / Math.min(x, z));
    case "wedge":
      return wedgeGeometry(op.size);
    case "box":
    default: {
      const radius = Math.min(x, y, z) * Math.min(0.24, op.bevel * 0.18);
      return radius > 0.0015
        ? new RoundedBoxGeometry(x, y, z, 2, radius)
        : new THREE.BoxGeometry(x, y, z);
    }
  }
}

function transformedGeometry(
  op: ShapeOperation,
  anchor: ReconstructedSegment["anchor"],
  mirror: boolean,
) {
  const geometry = prepareGeometry(baseGeometry(op));
  const rest = RIG_NODE_BY_ID[anchor].rest;
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...op.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...op.rotation)),
    new THREE.Vector3(1, 1, 1),
  );
  if (mirror) {
    matrix.premultiply(new THREE.Matrix4().makeScale(-1, 1, 1));
  }
  matrix.premultiply(new THREE.Matrix4().makeTranslation(-rest[0], -rest[1], -rest[2]));
  geometry.applyMatrix4(matrix);
  if (mirror) reverseWinding(geometry);
  return prepareGeometry(geometry);
}

function evaluate(
  a: THREE.BufferGeometry,
  b: THREE.BufferGeometry,
  operation: typeof ADDITION | typeof SUBTRACTION,
) {
  const brushA = new Brush(a);
  const brushB = new Brush(b);
  brushA.updateMatrixWorld(true);
  brushB.updateMatrixWorld(true);
  let result: Brush | undefined;
  try {
    result = evaluator.evaluate(brushA, brushB, operation);
    const geometry = prepareGeometry(result.geometry.clone());
    a.dispose();
    b.dispose();
    return geometry;
  } finally {
    result?.geometry.dispose();
  }
}

function reportCsgFailure(
  segment: ReconstructedSegment,
  role: ShapeOperation["role"],
  op: ShapeOperation,
  error: unknown,
) {
  const action = op.mode === "add" ? "union" : "subtraction";
  console.warn(
    `[reconstruction/geometry] CSG ${action} failed for segment "${segment.id}", role "${role}", operation "${op.id}"; preserving additive geometry.`,
    error,
  );
}

function material(color: string, optic = false) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: optic ? 0.76 : 0.2,
    roughness: optic ? 0.12 : 0.42,
    clearcoat: optic ? 0.4 : 0.66,
    clearcoatRoughness: 0.2,
    emissive: optic ? color : "#000000",
    emissiveIntensity: optic ? 1.45 : 0,
  });
}

export function buildCompoundSegment(
  segment: ReconstructedSegment,
  kit: ReconstructedKit,
  paint: string | null,
  paint2: string | null,
  light: string,
  edges: boolean,
  theme: "light" | "dark",
) {
  const group = new THREE.Group();
  const source = segment.mirrorOf ? kit.segments.find((s) => s.id === segment.mirrorOf) : segment;
  if (!source) return group;
  const mirror = Boolean(segment.mirrorOf);
  const cuts = source.operations.filter((op) => op.mode === "subtract");
  const roles = ["primary", "secondary", "accent", "frame", "optic"] as const;
  const colors = {
    primary: paint ?? kit.palette.primary,
    secondary: paint2 ?? kit.palette.secondary,
    accent: kit.palette.accent,
    frame: kit.palette.frame,
    optic: light || kit.palette.optic,
  };

  for (const role of roles) {
    const additions = source.operations.filter((op) => op.mode === "add" && op.role === role);
    if (!additions.length) continue;
    const geometries = [transformedGeometry(additions[0]!, segment.anchor, mirror)];

    for (const op of additions.slice(1)) {
      const addition = transformedGeometry(op, segment.anchor, mirror);
      try {
        geometries[0] = evaluate(geometries[0]!, addition, ADDITION);
      } catch (error) {
        geometries.push(addition);
        reportCsgFailure(segment, role, op, error);
      }
    }

    for (const cut of cuts) {
      for (let i = 0; i < geometries.length; i++) {
        const cutter = transformedGeometry(cut, segment.anchor, mirror);
        try {
          geometries[i] = evaluate(geometries[i]!, cutter, SUBTRACTION);
        } catch (error) {
          cutter.dispose();
          reportCsgFailure(segment, role, cut, error);
        }
      }
    }

    for (const geometry of geometries) {
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material(colors[role], role === "optic"));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      if (edges && role !== "optic") {
        group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 34), getLineMat(theme)));
      }
    }
  }
  return group;
}

export function segmentCentroid(
  segment: ReconstructedSegment,
  kit: ReconstructedKit,
): [number, number, number] {
  const source = segment.mirrorOf ? kit.segments.find((s) => s.id === segment.mirrorOf) : segment;
  const additions = source?.operations.filter((op) => op.mode === "add") ?? [];
  if (!additions.length) return [0, 1, 0];
  const sum = additions.reduce(
    (a, op) => [a[0] + op.position[0], a[1] + op.position[1], a[2] + op.position[2]],
    [0, 0, 0],
  );
  const x = sum[0] / additions.length;
  return [segment.mirrorOf ? -x : x, sum[1] / additions.length, sum[2] / additions.length];
}

export function disposeCompound(group: THREE.Group) {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      const mats = Array.isArray(object.material) ? object.material : [object.material];
      mats.forEach((mat) => mat.dispose());
    } else if (object instanceof THREE.LineSegments) {
      object.geometry.dispose();
    }
  });
}
