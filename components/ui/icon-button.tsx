"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "ghost" | "soft" | "danger" | "surface";

const VARIANTS: Record<Variant, string> = {
  ghost: "text-ink-soft hover:bg-sunken hover:text-ink",
  soft: "bg-primary-soft text-primary-ink hover:brightness-95",
  danger: "text-ink-faint hover:bg-danger-soft hover:text-danger",
  surface: "bg-surface text-ink-soft shadow-sm ring-1 ring-line hover:text-ink",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
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
        size === "sm" ? "h-8 w-8" : "h-10 w-10",
        VARIANTS[variant],
        className
      )}
      {...props}
    />
  );
}
