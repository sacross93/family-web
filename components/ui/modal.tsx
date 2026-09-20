"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFocusTrap } from "./use-focus-trap";

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
  const panel = useFocusTrap<HTMLDivElement>(open);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

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
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-sunken text-lg">
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
