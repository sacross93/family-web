"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { palette } from "@/lib/colors";

/** 경쾌한 원형 체크박스 (버튼 형태) */
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
  const pal = palette(color);
  const dim = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        // tap-target: 보이는 동그라미는 그대로 두고 눌리는 넓이만 44px 로(globals.css)
        "tap-target flex shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200 active:scale-90",
        dim,
        checked
          ? cn(pal.dot, "border-transparent text-white shadow-sm")
          : "border-line-strong bg-surface text-transparent hover:border-primary",
        className
      )}
    >
      <Check className={cn(size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")} strokeWidth={3.5} />
    </button>
  );
}
