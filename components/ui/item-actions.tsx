"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

/** 메뉴 한 칸 높이(py-2.5 + 글자) + 위아래 여백. 화면 아래로 넘칠지 가늠하는 데 쓴다. */
const ROW = 42;
const PAD = 8;
const MIN_WIDTH = 120;

/**
 * 목록 항목의 액션들. 한 항목에 버튼을 두세 개씩 달면 목록이 시끄러워진다 —
 * 기념일 6건이면 아이콘이 12개였고, 게시판 4건이면 16개였다.
 *
 * - 폰: `…` 하나만 늘 보인다. 누르면 이름이 적힌 줄로 펼쳐진다.
 *   숨기는 게 아니라 **모으는** 것이다(AGENTS.md "hover 로만 뜨는 액션 금지").
 *   이름을 적는 쪽이 아이콘만 있는 것보다 부모님·아이에게 분명하다.
 * - 데스크톱: 예전처럼 카드에 손을 얹으면 아이콘이 뜬다. 넓으니 시끄럽지 않다.
 *
 * 펼친 메뉴는 `document.body` 로 내보낸다(portal). 제자리에 그리면:
 *   - 조상의 `overflow-hidden` 이 메뉴를 잘라 아래 항목을 아예 누를 수 없고
 *     (계획 상세 히어로·할일 목록에서 실제로 그랬다),
 *   - 조상에 `transform` 이 걸린 곳(게시판 쪽지의 기울임)에서는 `fixed` 가
 *     화면이 아니라 그 조상 기준이 된다.
 * 둘 다 "카드마다 overflow 를 손보는" 식으로는 계속 새로 생긴다.
 */
export function ItemActions({
  actions,
  className,
  inline,
}: {
  actions: ItemAction[];
  className?: string;
  /** 카드 모서리에 얹지 않고 줄 안에 그대로 놓는다(목록 한 줄의 오른쪽 끝 등). */
  inline?: boolean;
}) {
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const open = at !== null;
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  /** 버튼 위치에서 메뉴 자리를 구한다. 버튼이 화면 밖이면 null. */
  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r || r.bottom < 0 || r.top > window.innerHeight) return null;
    const height = actions.length * ROW + PAD;
    // 아래로 넘치면 버튼 위로 띄운다.
    const below = r.bottom + 6;
    const top = below + height > window.innerHeight ? Math.max(8, r.top - 6 - height) : below;
    return { top, right: Math.max(8, window.innerWidth - r.right) };
  }, [actions.length]);

  function toggle() {
    setAt(open ? null : place());
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setAt(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    // 바깥을 누르면 닫는다. 메뉴가 portal 로 나가 있으므로 트리거와 메뉴 둘 다 확인한다.
    const onDown = (e: Event) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !menuRef.current?.contains(t)) close();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    // 화면이 움직이면 좌표를 다시 잡는다. 닫아 버리면 안 된다 — 폰의 관성 스크롤이
    // 아직 미끄러지는 중에 `…` 를 누르면 열리자마자 닫혀 아무 일도 안 일어난 것처럼 보인다.
    // 버튼이 화면 밖으로 나가면 그때는 닫는다(place 가 null 을 준다).
    const follow = () => setAt(place());
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [open, place]);

  const menu = at && (
    <div
      ref={menuRef}
      data-item-menu
      style={{ position: "fixed", top: at.top, right: at.right, minWidth: MIN_WIDTH }}
      className="z-[60] flex flex-col overflow-hidden rounded-2xl border border-line bg-surface py-1 shadow-lg"
    >
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={() => {
            setAt(null);
            a.onClick();
          }}
          className={cn(
            "flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium transition",
            a.danger ? "text-danger-ink hover:bg-danger-soft" : "text-ink hover:bg-sunken"
          )}
        >
          <a.icon className="h-4 w-4 shrink-0" />
          {a.label}
        </button>
      ))}
    </div>
  );

  return (
    <div
      ref={ref}
      className={cn("z-20", inline ? "relative" : "absolute right-3 top-3", className)}
    >
      {/* ── 폰: … 하나 ── */}
      <div className="lg:hidden">
        <IconButton
          ref={btnRef}
          variant="surface"
          size="sm"
          aria-label="더보기"
          aria-expanded={open}
          onClick={toggle}
        >
          <MoreHorizontal className="h-4 w-4" />
        </IconButton>
      </div>
      {menu && typeof document !== "undefined" && createPortal(menu, document.body)}

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
