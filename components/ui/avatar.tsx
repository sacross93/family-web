import { palette } from "@/lib/colors";
import { cn } from "@/lib/utils";

/** 가족 구성원 아바타 (이모지 + 파스텔 배경) */
export function Avatar({
  emoji,
  color,
  name,
  size = "md",
  className,
}: {
  emoji?: string | null;
  color?: string | null;
  name?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const pal = palette(color);
  const dims: Record<string, string> = {
    xs: "h-6 w-6 text-sm",
    sm: "h-8 w-8 text-base",
    md: "h-10 w-10 text-xl",
    lg: "h-14 w-14 text-3xl",
  };
  return (
    <span
      title={name ?? undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        pal.soft,
        dims[size],
        className
      )}
    >
      {emoji || "🙂"}
    </span>
  );
}
