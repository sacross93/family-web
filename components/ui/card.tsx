import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** 호버 시 살짝 떠오르는 인터랙티브 카드 */
  interactive?: boolean;
  /** 기본 패딩 제거 (사진 등 꽉 찬 콘텐츠용) */
  flush?: boolean;
}

export function Card({
  className,
  interactive,
  flush,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-line bg-surface shadow-sm",
        !flush && "p-5",
        interactive &&
          "cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-pop",
        className
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-base font-bold text-ink", className)}
      {...props}
    />
  );
}
