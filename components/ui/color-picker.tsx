"use client";

import { PALETTE, PALETTE_KEYS, type PaletteKey } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

/** 파스텔 색상 선택기 — 폼에서 카테고리 색을 고를 때 */
export function ColorPicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (color: PaletteKey) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {PALETTE_KEYS.map((key) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-label={PALETTE[key].label}
            aria-pressed={active}
            title={PALETTE[key].label}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 active:scale-90",
              PALETTE[key].dot,
              active ? "ring-2 ring-ink/40 ring-offset-2" : "hover:scale-110"
            )}
          >
            {active && <Check className="h-4 w-4 text-white" strokeWidth={3.5} />}
          </button>
        );
      })}
    </div>
  );
}
