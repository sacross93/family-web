import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  emoji = "🌱",
  title,
  description,
  action,
  className,
}: {
  emoji?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-line-strong bg-surface/50 px-6 py-14 text-center",
        className
      )}
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-sunken text-3xl">
        {emoji}
      </span>
      <div>
        <p className="text-base font-bold text-ink">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-ink-soft">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
