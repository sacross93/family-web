"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "./icon-button";

export interface ItemAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  /** 삭제처럼 되돌리기 어려운 것 */
  danger?: boolean;
}

/**
 * 목록 항목의 액션들. 한 항목에 버튼을 두세 개씩 달면 목록이 시끄러워진다 —
 * 기념일 6건이면 아이콘이 12개였고, 게시판 4건이면 16개였다.
 *
 * - 폰: `…` 하나만 늘 보인다. 누르면 이름이 적힌 줄로 펼쳐진다.
 *   숨기는 게 아니라 **모으는** 것이다(AGENTS.md "hover 로만 뜨는 액션 금지").
 *   이름을 적는 쪽이 아이콘만 있는 것보다 부모님·아이에게 분명하다.
 * - 데스크톱: 예전처럼 카드에 손을 얹으면 아이콘이 뜬다. 넓으니 시끄럽지 않다.
 */
export function ItemActions({
  actions,
  className,
}: {
  actions: ItemAction[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // 바깥을 누르면 닫는다. `fixed inset-0` 짜리 덮개를 쓰면 안 된다 —
    // 게시판 쪽지처럼 조상에 transform 이 걸린 곳에서는 fixed 가 화면이 아니라
    // 그 조상 기준으로 놓여, 쪽지 밖을 누르면 아무 일도 일어나지 않는다.
    const onDown = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("absolute right-3 top-3 z-20", className)}>
      {/* ── 폰: … 하나 ── */}
      <div className="lg:hidden">
        <IconButton
          variant="surface"
          size="sm"
          aria-label="더보기"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <MoreHorizontal className="h-4 w-4" />
        </IconButton>
        {open && (
          <div
            data-item-menu
            className="absolute right-0 top-9 z-20 flex min-w-[7.5rem] flex-col overflow-hidden rounded-2xl border border-line bg-surface py-1 shadow-lg"
          >
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  a.onClick();
                }}
                className={cn(
                  "flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium transition",
                  a.danger ? "text-danger hover:bg-danger-soft" : "text-ink hover:bg-sunken"
                )}
              >
                <a.icon className="h-4 w-4 shrink-0" />
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── 데스크톱: 손 얹으면 아이콘 ── */}
      <div className="hidden gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 lg:flex">
        {actions.map((a) => (
          <IconButton
            key={a.label}
            variant={a.danger ? "danger" : "surface"}
            size="sm"
            aria-label={a.label}
            onClick={a.onClick}
          >
            <a.icon className="h-3.5 w-3.5" />
          </IconButton>
        ))}
      </div>
    </div>
  );
}
