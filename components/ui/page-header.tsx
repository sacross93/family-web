import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  emoji,
  title,
  description,
  children,
  className,
}: {
  emoji?: string;
  title: string;
  description?: string;
  /** 우측 액션 영역 (버튼 등) */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="flex items-center gap-3">
        {emoji && (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface text-2xl shadow-sm ring-1 ring-line">
            {emoji}
          </span>
        )}
        <div>
          <h1 className="font-display text-[28px] font-bold leading-tight text-ink">
            {title}
          </h1>
          {description && (
            <p className="mt-0.5 text-sm text-ink-soft">{description}</p>
          )}
        </div>
      </div>
      {children && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
      )}
    </div>
  );
}
