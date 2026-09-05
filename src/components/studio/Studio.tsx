import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Dices,
  Download,
  RefreshCw,
  Save,
  Upload,
  Camera,
  Sun,
  Moon,
  Eye,
  EyeOff,
  Copy,
  Trash2,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HangarCanvas } from "@/components/hangar/HangarCanvas";
import { GROUPS } from "@/lib/mech/types";
import { SLOTS, variantLabel } from "@/lib/mech/catalog";
import { QUAD_RANGES, STYLES } from "@/lib/mech/codes";
import { defaultScaleFor, useStudio } from "@/lib/mech/store";
import { AxisSliders, HsbSliders } from "./AxisSliders";
import { DEFAULT_VISOR } from "@/lib/mech/palette";
import { getRecipe } from "@/lib/mech/recipes";
import { FloatPanel } from "./FloatPanel";
import { cn } from "@/lib/utils";
import type { SlotDef } from "@/lib/mech/types";
import { ThumbnailImporter } from "./ThumbnailImporter";

function useClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function useLg() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("resize", cb);
      return () => window.removeEventListener("resize", cb);
    },
    () => window.innerWidth >= 1024,
    () => false,
  );
}

const EXTRA_CHIPS = [
  { id: "all" as const, label: "All" },
  { id: "M" as const, label: "Module" },
  { id: "W" as const, label: "Weapon" },
  { id: "A" as const, label: "Accent" },
  { id: "G" as const, label: "Shape" },
];

export function Studio() {
  const mounted = useClient();
  const lg = useLg();
  const [mobilePane, setMobilePane] = useState<"parts" | "adjust">("adjust");
  const [quad, setQuad] = useState<string>("all");
  const [extraClass, setExtraClass] = useState<"all" | "M" | "W" | "A" | "G">("all");
  const [jsonNotice, setJsonNotice] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const name = useStudio((s) => s.name);
  const setName = useStudio((s) => s.setName);
  const selected = useStudio((s) => s.selected);
  const slots = useStudio((s) => s.slots);
  const groupFilter = useStudio((s) => s.groupFilter);
  const setGroupFilter = useStudio((s) => s.setGroupFilter);
  const setSelected = useStudio((s) => s.setSelected);
  const setVariant = useStudio((s) => s.setVariant);
  const patchSlot = useStudio((s) => s.patchSlot);
  const applyFamily = useStudio((s) => s.applyFamily);
  const applyPaint = useStudio((s) => s.applyPaint);
  const applyPaint2 = useStudio((s) => s.applyPaint2);
  const applyVisorPaint = useStudio((s) => s.applyVisorPaint);
  const light = useStudio((s) => s.light);
  const setLight = useStudio((s) => s.setLight);
  const randomMix = useStudio((s) => s.randomMix);
  const resetSlotDefault = useStudio((s) => s.resetSlotDefault);
  const resetGroupDefault = useStudio((s) => s.resetGroupDefault);
  const setGroupVisible = useStudio((s) => s.setGroupVisible);
  const groupXform = useStudio((s) => s.groupXform);
  const patchGroupXform = useStudio((s) => s.patchGroupXform);
  const resetGroupXform = useStudio((s) => s.resetGroupXform);
  const explode = useStudio((s) => s.explode);
  const setExplode = useStudio((s) => s.setExplode);
  const autoRotate = useStudio((s) => s.autoRotate);
  const edges = useStudio((s) => s.edges);
  const symmetry = useStudio((s) => s.symmetry);
  const uniformScale = useStudio((s) => s.uniformScale);
  const toggle = useStudio((s) => s.toggle);
  const exportJson = useStudio((s) => s.exportJson);
  const importJson = useStudio((s) => s.importJson);
  const saveNow = useStudio((s) => s.saveNow);
  const rehydrate = useStudio((s) => s.rehydrate);
  const theme = useStudio((s) => s.theme);
  const setTheme = useStudio((s) => s.setTheme);
  const panels = useStudio((s) => s.panels);
  const setPanel = useStudio((s) => s.setPanel);
  const showAllParts = useStudio((s) => s.showAllParts);
  const hideAllParts = useStudio((s) => s.hideAllParts);
  const refreshAll = useStudio((s) => s.refreshAll);
  const resetCamera = useStudio((s) => s.resetCamera);
  const resetPanel = useStudio((s) => s.resetPanel);
  const focusPanel = useStudio((s) => s.focusPanel);
  const panelZ = useStudio((s) => s.panelZ);
  const detailsTick = useStudio((s) => s.detailsTick);
  const poseId = useStudio((s) => s.poseId);
  const setPose = useStudio((s) => s.setPose);
  const poseMenu = useStudio((s) => s.poseMenu);
  const closePoseMenu = useStudio((s) => s.closePoseMenu);
  const reconstructedKit = useStudio((s) => s.reconstructedKit);
  const addReconstructedSegment = useStudio((s) => s.addReconstructedSegment);
  const duplicateReconstructedSegment = useStudio((s) => s.duplicateReconstructedSegment);
  const removeReconstructedSegment = useStudio((s) => s.removeReconstructedSegment);

  useEffect(() => {
    document.documentElement.classList.toggle("theme-light", theme === "light");
    document.documentElement.classList.toggle("theme-dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    rehydrate();
    // one pass after hydration so a layout saved at another window size
    // (or the SSR fallback) is re-fitted to this viewport
    useStudio.getState().syncPanels();
    const flush = () => useStudio.getState().saveNow();
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onHide);
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => useStudio.getState().syncPanels());
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, [rehydrate]);

  useEffect(() => {
    if (!detailsTick) return;
    setMobilePane("adjust");
  }, [detailsTick]);

  useEffect(() => {
    if (!poseMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePoseMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [poseMenu, closePoseMenu]);

  const slotDefs = useMemo<SlotDef[]>(() => {
    if (!reconstructedKit) return SLOTS;
    return reconstructedKit.segments.map((segment) => ({
      id: segment.id,
      group: segment.group,
      label: segment.label,
      socket: [0, 0, 0],
      kind: "armor",
      mirror:
        segment.mirrorOf ||
        reconstructedKit.segments.find((candidate) => candidate.mirrorOf === segment.id)?.id,
      defaultVariant: "compound",
      variants: [{ id: "compound", name: "Compound" }],
    }));
  }, [reconstructedKit]);
  const def = slotDefs.find((candidate) => candidate.id === selected);
  const st = slots[selected];
  const groupSlots = slotDefs.filter((s) => s.group === groupFilter);
  const groupVisible = groupSlots.some((s) => slots[s.id]?.visible);
  const gx = groupXform[groupFilter] ?? {
    px: 0,
    py: 0,
    pz: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    sx: 1,
    sy: 1,
    sz: 1,
  };
  const anyVisible = Object.values(slots).some((s) => s.visible);
  const selectedSegment = reconstructedKit?.segments.find((segment) => segment.id === selected);
  const selectedOperationCount = selectedSegment
    ? ((selectedSegment.mirrorOf
        ? reconstructedKit?.segments.find((segment) => segment.id === selectedSegment.mirrorOf)
        : selectedSegment
      )?.operations.length ?? 0)
    : 0;

  const importJsonFile = async (file?: File) => {
    if (!file) return;
    try {
      const imported = importJson(await file.text());
      setJsonNotice(
        imported
          ? { kind: "success", message: "Editor JSON imported." }
          : { kind: "error", message: "Could not import this JSON file." },
      );
    } catch {
      setJsonNotice({ kind: "error", message: "Could not read this JSON file." });
    }
  };

  const filteredStyles = useMemo(() => {
    return STYLES.filter((s) => {
      if (quad === "all") return true;
      return s.lineage === quad;
    });
  }, [quad]);

  const zOf = (id: string) => 30 + panelZ.indexOf(id);

  const stylePicker = !reconstructedKit && def && st && def.kind === "armor" && (
    <StylePicker
      current={st.variant}
      filtered={filteredStyles}
      quad={quad}
      onQuad={setQuad}
      onPick={(id) => setVariant(selected, id)}
      onApplyAll={(id) => applyFamily(id)}
      onApplyGroup={(id) => applyFamily(id, groupFilter)}
    />
  );

  const otherPicker = !reconstructedKit && def && st && def.kind !== "armor" && (
    <div>
      {def.kind === "extra" && (
        <div className="mb-2 flex flex-wrap gap-1">
          {EXTRA_CHIPS.map((c) => (
            <Chip
              key={c.id}
              on={extraClass === c.id}
              onClick={() => setExtraClass(c.id)}
              label={c.label}
            />
          ))}
        </div>
      )}
      <div className="grid max-h-56 grid-cols-2 gap-1 overflow-y-auto">
        {def.variants
          .filter((v) => {
            if (def.kind !== "extra" || extraClass === "all" || v.id === "none") return true;
            return (v as { cls?: string }).cls === extraClass;
          })
          .map((v) => (
            <button
              key={v.id}
              onClick={() => setVariant(selected, v.id)}
              className={cn(
                "h-9 rounded-sm border px-2 text-left text-[11px]",
                st.variant === v.id
                  ? "border-fg bg-surface text-fg"
                  : "border-border text-muted hover:text-fg",
              )}
            >
              {v.name}
            </button>
          ))}
      </div>
    </div>
  );

  const visToggle = (
    <button
      type="button"
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-surface hover:text-fg"
      aria-label={anyVisible ? "Hide all" : "Show all"}
      onClick={() => (anyVisible ? hideAllParts() : showAllParts())}
    >
      {anyVisible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
    </button>
  );

  const partsBody = (
    <div className="flex h-full min-h-0 flex-col">
      <nav className="flex items-center gap-1 overflow-x-auto border-b border-border p-2 lg:flex-wrap">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            onClick={() => setGroupFilter(g.id)}
            className={cn(
              "h-8 shrink-0 rounded-sm px-2.5 text-xs",
              groupFilter === g.id
                ? "bg-primary text-primary-foreground"
                : "text-muted hover:bg-surface hover:text-fg",
            )}
          >
            {g.label}
          </button>
        ))}
        <span className="ml-auto lg:hidden">{visToggle}</span>
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ul className="space-y-1 p-2">
          {groupSlots.length === 0 && reconstructedKit ? (
            <li className="px-2 py-6 text-center">
              <p className="font-mono text-xs text-muted">No editable parts in this group.</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={addReconstructedSegment}
              >
                <Plus className="size-3.5" />
                Add starter
              </Button>
            </li>
          ) : (
            groupSlots.map((s) => {
              const cur = slots[s.id];
              const segment = reconstructedKit?.segments.find((candidate) => candidate.id === s.id);
              const source = segment?.mirrorOf
                ? reconstructedKit?.segments.find((candidate) => candidate.id === segment.mirrorOf)
                : segment;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => setSelected(s.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm",
                      selected === s.id
                        ? "bg-surface text-fg"
                        : "text-muted hover:bg-elevated hover:text-fg",
                    )}
                  >
                    <span>{s.label}</span>
                    <span className="truncate font-mono text-[10px] text-subtle">
                      {reconstructedKit
                        ? `${source?.operations.length ?? 0} forms`
                        : variantLabel(s.id, cur?.variant ?? "")}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <div className="space-y-4 border-t border-border px-2 py-3">
          <AxisSliders
            title="Position"
            x={gx.px}
            y={gx.py}
            z={gx.pz}
            min={-0.8}
            max={0.8}
            step={0.005}
            onChange={(axis, v) =>
              patchGroupXform(groupFilter, {
                [axis === "x" ? "px" : axis === "y" ? "py" : "pz"]: v,
              })
            }
            onReset={() => resetGroupXform(groupFilter, ["px", "py", "pz"])}
          />
          <AxisSliders
            title="Rotate (°)"
            x={gx.rx}
            y={gx.ry}
            z={gx.rz}
            min={-180}
            max={180}
            step={1}
            onChange={(axis, v) =>
              patchGroupXform(groupFilter, {
                [axis === "x" ? "rx" : axis === "y" ? "ry" : "rz"]: v,
              })
            }
            onReset={() => resetGroupXform(groupFilter, ["rx", "ry", "rz"])}
          />
          {(() => {
            // group scale is a x1 multiplier; show it as a delta so neutral = 0
            const round = (n: number) => Math.round(n * 1000) / 1000;
            return (
              <AxisSliders
                title={uniformScale ? "Scale Δ (Uniform)" : "Scale Δ"}
                x={round(gx.sx - 1)}
                y={round(gx.sy - 1)}
                z={round(gx.sz - 1)}
                min={-0.9}
                max={1.4}
                step={0.01}
                onChange={(axis, v) =>
                  patchGroupXform(
                    groupFilter,
                    uniformScale
                      ? { sx: round(1 + v), sy: round(1 + v), sz: round(1 + v) }
                      : { [axis === "x" ? "sx" : axis === "y" ? "sy" : "sz"]: round(1 + v) },
                  )
                }
                onReset={() => resetGroupXform(groupFilter, ["sx", "sy", "sz"])}
              />
            );
          })()}
        </div>
      </div>
      <div className="border-t border-border p-2">
        <div className="mb-2 flex gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setGroupVisible(groupFilter, !groupVisible)}
          >
            {groupVisible ? "Hide" : "Show"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => resetGroupDefault(groupFilter)}>
            Default
          </Button>
        </div>
        <p className="mb-1 text-[11px] text-muted">Explode</p>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={explode}
          onChange={(e) => setExplode(Number(e.target.value))}
          className="h-8 w-full accent-fg"
        />
      </div>
    </div>
  );

  const adjustBody = def && st && (
    <div className="h-full overflow-y-auto">
      <div className="px-3 pt-3 pb-3">
        <h2 className="font-display text-lg tracking-tight">{def.label}</h2>
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-xs text-muted">
            {reconstructedKit
              ? `${selectedOperationCount} CSG form${selectedOperationCount === 1 ? "" : "s"}`
              : variantLabel(selected, st.variant)}
          </p>
          {reconstructedKit && selectedSegment && (
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="iconSm"
                variant="ghost"
                aria-label={`Duplicate ${def.label}`}
                title="Duplicate segment"
                onClick={() => duplicateReconstructedSegment(selected)}
              >
                <Copy className="size-3.5" />
              </Button>
              <Button
                size="iconSm"
                variant="ghost"
                aria-label={`Remove ${def.label}`}
                title="Remove segment"
                onClick={() => removeReconstructedSegment(selected)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-b border-border px-3 py-3">
        {stylePicker}
        {otherPicker}
      </div>

      <div className="border-b border-border px-3 py-3">
        <HsbSliders
          title="Part 1 Color"
          hex={st.paint ?? reconstructedKit?.palette.primary ?? getRecipe(st.variant).palette.prim}
          onChange={(hex) => patchSlot(selected, { paint: hex })}
        />
        <div className="mb-4 flex gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              applyPaint(
                st.paint ?? reconstructedKit?.palette.primary ?? getRecipe(st.variant).palette.prim,
                def.group,
              )
            }
          >
            Group
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              applyPaint(
                st.paint ?? reconstructedKit?.palette.primary ?? getRecipe(st.variant).palette.prim,
              )
            }
          >
            Body
          </Button>
        </div>
        <HsbSliders
          title="Part 2 Color"
          hex={
            st.paint2 ?? reconstructedKit?.palette.secondary ?? getRecipe(st.variant).palette.sec
          }
          onChange={(hex) => patchSlot(selected, { paint2: hex })}
        />
        <div className="mb-4 flex gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              applyPaint2(
                st.paint2 ??
                  reconstructedKit?.palette.secondary ??
                  getRecipe(st.variant).palette.sec,
                def.group,
              )
            }
          >
            Group
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              applyPaint2(
                st.paint2 ??
                  reconstructedKit?.palette.secondary ??
                  getRecipe(st.variant).palette.sec,
              )
            }
          >
            Body
          </Button>
        </div>
        <HsbSliders
          title="Light Color"
          hex={light || slots.visor?.paint || DEFAULT_VISOR}
          onChange={(hex) => setLight(hex)}
        />
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => applyVisorPaint(light || DEFAULT_VISOR, def.group)}
          >
            Group
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => applyVisorPaint(light || DEFAULT_VISOR)}
          >
            Body
          </Button>
        </div>
      </div>

      <div className="border-b border-border px-3 py-3 space-y-4">
        <AxisSliders
          title="Position"
          x={st.px}
          y={st.py}
          z={st.pz}
          min={-0.8}
          max={0.8}
          step={0.005}
          onChange={(axis, v) =>
            patchSlot(selected, { [axis === "x" ? "px" : axis === "y" ? "py" : "pz"]: v })
          }
          onReset={() => patchSlot(selected, { px: 0, py: 0, pz: 0 })}
        />
        <AxisSliders
          title="Rotate (°)"
          x={st.rx}
          y={st.ry}
          z={st.rz}
          min={-180}
          max={180}
          step={1}
          onChange={(axis, v) =>
            patchSlot(selected, { [axis === "x" ? "rx" : axis === "y" ? "ry" : "rz"]: v })
          }
          onReset={() => patchSlot(selected, { rx: 0, ry: 0, rz: 0 })}
        />
        {(() => {
          // some parts carry a baked default scale; the sliders show the user's
          // DELTA from it, so a fresh part reads 0 like Position / Rotate
          const ds = defaultScaleFor(selected);
          const round = (n: number) => Math.round(n * 1000) / 1000;
          return (
            <AxisSliders
              title={uniformScale ? "Scale Δ (Uniform)" : "Scale Δ"}
              x={round(st.sx - ds.sx)}
              y={round(st.sy - ds.sy)}
              z={round(st.sz - ds.sz)}
              min={-0.9}
              max={1.4}
              step={0.01}
              onChange={(axis, v) =>
                patchSlot(
                  selected,
                  uniformScale
                    ? { sx: round(ds.sx + v), sy: round(ds.sy + v), sz: round(ds.sz + v) }
                    : {
                        [axis === "x" ? "sx" : axis === "y" ? "sy" : "sz"]: round(
                          (axis === "x" ? ds.sx : axis === "y" ? ds.sy : ds.sz) + v,
                        ),
                      },
                )
              }
              onReset={() => patchSlot(selected, defaultScaleFor(selected))}
            />
          );
        })()}
      </div>

      <div className="px-3 py-3">
        <div className="mb-3 flex flex-wrap gap-2">
          <Toggle on={symmetry} onClick={() => toggle("symmetry")} label="Mirror" />
          <Toggle on={uniformScale} onClick={() => toggle("uniformScale")} label="Uniform" />
          <Toggle on={edges} onClick={() => toggle("edges")} label="Edges" />
          <Toggle on={autoRotate} onClick={() => toggle("autoRotate")} label="Turntable" />
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => patchSlot(selected, { visible: !st.visible })}
          >
            {st.visible ? "Hide" : "Show"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => resetSlotDefault(selected)}>
            Default
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-bg text-fg">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <img
          src="/MOSA.png"
          alt="MOSA"
          className={cn(
            "h-[22px] w-auto shrink-0 select-none",
            theme === "light" && "brightness-0",
          )}
        />
        <p className="hidden min-w-0 flex-1 truncate font-mono text-[10px] leading-none text-muted lg:block">
          Modular Omni-Support Automata / Mimetic Operating System Architecture
        </p>
        <div className="ml-auto flex items-center gap-1">
          <ThumbnailImporter />
          {reconstructedKit && (
            <span className="hidden rounded-sm border border-border px-2 py-1 font-mono text-[10px] text-muted xl:inline">
              {reconstructedKit.segments.length} dynamic parts
            </span>
          )}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Unit name / ID"
            className="h-8 w-44 rounded-sm border border-border bg-elevated px-2 font-mono text-xs sm:w-64"
            aria-label="Unit name and identification"
          />
          <Button
            size="iconSm"
            variant="ghost"
            aria-label="Theme"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
          </Button>
          <Button
            size="iconSm"
            variant="ghost"
            onClick={refreshAll}
            className="hidden sm:inline-flex"
            aria-label="Reset panels"
          >
            <RefreshCw className="size-4" />
          </Button>
          {!reconstructedKit && (
            <Button
              size="iconSm"
              variant="ghost"
              onClick={randomMix}
              className="hidden sm:inline-flex"
              aria-label="Random"
            >
              <Dices className="size-4" />
            </Button>
          )}
          <Button size="iconSm" variant="ghost" onClick={saveNow} aria-label="Save">
            <Save className="size-4" />
          </Button>
          <Button
            size="iconSm"
            variant="ghost"
            aria-label="Export"
            onClick={() => {
              const blob = new Blob([exportJson()], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `${name || "frame"}.json`;
              a.click();
            }}
          >
            <Download className="size-4" />
          </Button>
          <label
            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-sm hover:bg-surface"
            title="Import editor JSON"
          >
            <Upload className="size-4" />
            <input
              type="file"
              accept="application/json"
              className="hidden"
              aria-label="Import editor JSON"
              onChange={(e) => {
                void importJsonFile(e.target.files?.[0]).finally(() => {
                  e.target.value = "";
                });
              }}
            />
          </label>
          <Button
            size="iconSm"
            variant="ghost"
            aria-label="Capture"
            onClick={() => {
              const cap = (window as unknown as { __frameMixCapture?: () => string })
                .__frameMixCapture;
              if (!cap) return;
              const a = document.createElement("a");
              a.href = cap();
              a.download = `${name || "frame"}.png`;
              a.click();
            }}
          >
            <Camera className="size-4" />
          </Button>
        </div>
      </header>
      {jsonNotice && (
        <div
          role={jsonNotice.kind === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-none fixed top-14 left-1/2 z-[100] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md border bg-elevated/95 px-3 py-2 font-mono text-xs shadow-sm backdrop-blur-sm",
            jsonNotice.kind === "error" ? "border-signal text-signal" : "border-border text-fg",
          )}
        >
          {jsonNotice.message}
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {!lg && (
          <aside
            className={cn(
              "order-2 flex min-h-0 shrink-0 flex-col border-border lg:hidden",
              mobilePane === "parts" ? "flex max-h-[40%] border-t" : "hidden",
            )}
          >
            {partsBody}
          </aside>
        )}

        <section className="relative order-1 min-h-[38vh] min-w-0 flex-1 overflow-hidden bg-bg lg:order-2 lg:min-h-0">
          {mounted ? <HangarCanvas /> : <HangarFallback />}
          {mounted && poseMenu && (
            <PoseMenu x={poseMenu.x} y={poseMenu.y} poseId={poseId} onPick={setPose} />
          )}
          <p className="pointer-events-none absolute bottom-3 right-3 hidden font-mono text-[11px] text-subtle sm:block">
            Drag to orbit
          </p>
          {mounted && (
            <div className="hidden lg:block">
              {panels.parts && (
                <FloatPanel
                  title="Parts"
                  rect={panels.parts}
                  z={zOf("parts")}
                  onChange={(p) => setPanel("parts", p)}
                  onReset={() => resetPanel("parts")}
                  onFocus={() => focusPanel("parts")}
                  extra={visToggle}
                >
                  {partsBody}
                </FloatPanel>
              )}
              {panels.adjust && (
                <FloatPanel
                  title="Details"
                  rect={panels.adjust}
                  z={zOf("adjust")}
                  onChange={(p) => setPanel("adjust", p)}
                  onReset={() => resetPanel("adjust")}
                  onFocus={() => focusPanel("adjust")}
                  extra={
                    <button
                      type="button"
                      className="inline-flex size-7 items-center justify-center rounded-sm text-muted hover:bg-surface hover:text-fg"
                      aria-label="Reset camera"
                      onClick={resetCamera}
                    >
                      <svg
                        viewBox="0 0 16 16"
                        className="size-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <circle cx="8" cy="8" r="5.5" />
                        <circle cx="8" cy="8" r="2.25" />
                      </svg>
                    </button>
                  }
                >
                  {adjustBody}
                </FloatPanel>
              )}
            </div>
          )}
        </section>

        {!lg && (
          <aside
            className={cn(
              "order-3 w-full max-w-none shrink-0 flex-col border-border lg:hidden",
              mobilePane === "adjust" ? "flex max-h-[44%] overflow-y-auto border-t" : "hidden",
            )}
          >
            {adjustBody}
          </aside>
        )}

        <div className="order-4 grid grid-cols-2 border-t border-border lg:hidden">
          <button
            className={cn(
              "h-11 text-sm",
              mobilePane === "parts" ? "bg-surface text-fg" : "text-muted",
            )}
            onClick={() => setMobilePane("parts")}
          >
            Parts
          </button>
          <button
            className={cn(
              "h-11 text-sm",
              mobilePane === "adjust" ? "bg-surface text-fg" : "text-muted",
            )}
            onClick={() => setMobilePane("adjust")}
          >
            Details
          </button>
        </div>
      </div>
    </div>
  );
}

function PoseIcon({ kind }: { kind: string }) {
  const p = {
    className: "size-6",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.7",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const;
  if (kind === "attention") {
    // stiff: feet together, arms clamped to the sides
    return (
      <svg viewBox="0 0 24 24" {...p}>
        <circle cx="12" cy="4.4" r="2.3" />
        <path d="M12 6.8v8.4" />
        <path d="M9.5 8v6.6M14.5 8v6.6" />
        <path d="M12 15.2 10.8 21.6M12 15.2 13.2 21.6" />
      </svg>
    );
  }
  if (kind === "relaxed") {
    // natural idle: arms hanging with a small gap, feet a little apart
    return (
      <svg viewBox="0 0 24 24" {...p}>
        <circle cx="12" cy="4.2" r="2.3" />
        <path d="M12 6.5v8" />
        <path d="M12 8 8.6 14.4M12 8l3.4 6.4" />
        <path d="M12 14.5 9 21.6M12 14.5l3 7.1" />
      </svg>
    );
  }
  if (kind === "flight") {
    // pitched forward, arms tucked back, legs streamed behind + speed lines
    return (
      <svg viewBox="0 0 24 24" {...p}>
        <g transform="rotate(-34 12 12)">
          <circle cx="12" cy="4.6" r="2.2" />
          <path d="M12 6.8v8.6" />
          <path d="M12 8.6 8.8 12M12 8.6l-2.6 3.8" />
          <path d="M12 15.4 10.4 21.6M12 15.4l1.8 6.2" />
        </g>
        <path d="M2.5 15.5h4M2 19h6" opacity="0.7" />
      </svg>
    );
  }
  if (kind === "shooting") {
    // bladed stance, lead arm extended straight, rear arm braced
    return (
      <svg viewBox="0 0 24 24" {...p}>
        <circle cx="15" cy="4.4" r="2.2" />
        <path d="M15 6.6v7" />
        <path d="M15 8.6 4 8" />
        <path d="M15 10.6h-3.4v2.6" />
        <path d="M15 13.6 10.8 21.6M15 13.6 18.4 20.4" />
      </svg>
    );
  }
  if (kind === "sword") {
    // wide low stance, saber arm out to the side + long blade, shield arm crossed
    return (
      <svg viewBox="0 0 24 24" {...p}>
        <circle cx="11" cy="4.6" r="2.2" />
        <path d="M11 6.8v6" />
        <path d="M11 8.6 17.5 7" />
        <path d="M17.5 7 23 2.6" strokeWidth="2.3" />
        <path d="M11 10.2 7.6 9.6" />
        <path d="M11 12.8 6 17l-1.2 4.6M11 12.8 16 17l1.4 4.6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" {...p}>
      <circle cx="12" cy="4.2" r="2.3" />
      <path d="M12 6.5v8" />
      <path d="M12 8 8.6 14.4M12 8l3.4 6.4" />
      <path d="M12 14.5 9 21.6M12 14.5l3 7.1" />
    </svg>
  );
}

function PoseMenu({
  x,
  y,
  poseId,
  onPick,
}: {
  x: number;
  y: number;
  poseId: string;
  onPick: (id: string) => void;
}) {
  const left = `clamp(8px, ${x + 6}px, calc(100% - 268px))`;
  const top = `clamp(8px, ${y + 6}px, calc(100% - 60px))`;
  const items: { id: string; label: string }[] = [
    { id: "relaxed", label: "Relaxed stance" },
    { id: "attention", label: "Attention pose" },
    { id: "flight", label: "Flight pose" },
    { id: "shooting", label: "Shooting pose" },
    { id: "sword", label: "Sword-strike pose" },
  ];
  return (
    <div
      data-pose-menu
      role="menu"
      aria-label="Posing"
      className="pose-menu absolute z-50 flex rounded-md border border-border bg-elevated/95 p-1 shadow-sm backdrop-blur-sm"
      style={{ left, top }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="menuitem"
          aria-label={it.label}
          aria-pressed={poseId === it.id}
          onClick={() => onPick(it.id)}
          className={cn(
            "flex size-11 items-center justify-center rounded-sm text-muted transition-[background-color,color] duration-[var(--motion-quick)] ease-[var(--ease-out)] hover:bg-surface hover:text-fg",
            poseId === it.id && "bg-surface text-fg",
          )}
        >
          <PoseIcon kind={it.id} />
        </button>
      ))}
    </div>
  );
}

function StylePicker({
  current,
  filtered,
  quad,
  onQuad,
  onPick,
  onApplyAll,
  onApplyGroup,
}: {
  current: string;
  filtered: typeof STYLES;
  quad: string;
  onQuad: (v: string) => void;
  onPick: (id: string) => void;
  onApplyAll: (id: string) => void;
  onApplyGroup: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted">ID</p>
      <div className="mb-2 flex flex-wrap gap-1">
        <Chip on={quad === "all"} onClick={() => onQuad("all")} label="TTL" />
        {QUAD_RANGES.map((q) => (
          <Chip key={q.id} on={quad === q.id} onClick={() => onQuad(q.id)} label={q.id} />
        ))}
      </div>
      <div className="mb-2 grid max-h-48 grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-1 overflow-y-auto">
        {filtered.map((s) => (
          <button
            key={s.id}
            onClick={() => onPick(s.id)}
            className={cn(
              "h-8 w-full rounded-sm border px-1 font-mono text-[10px]",
              current === s.id
                ? "border-fg bg-surface text-fg"
                : "border-border text-muted hover:text-fg",
            )}
          >
            {s.id}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant="outline" onClick={() => onApplyGroup(current)}>
          Group
        </Button>
        <Button size="sm" variant="outline" onClick={() => onApplyAll(current)}>
          Body
        </Button>
      </div>
    </div>
  );
}

function Chip({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-7 rounded-sm border px-2 text-[11px]",
        on ? "border-fg bg-surface text-fg" : "border-border text-muted",
      )}
    >
      {label}
    </button>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-8 rounded-sm border px-2 text-[11px]",
        on ? "border-fg bg-surface text-fg" : "border-border text-muted",
      )}
    >
      {label}
    </button>
  );
}

function HangarFallback() {
  return <div className="h-full w-full bg-bg" />;
}
