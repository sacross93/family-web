"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Sparkles,
  Plus,
  Check,
  RotateCw,
  X,
  Move,
  ChevronsUp,
  ChevronsDown,
} from "lucide-react";
import type { Decoration } from "@prisma/client";
import { cn } from "@/lib/utils";
import { sized, sizedSrcSet } from "@/lib/img";
import { MAX_EDGE, shrinkForUpload } from "@/lib/image-upload";
import { Button } from "@/components/ui";


// z-index (같은 컨테이너): back<10=콘텐츠 뒤, 콘텐츠=10, front>10=콘텐츠 앞, 선택=50
const BACK_Z = 2;
const FRONT_Z = 20;
const CONTENT_Z = 10;
const isFrontZ = (z: number) => z >= CONTENT_Z;

type DragMode = "move" | "resize" | "rotate";
interface DragState {
  id: string;
  mode: DragMode;
  startClientX: number;
  startClientY: number;
  startXPct: number;
  startYPx: number;
  startWidth: number;
  startRotation: number;
  rectW: number;
  cx: number;
  cy: number;
  startDist: number;
  startAngle: number;
  latest: { xPct: number; yPx: number; width: number; rotation: number };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * 재사용 꾸미기 표면.
 * - variant "page": 전역 페이지(관리자). 편집 상태 localStorage 유지, 우하단 floating 버튼 + 하단 고정 툴바.
 * - variant "embedded": 게시글/계획 등 특정 영역. 표면 우상단 인라인 버튼/툴바.
 */
export function DecorationSurface({
  surfaceKey,
  canEdit,
  variant = "embedded",
  clip = false,
  className,
  children,
  editing: controlledEditing,
  onEditingChange,
  showTrigger = true,
}: {
  surfaceKey: string;
  canEdit: boolean;
  variant?: "page" | "embedded";
  clip?: boolean;
  className?: string;
  children: ReactNode;
  /** 제어 모드: 부모가 편집 상태를 관리 (게시글/계획의 외부 버튼) */
  editing?: boolean;
  onEditingChange?: (b: boolean) => void;
  /** 자체 "꾸미기" 트리거 버튼 표시 여부 (embedded) */
  showTrigger?: boolean;
}) {
  const [items, setItems] = useState<Decoration[]>([]);
  const [internalEditing, setInternalEditing] = useState(false);
  const editing = controlledEditing !== undefined ? controlledEditing : internalEditing;
  const setEditing = useCallback(
    (b: boolean) => {
      onEditingChange?.(b);
      if (controlledEditing === undefined) setInternalEditing(b);
    },
    [onEditingChange, controlledEditing]
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const measureRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // page 변형의 편집 상태와 그 유지(localStorage `podong_edit_mode`)는 AppShell 이 쥔다 —
  // 켜는 버튼이 상단바·사이드바·드로어에 흩어져 있어 여기서는 한 벌로 다룰 수 없다.

  useEffect(() => {
    let alive = true;
    fetch(`/api/decorations?page=${encodeURIComponent(surfaceKey)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => alive && setItems(data))
      .catch(() => {});
    // 표면이 바뀌면 고른 스티커도 의미가 없어진다. 같은 효과 안에서 함께 비운다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedId(null);
    return () => {
      alive = false;
    };
  }, [surfaceKey]);

  const patch = useCallback((id: string, data: Partial<Decoration>) => {
    fetch(`/api/decorations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => {});
  }, []);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const next = { ...d.latest };
      if (d.mode === "move") {
        const dx = e.clientX - d.startClientX;
        const dy = e.clientY - d.startClientY;
        next.xPct = clamp(d.startXPct + (dx / d.rectW) * 100, -5, 105);
        next.yPx = Math.max(0, d.startYPx + dy);
      } else if (d.mode === "resize") {
        const dist = Math.hypot(e.clientX - d.cx, e.clientY - d.cy);
        const ratio = d.startDist > 4 ? dist / d.startDist : 1;
        next.width = clamp(Math.round(d.startWidth * ratio), 40, 1200);
      } else if (d.mode === "rotate") {
        const ang = Math.atan2(e.clientY - d.cy, e.clientX - d.cx);
        next.rotation =
          Math.round((d.startRotation + ((ang - d.startAngle) * 180) / Math.PI) * 10) / 10;
      }
      d.latest = next;
      setItems((prev) => prev.map((it) => (it.id === d.id ? { ...it, ...next } : it)));
    }
    function onUp() {
      const d = dragRef.current;
      if (!d) return;
      patch(d.id, d.latest);
      dragRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [patch]);

  useEffect(() => {
    if (!editing) return;
    function onDown(e: PointerEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest(`[data-sticker="${surfaceKey}"]`) && !t.closest(`[data-deco-ui="${surfaceKey}"]`)) {
        setSelectedId(null);
      }
    }
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [editing, surfaceKey]);

  function startDrag(e: React.PointerEvent, item: Decoration, mode: DragMode) {
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = measureRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSelectedId(item.id);
    const cx = rect.left + (item.xPct / 100) * rect.width;
    const cy = rect.top + item.yPx;
    dragRef.current = {
      id: item.id,
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startXPct: item.xPct,
      startYPx: item.yPx,
      startWidth: item.width,
      startRotation: item.rotation,
      rectW: rect.width,
      cx,
      cy,
      startDist: Math.hypot(e.clientX - cx, e.clientY - cy),
      startAngle: Math.atan2(e.clientY - cy, e.clientX - cx),
      latest: { xPct: item.xPct, yPx: item.yPx, width: item.width, rotation: item.rotation },
    };
  }

  function toggleLayer(item: Decoration) {
    const z = isFrontZ(item.z) ? BACK_Z : FRONT_Z;
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, z } : it)));
    patch(item.id, { z });
  }

  async function addSticker(file: File) {
    setUploading(true);
    try {
      // 스티커는 화면에서 300px 이하로 그려진다. 폰 원본(4000px·3MB)을 그대로 올리면
      // 홈을 열 때마다 그만큼을 받는다 — 실제로 2.2MB 짜리가 올라가 있었다.
      const fd = new FormData();
      fd.append("file", await shrinkForUpload(file, MAX_EDGE.sticker));
      const up = await fetch("/api/upload", { method: "POST", body: fd });
      const { urls } = await up.json();
      const url = urls?.[0];
      if (!url) return;
      const rect = measureRef.current?.getBoundingClientRect();
      const yPx = rect
        ? clamp(window.innerHeight / 2 - rect.top, 40, Math.max(60, rect.height - 40))
        : 120;
      const rotation = Math.round((Math.random() * 16 - 8) * 10) / 10;
      const res = await fetch("/api/decorations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: surfaceKey, url, xPct: 50, yPx, width: 150, rotation, z: FRONT_Z }),
      });
      if (res.ok) {
        const created: Decoration = await res.json();
        setItems((prev) => [...prev, created]);
        setSelectedId(created.id);
      }
    } finally {
      setUploading(false);
    }
  }

  function removeSticker(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    if (selectedId === id) setSelectedId(null);
    fetch(`/api/decorations/${id}`, { method: "DELETE" }).catch(() => {});
  }

  function renderSticker(d: Decoration) {
    const selected = editing && selectedId === d.id;
    const front = isFrontZ(d.z);
    return (
      <div
        key={d.id}
        data-sticker={surfaceKey}
        className="absolute"
        style={{
          // 보기 모드에서는 스티커가 화면 밖으로 나가지 않게 가둔다.
          //
          // 자리는 `xPct`(가운데, %)로 저장된다. 데스크톱(내용 폭 ~1160px)에서 오른쪽
          // 끝에 붙여 둔 92% 짜리 150px 스티커는 폰(358px)에서 286~436px 을 차지해
          // **46px 이 화면 밖으로 나간다**. 실제로 가족이 홈에 붙여 둔 사진이 그랬고,
          // 폰에서는 인사말 위에 반쯤 걸쳐 잘린 채로 보였다.
          //
          // 저장값은 건드리지 않는다 — 그리는 자리만 가둔다. 그래서 넓은 화면에서는
          // 붙여 둔 그대로 보이고, 좁은 화면에서만 안쪽으로 들어온다.
          // 편집 중에는 가두지 않는다: 끌고 있는 손가락과 그림이 어긋나면 안 된다.
          left: editing
            ? `${d.xPct}%`
            : `clamp(${d.width / 2}px, ${d.xPct}%, calc(100% - ${d.width / 2}px))`,
          top: `${d.yPx}px`,
          width: `${d.width}px`,
          transform: `translate(-50%, -50%) rotate(${d.rotation}deg)`,
          zIndex: selected ? 50 : d.z,
          pointerEvents: editing ? "auto" : "none",
          touchAction: "none",
        }}
      >
        <img
          // **줄여서 받는다.** 홈 스티커 한 장이 2,208KB 였다(운영 실측) — 폰으로 홈을
          // 열 때마다 그만큼을 내려받았다. 원본은 저장소에 그대로 있고 화면에만 줄인 것이 온다.
          // 편집 중에는 원본을 쓴다: 크기를 키우는 중에 주소가 계속 바뀌면 그때마다 다시
          // 받느라 깜빡이고, 어차피 편집은 한 사람이 잠깐 하는 일이다.
          src={editing ? d.url : sized(d.url, d.width)}
          srcSet={editing ? undefined : sizedSrcSet(d.url, d.width)}
          alt=""
          draggable={false}
          onPointerDown={(e) => startDrag(e, d, "move")}
          className={cn(
            "block w-full select-none",
            editing && "cursor-move",
            selected && "rounded-sm outline-2 outline-dashed outline-primary outline-offset-4"
          )}
          style={{ filter: "drop-shadow(0 6px 14px rgba(80,70,120,.18))" }}
        />
        {selected && (
          <>
            <HandleBtn surfaceKey={surfaceKey} label="회전" style={{ top: -36, left: "50%", transform: "translateX(-50%)", cursor: "grab" }} onPointerDown={(e) => startDrag(e, d, "rotate")} tone="primary">
              <RotateCw className="h-3.5 w-3.5" />
            </HandleBtn>
            <HandleBtn surfaceKey={surfaceKey} label="크기 조절" style={{ right: -14, bottom: -14, cursor: "nwse-resize" }} onPointerDown={(e) => startDrag(e, d, "resize")}>
              <Move className="h-3.5 w-3.5" />
            </HandleBtn>
            <button
              type="button"
              data-deco-ui={surfaceKey}
              aria-label={front ? "뒤로 보내기" : "앞으로 가져오기"}
              title={front ? "콘텐츠 뒤로 보내기" : "콘텐츠 앞으로 가져오기"}
              onClick={() => toggleLayer(d)}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute flex h-7 items-center gap-0.5 rounded-full bg-surface px-2 text-[0.6875rem] font-bold text-primary-ink shadow-md ring-1 ring-line"
              style={{ left: -8, bottom: -14 }}
            >
              {front ? <ChevronsDown className="h-3.5 w-3.5" /> : <ChevronsUp className="h-3.5 w-3.5" />}
              {front ? "뒤로" : "앞으로"}
            </button>
            <button
              type="button"
              data-deco-ui={surfaceKey}
              aria-label="삭제"
              onClick={() => removeSticker(d.id)}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute flex h-7 w-7 items-center justify-center rounded-full bg-danger text-white shadow-md"
              style={{ left: -14, top: -14 }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={cn("relative", clip && !editing && "overflow-hidden", className)}>
      <div ref={measureRef} className="pointer-events-none absolute inset-0" aria-hidden />

      {items.map(renderSticker)}

      <div className={cn("relative", editing && "pointer-events-none")} style={{ zIndex: CONTENT_Z }}>
        {children}
      </div>

      {canEdit && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) addSticker(f);
              e.target.value = "";
            }}
          />

          {variant === "page" ? (
            // 켜는 버튼은 여기 없다 — 셸의 상단바/사이드바에 있다. 떠다니는 버튼을 하나라도
            // 줄여야 물어보기 FAB 만 남고, 그래야 목록 한가운데를 가리지 않는다.
            editing && (
              <div
                data-deco-ui={surfaceKey}
                className="fixed left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-surface/95 px-3 py-2 shadow-lg backdrop-blur"
                style={{ bottom: "calc(var(--bottom-bar) + 0.75rem)" }}
              >
                <span className="hidden px-2 text-xs font-medium text-ink-soft md:inline">
                  🎨 끌어서 이동 · 모서리로 크기·회전 · <b>앞/뒤</b> 버튼으로 위치
                </span>
                <ToolbarButtons
                  uploading={uploading}
                  onAdd={() => fileRef.current?.click()}
                  onDone={() => {
                    setEditing(false);
                    setSelectedId(null);
                  }}
                />
              </div>
            )
          ) : (
            <>
              {!editing && showTrigger && (
                <button
                  type="button"
                  data-deco-ui={surfaceKey}
                  onClick={() => setEditing(true)}
                  className="absolute right-2 top-2 z-[45] flex items-center gap-1 rounded-full bg-surface/90 px-2.5 py-1.5 text-xs font-semibold text-primary-ink shadow-sm ring-1 ring-line backdrop-blur transition hover:bg-surface"
                >
                  <Sparkles className="h-3.5 w-3.5" /> 꾸미기
                </button>
              )}
              {editing && (
                <div
                  data-deco-ui={surfaceKey}
                  className="absolute bottom-2 left-1/2 z-[45] flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-surface/95 px-2 py-1.5 shadow-md backdrop-blur"
                >
                  <ToolbarButtons
                    uploading={uploading}
                    onAdd={() => fileRef.current?.click()}
                    onDone={() => {
                      setEditing(false);
                      setSelectedId(null);
                    }}
                  />
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function ToolbarButtons({
  uploading,
  onAdd,
  onDone,
}: {
  uploading: boolean;
  onAdd: () => void;
  onDone: () => void;
}) {
  // 손으로 만든 <button> 이었는데 그래서 두 가지가 어긋나 있었다:
  //  - 폰에서 **36px** (사이트 규칙은 40px). `Button` 의 `sm` 이 `h-10 lg:h-9` 로 맞춰 준다.
  //  - `whitespace-nowrap` 이 없어 폰에서 **"사진 / 추가"** 로 접혔다. 알약 안에서 두 줄이 됐다.
  // 끝내는 말도 상단바와 달랐다 — 같은 동작(편집 끄기)인데 위는 `마치기`, 여기는 `완료`.
  // 한 동작은 흐름 내내 한 이름으로 부른다(DESIGN.md §8).
  return (
    <>
      <Button variant="soft" size="sm" onClick={onAdd} disabled={uploading}>
        <Plus className="h-4 w-4" /> {uploading ? "올리는 중…" : "사진 추가"}
      </Button>
      <Button size="sm" onClick={onDone}>
        <Check className="h-4 w-4" /> 마치기
      </Button>
    </>
  );
}

function HandleBtn({
  surfaceKey,
  label,
  style,
  onPointerDown,
  tone,
  children,
}: {
  surfaceKey: string;
  label: string;
  style: React.CSSProperties;
  onPointerDown: (e: React.PointerEvent) => void;
  tone?: "primary";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-deco-ui={surfaceKey}
      aria-label={label}
      onPointerDown={onPointerDown}
      className={cn(
        "absolute flex h-7 w-7 items-center justify-center rounded-full shadow-md",
        tone === "primary"
          ? "bg-primary text-ink"
          : "bg-surface text-primary ring-1 ring-line"
      )}
      style={style}
    >
      {children}
    </button>
  );
}
