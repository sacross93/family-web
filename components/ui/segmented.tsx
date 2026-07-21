"use client";

import { cn } from "@/lib/utils";

interface Option<T extends string> {
  value: T;
  label: string;
}

/** 세그먼트 컨트롤 — 뷰/필터 전환 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-sunken p-1",
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all duration-200",
              active
                ? "bg-surface text-ink shadow-sm"
                : "text-ink-faint hover:text-ink-soft"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
