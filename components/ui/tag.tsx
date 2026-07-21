import type { ReactNode } from "react";
import { palette } from "@/lib/colors";
import { cn } from "@/lib/utils";

export function Tag({
  color,
  children,
  dot = false,
  className,
}: {
  color?: string | null;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  const pal = palette(color);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        pal.chip,
        className
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", pal.dot)} />}
      {children}
    </span>
  );
}

export function ColorDot({
  color,
  className,
}: {
  color?: string | null;
  className?: string;
}) {
  const pal = palette(color);
  return (
    <span className={cn("inline-block h-2.5 w-2.5 rounded-full", pal.dot, className)} />
  );
}
