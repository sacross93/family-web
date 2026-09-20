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
              "flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 active:scale-90 lg:h-8 lg:w-8",
              PALETTE[key].dot,
              active ? "ring-2 ring-primary ring-offset-2" : "hover:scale-110"
            )}
          >
            {/* 체크는 **잉크**로. 흰 체크는 파스텔 위에서 1.3~1.8:1 이라 고른 건지 아닌지
                눈으로 안 잡혔다(버터 위에서는 거의 안 보인다). 잉크는 5~11:1. */}
            {active && <Check className="h-4 w-4 text-ink" strokeWidth={3.5} />}
          </button>
        );
      })}
    </div>
  );
}
