"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isCovered, useFocusTrap } from "./use-focus-trap";

/** 열려 있는 판의 수. 판 위에 판이 떴다 닫힐 때 아래 판의 스크롤 잠금까지 풀지 않게. */
let scrollLocks = 0;

export function Modal({
  open,
  onClose,
  title,
  emoji,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  emoji?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const [mounted, setMounted] = useState(false);
  // 가두기는 판이 **그려진 뒤에** 건다. 처음부터 열린 채로 붙는 판(사진 보기 — 고르면 그때 생긴다)은
  // 첫 렌더에 포털이 아직 없어 `open` 만 보고는 빈 손으로 지나갔고, 다시 걸 계기가 없어 Tab 이 뒤로 샜다.
  const panel = useFocusTrap<HTMLDivElement>(open && mounted);
  // 포털은 **브라우저에 붙은 뒤에만** 그릴 수 있다(서버에는 document 가 없다).
  // 이 한 번의 추가 렌더가 이 장치의 값이다.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    // Esc 한 번에 판 하나. 위에 다른 판이 떠 있으면 그 판의 몫이고(`isCovered`), 먼저 닫은 판은
    // `preventDefault` 로 표시한다 — 위 판이 먼저 닫혀 DOM 에서 빠진 뒤에 아래 판이 "이제 내가 맨 위" 라며
    // 같은 Esc 로 또 닫히지 않게.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (panel.current && isCovered(panel.current)) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    scrollLocks += 1;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      scrollLocks -= 1;
      if (scrollLocks === 0) document.body.style.overflow = "";
    };
  }, [open, onClose, panel]);

  if (!mounted || !open) return null;

  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-ink/35 backdrop-blur-sm animate-[fade-up_.2s_ease]"
      />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 flex max-h-[90dvh] w-full flex-col rounded-t-xl bg-surface shadow-lg animate-[pop-in_.28s_cubic-bezier(.34,1.56,.64,1)] sm:rounded-xl",
          widths[size]
        )}
      >
        {(title || emoji) && (
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div className="flex items-center gap-2.5">
              {emoji && (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sunken text-lg">
                  {emoji}
                </span>
              )}
              {title && (
                <h2 className="font-display text-xl font-bold text-ink">{title}</h2>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-faint transition hover:bg-sunken hover:text-ink"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5">
          {children}
        </div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
