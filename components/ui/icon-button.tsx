"use client";

import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "ghost" | "soft" | "danger" | "surface";

const VARIANTS: Record<Variant, string> = {
  ghost: "text-ink-soft hover:bg-sunken hover:text-ink",
  soft: "bg-primary-soft text-primary-ink hover:brightness-95",
  danger: "text-ink-faint hover:bg-danger-soft hover:text-danger-ink",
  surface: "bg-surface text-ink-soft shadow-sm ring-1 ring-line hover:text-ink",
};

// ComponentPropsWithRef: React 19 에서는 ref 도 그냥 prop 이다.
// ItemActions 가 이 버튼의 위치를 재서 메뉴를 띄우므로 ref 를 받을 수 있어야 한다.
interface Props extends ComponentPropsWithRef<"button"> {
  variant?: Variant;
  size?: "sm" | "md";
}

export function IconButton({
  className,
  variant = "ghost",
  size = "md",
  ...props
}: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-full transition-all duration-200 active:scale-90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        // 폰에서는 실제로 40px. 가짜 영역으로 넓히면 목록에서 옆 글자를 덮어
        // 이름을 누르려다 지워질 수 있다(삭제 버튼이 여기 많이 쓰인다).
        size === "sm" ? "h-10 w-10 lg:h-8 lg:w-8" : "h-10 w-10",
        VARIANTS[variant],
        className
      )}
      {...props}
    />
  );
}
