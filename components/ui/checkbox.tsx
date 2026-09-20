"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { palette } from "@/lib/colors";

/**
 * 체크 동그라미의 **모양만**. 누르는 일은 하지 않는다.
 *
 * 목록에서는 동그라미만이 아니라 **줄 전체**가 눌려야 한다 — 마트에서 한 손으로
 * 24px 짜리 동그라미를 겨누는 것보다 "우유" 라는 글자를 누르는 편이 쉽다.
 * 그런데 버튼 안에 버튼을 넣을 수는 없으므로, 줄을 버튼으로 만들고 안에는 이 모양만 둔다.
 */
export function CheckCircle({
  checked,
  color,
  size = "md",
  className,
}: {
  checked: boolean;
  color?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const pal = palette(color);
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200",
        size === "sm" ? "h-5 w-5" : "h-6 w-6",
        checked
          ? cn(pal.dot, "border-transparent text-white")
          : "border-line-strong bg-surface text-transparent",
        className
      )}
    >
      <Check className={cn(size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")} strokeWidth={3.5} />
    </span>
  );
}

/** 동그라미 하나가 그대로 버튼인 경우(줄 전체를 누르게 만들 수 없는 자리). */
export function Checkbox({
  checked,
  onChange,
  color,
  size = "md",
  className,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  color?: string | null;
  size?: "sm" | "md";
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      // tap-target: 보이는 동그라미는 그대로 두고 눌리는 넓이만 44px 로(globals.css)
      className={cn(
        "tap-target shrink-0 rounded-full active:scale-90",
        !checked && "hover:[&>span]:border-primary",
        className
      )}
    >
      <CheckCircle checked={checked} color={color} size={size} />
    </button>
  );
}
