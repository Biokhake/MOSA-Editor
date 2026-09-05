import { useRef, useState } from "react";
import { ImagePlus, LoaderCircle, Undo2 } from "lucide-react";
import { analyzeThumbnail } from "@/lib/mech/reconstruction/analyze";
import { useStudio } from "@/lib/mech/store";
import { cn } from "@/lib/utils";

async function imageDataUrl(file: File): Promise<string> {
  if (!/^image\/(png|jpeg)$/.test(file.type))
    throw new Error("PNG 또는 JPEG 썸네일을 선택해 주세요.");
  if (file.size > 20 * 1024 * 1024) throw new Error("이미지는 20 MB 이하여야 합니다.");
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const next = new Image();
    next.onload = () => resolve(next);
    next.onerror = () => reject(new Error("이미지를 해석하지 못했습니다."));
    next.src = raw;
  });
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  if (scale === 1 && raw.length < 8_000_000) return raw;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("이미지 변환을 시작하지 못했습니다.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

export function ThumbnailImporter() {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{
    phase: "idle" | "working" | "error" | "done";
    message?: string;
  }>({ phase: "idle" });
  const kit = useStudio((s) => s.reconstructedKit);
  const loadKit = useStudio((s) => s.loadReconstructedKit);
  const clearKit = useStudio((s) => s.clearReconstructedKit);

  const select = async (file?: File) => {
    if (!file || state.phase === "working") return;
    setState({
      phase: "working",
      message: "썸네일에서 전체 조형과 편집 파츠를 설계하고 있습니다…",
    });
    try {
      const data = await imageDataUrl(file);
      const result = await analyzeThumbnail({ data: { imageDataUrl: data, fileName: file.name } });
      if (!result.ok) throw new Error(result.error);
      loadKit(result.kit);
      setState({
        phase: "done",
        message: `${result.kit.segments.length}개 편집 파츠로 재구성했습니다.`,
      });
    } catch (error) {
      setState({
        phase: "error",
        message: error instanceof Error ? error.message : "재구성에 실패했습니다.",
      });
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(event) => void select(event.target.files?.[0])}
      />
      <button
        type="button"
        disabled={state.phase === "working"}
        onClick={() => input.current?.click()}
        className="inline-flex h-8 items-center gap-2 rounded-sm border border-border bg-elevated px-2.5 text-xs text-fg transition-colors hover:bg-surface disabled:cursor-wait disabled:opacity-60"
        title="메카 썸네일 한 장에서 편집 가능한 3D 키트를 만듭니다"
      >
        {state.phase === "working" ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <ImagePlus className="size-4" />
        )}
        <span className="hidden sm:inline">Thumbnail to kit</span>
      </button>
      {kit && (
        <button
          type="button"
          onClick={() => {
            clearKit();
            setState({ phase: "idle" });
          }}
          className="inline-flex size-8 items-center justify-center rounded-sm text-muted hover:bg-surface hover:text-fg"
          aria-label="Unload reconstructed kit"
          title="기본 편집기로 돌아가기"
        >
          <Undo2 className="size-4" />
        </button>
      )}
      {state.phase !== "idle" && state.message && (
        <div
          role="status"
          className={cn(
            "pointer-events-none fixed top-14 left-1/2 z-[100] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md border bg-elevated/95 px-3 py-2 font-mono text-xs shadow-sm backdrop-blur-sm",
            state.phase === "error" ? "border-signal text-signal" : "border-border text-fg",
          )}
        >
          {state.message}
        </div>
      )}
    </>
  );
}
