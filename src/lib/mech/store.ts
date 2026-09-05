import { create } from "zustand";
import { SLOTS, SLOT_BY_ID, isLeftSlot, isVisorSlot, EXTRA_LEGACY, BEAM_MELEE } from "./catalog";
import { DEFAULT_STYLE, STYLE_BY_ID, STYLES } from "./codes";
import {
  IDENTITY,
  SAVE_VERSION,
  GROUPS,
  type PanelRect,
  type PartTransform,
  type SlotState,
  type ThemeMode,
  type GroupId,
} from "./types";
import { DEFAULT_VISOR } from "./palette";
import type { ReconstructedKit, ReconstructedSegment } from "./reconstruction/types";
import { RIG_NODE_BY_ID, type RigNodeId } from "./rig";
import { reflectedOperation } from "./reconstruction/segmentPolicy";
import { MAX_RECONSTRUCTED_SEGMENTS, sanitizeReconstructedKit } from "./reconstruction/validation";

const KEY = "frame-mix-build-v10";
const KEY_PREV = "frame-mix-build-v10-prev";
const LEGACY_KEYS = [
  "frame-mix-build-v9",
  "frame-mix-build-v8",
  "frame-mix-build-v7",
  "frame-mix-build-v6",
  "frame-mix-build-v5",
  "frame-mix-build-v4",
  "frame-mix-build-v3",
  "frame-mix-build-v2",
];

// Names from a build long before the reference corpus. They were mapped onto
// fixed positions in a hundred-entry ID grid; the catalogue is now however
// many archetypes have been decomposed, so pick by ratio rather than by index.
const at = (frac: number) =>
  STYLES[Math.min(STYLES.length - 1, Math.floor(frac * STYLES.length))]!.id;
const LEGACY_FAM: Record<string, string> = {
  origin: at(0),
  nomad: at(0.75),
  aether: at(0.25),
  fortress: at(0.24),
  pulse: at(0.5),
  chibi: at(0.99),
};

function migrateVariant(v: string, kind: string): string {
  if (LEGACY_FAM[v]) return LEGACY_FAM[v]!;
  if (EXTRA_LEGACY[v]) return EXTRA_LEGACY[v]!;
  if (kind === "armor" && !STYLE_BY_ID[v] && v !== "none") return DEFAULT_STYLE;
  return v;
}

export const PANEL_GAP = 20;
export const HEADER_H = 48;

function viewport() {
  if (typeof window === "undefined") return { w: 1280, h: 800 };
  return { w: window.innerWidth || 1280, h: window.innerHeight || 800 };
}

function hangarBox() {
  const { w, h } = viewport();
  return { w, h: Math.max(160, h - HEADER_H) };
}

export function clampPanel(id: string, rect: PanelRect): PanelRect {
  const { w: vw, h: vh } = hangarBox();
  const capW = id === "adjust" ? 360 : 300;
  const w = Math.min(Math.max(220, rect.w || capW), capW, Math.max(220, vw - PANEL_GAP * 2));
  const maxH = Math.max(160, vh - PANEL_GAP * 2);
  const h = Math.min(Math.max(160, rect.h || maxH), maxH);
  const x = Math.min(Math.max(0, rect.x || 0), Math.max(0, vw - w));
  const y = Math.min(Math.max(0, rect.y || 0), Math.max(0, vh - 36));
  const hFit = Math.min(h, Math.max(160, vh - y));
  return { ...rect, x, y, w, h: hFit };
}

export function defaultPanels(): Record<string, PanelRect> {
  const { w, h } = hangarBox();
  const g = PANEL_GAP;
  const panelH = Math.max(160, h - g * 2);
  return {
    parts: clampPanel("parts", { x: g, y: g, w: 276, h: panelH, pinned: false, folded: false }),
    adjust: clampPanel("adjust", {
      x: Math.max(g, w - 320 - g),
      y: g,
      w: 320,
      h: panelH,
      pinned: false,
      folded: false,
    }),
  };
}

function restorePanel(id: string, saved?: PanelRect): PanelRect {
  const def = defaultPanels()[id]!;
  if (!saved) return def;
  return clampPanel(id, { ...def, ...saved });
}

export function defaultScaleFor(id: string): Pick<SlotState, "sx" | "sy" | "sz"> {
  const g = SLOT_BY_ID[id]?.group;
  if (g === "head" || id === "extra5" || id === "extra7") return { sx: 0.72, sy: 0.72, sz: 0.72 };
  switch (id) {
    case "collar":
      return { sx: 0.92, sy: 0.88, sz: 0.92 };
    case "chestCore":
      return { sx: 0.9, sy: 1.06, sz: 0.94 };
    case "pecL":
    case "pecR":
      return { sx: 0.88, sy: 1, sz: 0.9 };
    case "cockpit":
      return { sx: 0.88, sy: 1, sz: 0.88 };
    case "abdomen":
      return { sx: 0.86, sy: 1.1, sz: 0.9 };
    case "pelvis":
      return { sx: 0.9, sy: 1, sz: 0.92 };
    case "skirtF":
    case "skirtB":
      return { sx: 0.9, sy: 1.06, sz: 0.92 };
    case "skirtL":
    case "skirtR":
      return { sx: 0.9, sy: 1.1, sz: 0.92 };
    case "shoulderR":
    case "shoulderL":
      return { sx: 0.88, sy: 0.9, sz: 0.88 };
    case "upperR":
    case "upperL":
      return { sx: 0.88, sy: 1.14, sz: 0.88 };
    case "elbowR":
    case "elbowL":
      return { sx: 0.94, sy: 0.94, sz: 0.94 };
    case "forearmR":
    case "forearmL":
      return { sx: 0.88, sy: 1.14, sz: 0.88 };
    case "vambraceR":
    case "vambraceL":
      return { sx: 0.9, sy: 1.04, sz: 0.9 };
    case "handR":
    case "handL":
      return { sx: 0.94, sy: 0.94, sz: 0.94 };
    case "hipR":
    case "hipL":
      return { sx: 1.06, sy: 1.06, sz: 1.06 };
    case "thighR":
    case "thighL":
      return { sx: 1.16, sy: 1.28, sz: 1.16 };
    case "kneeR":
    case "kneeL":
      return { sx: 1.12, sy: 1.08, sz: 1.12 };
    case "shinR":
    case "shinL":
      return { sx: 1.14, sy: 1.32, sz: 1.14 };
    case "ankleR":
    case "ankleL":
      return { sx: 1.1, sy: 1.06, sz: 1.1 };
    case "footR":
    case "footL":
      return { sx: 1.08, sy: 1, sz: 1.18 };
    case "pack":
      return { sx: 0.9, sy: 0.94, sz: 0.9 };
    case "thrusterL":
    case "thrusterR":
      return { sx: 0.92, sy: 0.92, sz: 0.92 };
    case "binderL":
    case "binderR":
      return { sx: 0.92, sy: 0.96, sz: 0.92 };
    default:
      return { sx: 1, sy: 1, sz: 1 };
  }
}

function defaultFor(id: string): SlotState {
  const s = SLOT_BY_ID[id];
  const variant = s?.defaultVariant ?? "none";
  return {
    ...IDENTITY,
    ...defaultScaleFor(id),
    variant,
    paint: null,
    paint2: null,
    visible: variant !== "none",
  };
}

const STARTER_ANCHOR_BY_GROUP: Record<GroupId, RigNodeId> = {
  head: "neck",
  torso: "torso",
  waist: "root",
  armR: "shoulderR",
  armL: "shoulderL",
  legR: "hipR",
  legL: "hipL",
  back: "torso",
  weapon: "wristR",
  extra: "torso",
};

function defaultForReconstructed(_segment: ReconstructedSegment): SlotState {
  return {
    ...IDENTITY,
    variant: "compound",
    paint: null,
    paint2: null,
    visible: true,
  };
}

function reconstructedSlots(
  kit: ReconstructedKit,
  saved?: Record<string, SlotState>,
): Record<string, SlotState> {
  return Object.fromEntries(
    kit.segments.map((segment) => [
      segment.id,
      { ...defaultForReconstructed(segment), ...(saved?.[segment.id] ?? {}) },
    ]),
  );
}

function segmentFor(state: Pick<StudioState, "reconstructedKit">, id: string) {
  return state.reconstructedKit?.segments.find((segment) => segment.id === id);
}

function segmentMirror(state: Pick<StudioState, "reconstructedKit">, id: string) {
  const segment = segmentFor(state, id);
  if (!segment || !state.reconstructedKit) return undefined;
  if (segment.mirrorOf) return segment.mirrorOf;
  return state.reconstructedKit.segments.find((candidate) => candidate.mirrorOf === id)?.id;
}

function defaultSlots(): Record<string, SlotState> {
  const out: Record<string, SlotState> = {};
  for (const s of SLOTS) out[s.id] = defaultFor(s.id);
  return out;
}

function mirrorTransform(src: SlotState): Pick<SlotState, "px" | "ry" | "rz"> {
  return { px: -src.px, ry: -src.ry, rz: -src.rz };
}

const GROUP_MIRROR: Record<string, string> = {
  armR: "armL",
  armL: "armR",
  legR: "legL",
  legL: "legR",
};

function emptyGroupXform(): Record<string, PartTransform> {
  const out: Record<string, PartTransform> = {};
  for (const g of GROUPS) out[g.id] = { ...IDENTITY };
  return out;
}

function restoreGroupXform(
  raw?: Record<string, Partial<PartTransform>>,
): Record<string, PartTransform> {
  const out = emptyGroupXform();
  if (!raw) return out;
  for (const g of GROUPS) {
    const src = raw[g.id];
    if (!src) continue;
    out[g.id] = { ...IDENTITY, ...src };
  }
  return out;
}

export type StudioState = {
  name: string;
  slots: Record<string, SlotState>;
  selected: string;
  explode: number;
  autoRotate: boolean;
  edges: boolean;
  symmetry: boolean;
  uniformScale: boolean;
  groupFilter: string;
  groupXform: Record<string, PartTransform>;
  theme: ThemeMode;
  poseId: string;
  panels: Record<string, PanelRect>;
  /** true once the user has dragged/resized a panel — stops auto-relayout */
  panelMoved: boolean;
  light: string;
  panelZ: string[];
  camTick: number;
  detailsTick: number;
  poseMenu: { x: number; y: number } | null;
  reconstructedKit: ReconstructedKit | null;
  setSelected: (id: string) => void;
  pickSlot: (id: string) => void;
  setGroupFilter: (g: string) => void;
  patchSlot: (id: string, patch: Partial<SlotState>, fromMirror?: boolean) => void;
  setVariant: (id: string, variant: string) => void;
  applyFamily: (family: string, group?: string) => void;
  applyPaint: (hex: string, group?: string) => void;
  applyPaint2: (hex: string, group?: string) => void;
  applyVisorPaint: (hex: string, group?: string) => void;
  setLight: (hex: string) => void;
  randomMix: () => void;
  resetTransforms: () => void;
  resetAll: () => void;
  resetSlotDefault: (id: string) => void;
  resetGroupDefault: (group: string) => void;
  setGroupVisible: (group: string, visible: boolean) => void;
  patchGroupXform: (group: string, patch: Partial<PartTransform>) => void;
  resetGroupXform: (group: string, keys?: (keyof PartTransform)[]) => void;
  setExplode: (v: number) => void;
  toggle: (k: "autoRotate" | "edges" | "symmetry" | "uniformScale") => void;
  setName: (n: string) => void;
  setTheme: (t: ThemeMode) => void;
  setPose: (id: string) => void;
  openPoseMenu: (x: number, y: number) => void;
  closePoseMenu: () => void;
  setPanel: (id: string, patch: Partial<PanelRect>) => void;
  resetPanels: () => void;
  /** reset one panel to its default rect for the current viewport */
  resetPanel: (id: string) => void;
  /** re-fit panels to the current viewport (called on window resize) */
  syncPanels: () => void;
  showAllParts: () => void;
  hideAllParts: () => void;
  refreshAll: () => void;
  resetCamera: () => void;
  focusPanel: (id: string) => void;
  saveNow: () => void;
  rehydrate: () => void;
  exportJson: () => string;
  importJson: (raw: string) => boolean;
  loadReconstructedKit: (kit: ReconstructedKit) => void;
  addReconstructedSegment: () => boolean;
  duplicateReconstructedSegment: (id: string) => boolean;
  removeReconstructedSegment: (id: string) => boolean;
  clearReconstructedKit: () => void;
};

type PersistBlob = {
  version?: number;
  name?: string;
  slots?: Record<string, SlotState>;
  theme?: ThemeMode;
  poseId?: string;
  panels?: Record<string, PanelRect>;
  panelMoved?: boolean;
  light?: string;
  selected?: string;
  explode?: number;
  autoRotate?: boolean;
  edges?: boolean;
  symmetry?: boolean;
  uniformScale?: boolean;
  groupFilter?: string;
  groupXform?: Record<string, Partial<PartTransform>>;
  reconstructedKit?: ReconstructedKit | null;
};

type SessionSlice = Pick<
  StudioState,
  | "name"
  | "slots"
  | "theme"
  | "poseId"
  | "panels"
  | "panelMoved"
  | "light"
  | "selected"
  | "explode"
  | "autoRotate"
  | "edges"
  | "symmetry"
  | "uniformScale"
  | "groupFilter"
  | "groupXform"
  | "reconstructedKit"
>;

function snapshot(s: StudioState): SessionSlice {
  return {
    name: s.name,
    slots: s.slots,
    theme: s.theme,
    poseId: s.poseId,
    panels: s.panels,
    panelMoved: s.panelMoved,
    light: s.light,
    selected: s.selected,
    explode: s.explode,
    autoRotate: s.autoRotate,
    edges: s.edges,
    symmetry: s.symmetry,
    uniformScale: s.uniformScale,
    groupFilter: s.groupFilter,
    groupXform: s.groupXform,
    reconstructedKit: s.reconstructedKit,
  };
}

function persist(state: SessionSlice) {
  try {
    if (typeof window === "undefined") return;
    const blob = JSON.stringify({ version: SAVE_VERSION, ...state });
    const prev = localStorage.getItem(KEY);
    if (prev) localStorage.setItem(KEY_PREV, prev);
    localStorage.setItem(KEY, blob);
  } catch {
    /* private mode */
  }
}

function emptySession(): SessionSlice {
  return {
    name: "FRAME-00",
    slots: defaultSlots(),
    theme: "light",
    poseId: "relaxed",
    panels: defaultPanels(),
    panelMoved: false,
    light: DEFAULT_VISOR,
    selected: "helm",
    explode: 0,
    autoRotate: false,
    edges: true,
    symmetry: true,
    uniformScale: true,
    groupFilter: "head",
    groupXform: emptyGroupXform(),
    reconstructedKit: null,
  };
}

function load(): SessionSlice {
  const base = emptySession();
  try {
    if (typeof window === "undefined") return base;
    let raw = localStorage.getItem(KEY);
    if (!raw) {
      for (const k of LEGACY_KEYS) {
        raw = localStorage.getItem(k);
        if (raw) break;
      }
    }
    if (!raw) return base;
    const parsed = JSON.parse(raw) as PersistBlob;
    const reconstructedKit = parsed.reconstructedKit
      ? sanitizeReconstructedKit(parsed.reconstructedKit)
      : null;
    const slots = reconstructedKit
      ? reconstructedSlots(reconstructedKit, parsed.slots)
      : defaultSlots();
    if (parsed.slots) {
      for (const def of reconstructedKit ? [] : SLOTS) {
        const src = parsed.slots[def.id];
        if (!src) continue;
        slots[def.id] = {
          ...slots[def.id],
          ...src,
          variant: migrateVariant(src.variant, def.kind),
          paint2: src.paint2 ?? null,
        };
      }
      if ((parsed.version ?? 0) < 9) {
        for (const id of Object.keys(slots)) {
          const cur = slots[id];
          if (!cur) continue;
          if (cur.sx === 1 && cur.sy === 1 && cur.sz === 1) {
            slots[id] = { ...cur, ...defaultScaleFor(id) };
          }
        }
      }
    }
    return {
      name: parsed.name || base.name,
      slots,
      theme: parsed.theme === "dark" ? "dark" : "light",
      poseId: parsed.poseId || "relaxed",
      light: parsed.light || parsed.slots?.visor?.paint || DEFAULT_VISOR,
      panels: {
        parts: restorePanel("parts", parsed.panels?.parts),
        adjust: restorePanel("adjust", parsed.panels?.adjust),
      },
      // pre-v11 saves have no flag; treat any stored layout as user-arranged
      // only if it was explicitly moved, otherwise let syncPanels re-fit it
      panelMoved: parsed.panelMoved === true,
      selected:
        parsed.selected &&
        (reconstructedKit?.segments.some((s) => s.id === parsed.selected) ||
          (!reconstructedKit && SLOT_BY_ID[parsed.selected]))
          ? parsed.selected
          : (reconstructedKit?.segments[0]?.id ?? base.selected),
      explode: typeof parsed.explode === "number" ? parsed.explode : 0,
      autoRotate: parsed.autoRotate === true,
      edges: parsed.edges !== false,
      symmetry: parsed.symmetry !== false,
      uniformScale: parsed.uniformScale !== false,
      groupFilter:
        parsed.groupFilter ||
        reconstructedKit?.segments.find((s) => s.id === parsed.selected)?.group ||
        (!reconstructedKit ? SLOT_BY_ID[parsed.selected ?? ""]?.group : undefined) ||
        reconstructedKit?.segments[0]?.group ||
        "head",
      groupXform: restoreGroupXform(parsed.groupXform),
      reconstructedKit,
    };
  } catch {
    return base;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(get: () => StudioState) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persist(snapshot(get())), 400);
}

const initial = load();

export const useStudio = create<StudioState>((set, get) => ({
  name: initial.name,
  slots: initial.slots,
  selected: initial.selected,
  explode: initial.explode,
  autoRotate: initial.autoRotate,
  edges: initial.edges,
  symmetry: initial.symmetry,
  uniformScale: initial.uniformScale,
  groupFilter: initial.groupFilter,
  groupXform: initial.groupXform,
  theme: initial.theme,
  poseId: initial.poseId,
  panels: initial.panels,
  panelMoved: initial.panelMoved ?? false,
  light: initial.light,
  panelZ: ["parts", "adjust"],
  camTick: 0,
  detailsTick: 0,
  poseMenu: null,
  reconstructedKit: initial.reconstructedKit,

  setSelected: (id) => {
    set((state) => ({
      selected: id,
      groupFilter: segmentFor(state, id)?.group ?? SLOT_BY_ID[id]?.group ?? state.groupFilter,
    }));
    scheduleSave(get);
  },
  pickSlot: (id) => {
    const state = get();
    const def = segmentFor(state, id) ?? SLOT_BY_ID[id];
    set((st) => {
      const panels = { ...st.panels };
      if (panels.adjust?.folded) panels.adjust = { ...panels.adjust, folded: false };
      return {
        selected: id,
        groupFilter: def?.group ?? st.groupFilter,
        panels,
        panelZ: [...st.panelZ.filter((x) => x !== "adjust"), "adjust"],
        detailsTick: st.detailsTick + 1,
      };
    });
    scheduleSave(get);
  },
  setGroupFilter: (g) => {
    set({ groupFilter: g });
    scheduleSave(get);
  },

  patchSlot: (id, patch, fromMirror) => {
    set((st) => {
      const cur = st.slots[id];
      if (!cur) return st;
      let next = { ...cur, ...patch };
      if (st.uniformScale && (patch.sx != null || patch.sy != null || patch.sz != null)) {
        const explicitAll = patch.sx != null && patch.sy != null && patch.sz != null;
        const beamOnlyZ =
          BEAM_MELEE.has(next.variant) && patch.sz != null && patch.sx == null && patch.sy == null;
        if (!beamOnlyZ && !explicitAll) {
          const v = patch.sx ?? patch.sy ?? patch.sz ?? cur.sx;
          next = { ...next, sx: v, sy: v, sz: v };
        }
      }
      const slots = { ...st.slots, [id]: next };
      if (st.symmetry && !fromMirror) {
        const other = st.reconstructedKit ? segmentMirror(st, id) : SLOT_BY_ID[id]?.mirror;
        if (other && slots[other]) {
          slots[other] = {
            ...slots[other],
            ...patch,
            ...mirrorTransform(next),
            variant: next.variant,
            paint: next.paint,
            paint2: next.paint2,
            visible: next.visible,
            sx: next.sx,
            sy: next.sy,
            sz: next.sz,
          };
        }
      }
      return { slots };
    });
    scheduleSave(get);
  },

  setVariant: (id, variant) => {
    get().patchSlot(id, { variant, visible: variant !== "none" });
  },

  applyFamily: (family, group) => {
    set((st) => {
      const slots = { ...st.slots };
      for (const def of SLOTS) {
        if (group && def.group !== group) continue;
        if (def.kind !== "armor") continue;
        if (!def.variants.some((v) => v.id === family)) continue;
        slots[def.id] = { ...slots[def.id], variant: family, visible: true };
      }
      return { slots };
    });
    scheduleSave(get);
  },

  applyPaint: (hex, group) => {
    set((st) => {
      const slots = { ...st.slots };
      const defs = st.reconstructedKit?.segments ?? SLOTS;
      for (const def of defs) {
        if (group && def.group !== group) continue;
        if (!st.reconstructedKit && isVisorSlot(def.id)) continue;
        if (!slots[def.id]) continue;
        slots[def.id] = { ...slots[def.id], paint: hex };
      }
      return { slots };
    });
    scheduleSave(get);
  },

  applyPaint2: (hex, group) => {
    set((st) => {
      const slots = { ...st.slots };
      const defs = st.reconstructedKit?.segments ?? SLOTS;
      for (const def of defs) {
        if (group && def.group !== group) continue;
        if (!slots[def.id]) continue;
        slots[def.id] = { ...slots[def.id], paint2: hex };
      }
      return { slots };
    });
    scheduleSave(get);
  },

  applyVisorPaint: (hex, group) => {
    set((st) => {
      if (st.reconstructedKit) return { light: hex };
      const slots = { ...st.slots };
      for (const def of SLOTS) {
        if (!isVisorSlot(def.id)) continue;
        if (group && def.group !== group) continue;
        if (!slots[def.id]) continue;
        slots[def.id] = { ...slots[def.id], paint: hex };
      }
      return { slots, light: group ? st.light : hex };
    });
    scheduleSave(get);
  },

  setLight: (hex) => {
    set({ light: hex });
    scheduleSave(get);
  },

  randomMix: () => {
    set((st) => {
      const slots = { ...st.slots };
      for (const def of SLOTS) {
        if (def.kind === "extra" && Math.random() < 0.55) {
          slots[def.id] = { ...slots[def.id], variant: "none", visible: false };
          continue;
        }
        const pool = def.variants.filter((v) => v.id !== "none");
        const pick = pool[Math.floor(Math.random() * pool.length)] ?? def.variants[0];
        slots[def.id] = {
          ...defaultFor(def.id),
          variant: pick.id,
          visible: pick.id !== "none",
        };
      }
      if (st.symmetry) {
        for (const def of SLOTS) {
          if (!def.mirror) continue;
          if (isLeftSlot(def.id) && slots[def.mirror]) {
            const src = slots[def.mirror];
            slots[def.id] = { ...src, ...mirrorTransform(src) };
          }
        }
      }
      return { slots };
    });
    scheduleSave(get);
  },

  resetTransforms: () => {
    set((st) => {
      const slots = { ...st.slots };
      for (const id of Object.keys(slots)) {
        const reconstructed = Boolean(segmentFor(st, id));
        slots[id] = {
          ...slots[id],
          px: 0,
          py: 0,
          pz: 0,
          rx: 0,
          ry: 0,
          rz: 0,
          ...(reconstructed ? { sx: 1, sy: 1, sz: 1 } : defaultScaleFor(id)),
        };
      }
      return { slots };
    });
    scheduleSave(get);
  },

  resetAll: () => {
    set((st) => ({
      name: "FRAME-00",
      slots: st.reconstructedKit ? reconstructedSlots(st.reconstructedKit) : defaultSlots(),
      selected: st.reconstructedKit?.segments[0]?.id ?? "helm",
      poseId: "relaxed",
      light: DEFAULT_VISOR,
      groupXform: emptyGroupXform(),
    }));
    scheduleSave(get);
  },

  resetSlotDefault: (id) => {
    const segment = segmentFor(get(), id);
    get().patchSlot(id, segment ? defaultForReconstructed(segment) : defaultFor(id));
  },

  resetGroupDefault: (group) => {
    set((st) => {
      const slots = { ...st.slots };
      const defs = st.reconstructedKit?.segments ?? SLOTS;
      for (const def of defs) {
        if (def.group !== group) continue;
        const segment = segmentFor(st, def.id);
        slots[def.id] = segment ? defaultForReconstructed(segment) : defaultFor(def.id);
      }
      const groupXform = { ...st.groupXform, [group]: { ...IDENTITY } };
      const pair = GROUP_MIRROR[group];
      if (st.symmetry && pair) groupXform[pair] = { ...IDENTITY };
      return { slots, groupXform };
    });
    scheduleSave(get);
  },

  setGroupVisible: (group, visible) => {
    set((st) => {
      const slots = { ...st.slots };
      const defs = st.reconstructedKit?.segments ?? SLOTS;
      for (const def of defs) {
        if (def.group !== group) continue;
        if (!slots[def.id]) continue;
        slots[def.id] = { ...slots[def.id], visible };
      }
      return { slots };
    });
    scheduleSave(get);
  },

  patchGroupXform: (group, patch) => {
    set((st) => {
      const cur = st.groupXform[group] ?? { ...IDENTITY };
      let next = { ...cur, ...patch };
      if (st.uniformScale && (patch.sx != null || patch.sy != null || patch.sz != null)) {
        const explicitAll = patch.sx != null && patch.sy != null && patch.sz != null;
        if (!explicitAll) {
          const v = patch.sx ?? patch.sy ?? patch.sz ?? cur.sx;
          next = { ...next, sx: v, sy: v, sz: v };
        }
      }
      const groupXform = { ...st.groupXform, [group]: next };
      const pair = GROUP_MIRROR[group];
      if (st.symmetry && pair) {
        groupXform[pair] = { ...next, px: -next.px, ry: -next.ry, rz: -next.rz };
      }
      return { groupXform };
    });
    scheduleSave(get);
  },

  resetGroupXform: (group, keys) => {
    set((st) => {
      const cur = st.groupXform[group] ?? { ...IDENTITY };
      const next = { ...cur };
      const resetKeys = keys ?? (Object.keys(IDENTITY) as (keyof PartTransform)[]);
      for (const k of resetKeys) next[k] = IDENTITY[k];
      const groupXform = { ...st.groupXform, [group]: next };
      const pair = GROUP_MIRROR[group];
      if (st.symmetry && pair) {
        groupXform[pair] = { ...next, px: -next.px, ry: -next.ry, rz: -next.rz };
      }
      return { groupXform };
    });
    scheduleSave(get);
  },

  setExplode: (v) => {
    set({ explode: v });
    scheduleSave(get);
  },
  toggle: (k) => {
    set((st) => ({ [k]: !st[k] }) as Partial<StudioState>);
    scheduleSave(get);
  },
  setName: (n) => {
    set({ name: n });
    scheduleSave(get);
  },
  setTheme: (t) => {
    set({ theme: t });
    scheduleSave(get);
  },
  setPose: (id) => {
    set({ poseId: id });
    scheduleSave(get);
  },
  openPoseMenu: (x, y) => {
    set({ poseMenu: { x, y } });
  },
  closePoseMenu: () => {
    if (get().poseMenu) set({ poseMenu: null });
  },
  setPanel: (id, patch) => {
    set((st) => {
      const next = { ...st.panels[id]!, ...patch };
      // a position / size change is a deliberate arrangement; folding is not
      const moved =
        st.panelMoved || patch.x != null || patch.y != null || patch.w != null || patch.h != null;
      return { panels: { ...st.panels, [id]: clampPanel(id, next) }, panelMoved: moved };
    });
    scheduleSave(get);
  },
  resetPanels: () => {
    set({ panels: defaultPanels(), panelMoved: false });
    scheduleSave(get);
  },
  resetPanel: (id) => {
    set((st) => {
      const def = defaultPanels()[id];
      if (!def) return st;
      return {
        panels: { ...st.panels, [id]: { ...def, folded: st.panels[id]?.folded ?? false } },
      };
    });
    scheduleSave(get);
  },
  syncPanels: () => {
    set((st) => {
      if (st.panelMoved) {
        // the user arranged them — only keep them on screen
        const panels: Record<string, PanelRect> = {};
        for (const [id, r] of Object.entries(st.panels)) panels[id] = clampPanel(id, r);
        return { panels };
      }
      // auto layout: dock left / right and fill the height, keep fold state
      const def = defaultPanels();
      const panels: Record<string, PanelRect> = {};
      for (const [id, r] of Object.entries(def)) {
        panels[id] = {
          ...r,
          folded: st.panels[id]?.folded ?? false,
          pinned: st.panels[id]?.pinned ?? false,
        };
      }
      return { panels };
    });
    scheduleSave(get);
  },
  showAllParts: () => {
    set((st) => {
      const slots = { ...st.slots };
      for (const id of Object.keys(slots)) {
        const cur = slots[id];
        if (!cur) continue;
        slots[id] = {
          ...cur,
          visible: st.reconstructedKit ? true : cur.variant !== "none",
        };
      }
      return { slots };
    });
    scheduleSave(get);
  },
  hideAllParts: () => {
    set((st) => {
      const slots = { ...st.slots };
      for (const id of Object.keys(slots)) {
        const cur = slots[id];
        if (!cur) continue;
        slots[id] = { ...cur, visible: false };
      }
      return { slots };
    });
    scheduleSave(get);
  },
  refreshAll: () => {
    set((st) => {
      const slots = { ...st.slots };
      for (const id of Object.keys(slots)) {
        const cur = slots[id];
        if (!cur) continue;
        // refresh also strips every weapon + extra part back to none
        const grp = segmentFor(st, id)?.group ?? SLOT_BY_ID[id]?.group;
        if (!st.reconstructedKit && (grp === "weapon" || grp === "extra")) {
          slots[id] = { ...cur, variant: "none", visible: false };
        } else {
          slots[id] = {
            ...cur,
            visible: st.reconstructedKit ? true : cur.variant !== "none",
          };
        }
      }
      return {
        slots,
        panels: defaultPanels(),
        panelMoved: false,
        groupXform: emptyGroupXform(),
        explode: 0,
        camTick: st.camTick + 1,
      };
    });
    scheduleSave(get);
  },
  resetCamera: () => set((st) => ({ camTick: st.camTick + 1 })),
  focusPanel: (id) => set((st) => ({ panelZ: [...st.panelZ.filter((x) => x !== id), id] })),
  saveNow: () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    persist(snapshot(get()));
  },
  rehydrate: () => {
    set(load());
  },
  exportJson: () => {
    const s = get();
    return JSON.stringify(
      {
        version: SAVE_VERSION,
        name: s.name,
        slots: s.slots,
        theme: s.theme,
        poseId: s.poseId,
        light: s.light,
        selected: s.selected,
        explode: s.explode,
        autoRotate: s.autoRotate,
        edges: s.edges,
        symmetry: s.symmetry,
        uniformScale: s.uniformScale,
        groupFilter: s.groupFilter,
        groupXform: s.groupXform,
        reconstructedKit: s.reconstructedKit,
      },
      null,
      2,
    );
  },
  importJson: (raw) => {
    try {
      const parsed = JSON.parse(raw) as PersistBlob;
      const reconstructedKit = parsed.reconstructedKit
        ? sanitizeReconstructedKit(parsed.reconstructedKit)
        : null;
      const slots = reconstructedKit
        ? reconstructedSlots(reconstructedKit, parsed.slots)
        : defaultSlots();
      if (parsed.slots) {
        for (const def of reconstructedKit ? [] : SLOTS) {
          const src = parsed.slots[def.id];
          if (!src) continue;
          slots[def.id] = {
            ...slots[def.id],
            ...src,
            variant: migrateVariant(src.variant, def.kind),
            paint2: src.paint2 ?? null,
          };
        }
      }
      set({
        name: parsed.name || get().name,
        slots,
        theme: parsed.theme === "dark" ? "dark" : get().theme,
        poseId: parsed.poseId || get().poseId,
        light: parsed.light || parsed.slots?.visor?.paint || get().light,
        reconstructedKit,
        selected:
          (parsed.selected && reconstructedKit?.segments.some((s) => s.id === parsed.selected)
            ? parsed.selected
            : reconstructedKit?.segments[0]?.id) ?? "helm",
        groupFilter: parsed.groupFilter ?? reconstructedKit?.segments[0]?.group ?? "head",
        groupXform: restoreGroupXform(parsed.groupXform),
        explode: typeof parsed.explode === "number" ? parsed.explode : 0,
        autoRotate: parsed.autoRotate === true,
        edges: parsed.edges !== false,
        symmetry: parsed.symmetry !== false,
        uniformScale: parsed.uniformScale !== false,
      });
      scheduleSave(get);
      return true;
    } catch {
      return false;
    }
  },
  loadReconstructedKit: (kit) => {
    const validated = sanitizeReconstructedKit(kit);
    const first = validated.segments[0];
    set({
      reconstructedKit: validated,
      slots: reconstructedSlots(validated),
      selected: first?.id ?? "",
      groupFilter: first?.group ?? "head",
      name: validated.name,
      light: validated.palette.optic,
      groupXform: emptyGroupXform(),
      explode: 0,
      poseId: "relaxed",
    });
    scheduleSave(get);
  },
  addReconstructedSegment: () => {
    const state = get();
    const kit = state.reconstructedKit;
    if (!kit || kit.segments.length >= MAX_RECONSTRUCTED_SEGMENTS) return false;
    const group = GROUPS.some((candidate) => candidate.id === state.groupFilter)
      ? (state.groupFilter as GroupId)
      : "head";
    const used = new Set(kit.segments.map((segment) => segment.id));
    const stem = `starter-${group}`.toLowerCase().slice(0, 48);
    let id = stem;
    let suffix = 2;
    while (used.has(id)) {
      id = `${stem.slice(0, 44)}-${suffix}`;
      suffix += 1;
    }
    const anchor = STARTER_ANCHOR_BY_GROUP[group];
    const segment: ReconstructedSegment = {
      id,
      label: "Starter Compound",
      group,
      anchor,
      mirrorOf: "",
      operations: [
        {
          id: "primary-mass",
          mode: "add",
          shape: "capsule",
          role: "primary",
          size: [0.16, 0.22, 0.14],
          position: [...RIG_NODE_BY_ID[anchor].rest],
          rotation: [0, 0, 0],
          bevel: 0.12,
        },
      ],
    };
    const reconstructedKit = sanitizeReconstructedKit({
      ...kit,
      segments: [...kit.segments, segment],
    });
    set({
      reconstructedKit,
      slots: { ...state.slots, [id]: defaultForReconstructed(segment) },
      selected: id,
      groupFilter: group,
    });
    scheduleSave(get);
    return true;
  },
  duplicateReconstructedSegment: (id) => {
    const state = get();
    const kit = state.reconstructedKit;
    const segment = kit?.segments.find((candidate) => candidate.id === id);
    if (!kit || !segment || kit.segments.length >= MAX_RECONSTRUCTED_SEGMENTS) return false;
    const source = segment.mirrorOf
      ? kit.segments.find((candidate) => candidate.id === segment.mirrorOf)
      : segment;
    if (!source) return false;
    const used = new Set(kit.segments.map((candidate) => candidate.id));
    const stem = `${segment.id}-copy`.slice(0, 48);
    let nextId = stem;
    let suffix = 2;
    while (used.has(nextId)) {
      nextId = `${stem.slice(0, 44)}-${suffix}`;
      suffix += 1;
    }
    const operations = (
      segment.mirrorOf ? source.operations.map(reflectedOperation) : source.operations
    ).map((operation) => ({ ...operation }));
    const duplicate: ReconstructedSegment = {
      ...segment,
      id: nextId,
      label: `${segment.label} Copy`.slice(0, 64),
      mirrorOf: "",
      operations,
    };
    const reconstructedKit = sanitizeReconstructedKit({
      ...kit,
      segments: [...kit.segments, duplicate],
    });
    set({
      reconstructedKit,
      slots: {
        ...state.slots,
        [nextId]: { ...defaultForReconstructed(duplicate), px: 0.04 },
      },
      selected: nextId,
      groupFilter: duplicate.group,
    });
    scheduleSave(get);
    return true;
  },
  removeReconstructedSegment: (id) => {
    const state = get();
    const kit = state.reconstructedKit;
    const removed = kit?.segments.find((segment) => segment.id === id);
    if (!kit || !removed) return false;
    const segments = kit.segments
      .filter((segment) => segment.id !== id)
      .map((segment) =>
        segment.mirrorOf === id
          ? {
              ...segment,
              mirrorOf: "",
              operations: removed.operations.map(reflectedOperation),
            }
          : segment,
      );
    const reconstructedKit = sanitizeReconstructedKit({ ...kit, segments });
    const slots = { ...state.slots };
    delete slots[id];
    const next = segments.find((segment) => segment.group === removed.group) ?? segments[0];
    set({
      reconstructedKit,
      slots,
      selected: next?.id ?? "",
      groupFilter: next?.group ?? removed.group,
    });
    scheduleSave(get);
    return true;
  },
  clearReconstructedKit: () => {
    set({
      reconstructedKit: null,
      slots: defaultSlots(),
      selected: "helm",
      groupFilter: "head",
      name: "FRAME-00",
      light: DEFAULT_VISOR,
      groupXform: emptyGroupXform(),
      explode: 0,
    });
    scheduleSave(get);
  },
}));
