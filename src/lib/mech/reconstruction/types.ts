import type { GroupId } from "../types";
import type { RigNodeId } from "../rig";

export type CompoundShape = "box" | "sphere" | "cylinder" | "cone" | "capsule" | "wedge";
export type CompoundRole = "primary" | "secondary" | "accent" | "frame" | "optic";

export interface ShapeOperation {
  id: string;
  mode: "add" | "subtract";
  shape: CompoundShape;
  role: CompoundRole;
  size: [number, number, number];
  position: [number, number, number];
  rotation: [number, number, number];
  bevel: number;
}

export interface ReconstructedSegment {
  id: string;
  label: string;
  group: GroupId;
  anchor: RigNodeId;
  mirrorOf: string;
  operations: ShapeOperation[];
}

export interface ReconstructedKit {
  version: 1;
  name: string;
  sourceSummary: string;
  transformationNotes: string[];
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    frame: string;
    optic: string;
  };
  segments: ReconstructedSegment[];
}
