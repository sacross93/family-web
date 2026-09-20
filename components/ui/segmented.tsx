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
        // 트랙에 테두리가 필요하다 — `sunken` 은 분홍 페이지와 **ΔE 3.3** 이라
        // 골라 놓은 흰 알약만 보이고 "여기 고를 게 더 있다" 는 게 안 보였다.
        // `line-strong` 은 ΔE 12.7 로 이 판의 기준선(9.3)을 넘는다.
        "inline-flex items-center gap-1 rounded-full border border-line-strong bg-sunken p-1",
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
              // 폰에서 40px 은 되게 — 필터를 바꾸는 일이 잦은데 32px 은 빗나간다.
              "flex h-10 items-center rounded-full px-3.5 text-sm font-semibold transition-all duration-200 lg:h-8",
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
