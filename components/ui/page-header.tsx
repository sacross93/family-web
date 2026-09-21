"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useShell } from "@/components/shell-context";

export function PageHeader({
  emoji,
  title,
  description,
  summary,
  children,
  className,
}: {
  emoji?: string;
  title: string;
  description?: string;
  /**
   * 폰에서 제목 대신 서는 한 줄. **지금 이 화면의 상태**를 적는다 — "앨범 3개", "오늘 할일 2개".
   *
   * 폰에서는 제목이 상단바로 올라가므로 이 줄에 버튼 하나만 덩그러니 남았다.
   * 빈 바탕 위의 버튼 하나는 무엇에 붙은 버튼인지 말해 주지 않는다.
   * 제목을 다시 쓰면 위아래로 같은 말을 두 번 하게 되니, 대신 **셈**을 놓는다.
   */
  summary?: ReactNode;
  /** 우측 액션 영역 (버튼 등) */
  children?: ReactNode;
  className?: string;
}) {
  // 폰 상단바가 이미 제목을 띄웠으면 여기서는 접는다 — 같은 말을 위아래로 두 번 하지 않는다.
  // 상단 메뉴에 없는 페이지(관리자 등)에서는 상단바가 브랜드를 띄우므로 제목이 그대로 남는다.
  const { titleInTopBar } = useShell();

  // 제목도 접히고 액션도 요약도 없으면 폰에서는 남길 게 없다.
  const emptyOnPhone = titleInTopBar && !children && !summary;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
        // 요약 + 액션은 폰에서도 한 줄에 좌우로 둔다(세로로 쌓으면 자리만 먹는다).
        summary && titleInTopBar && "flex-row items-center justify-between",
        titleInTopBar ? "mb-4 lg:mb-7" : "mb-7",
        emptyOnPhone && "hidden lg:flex",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3",
          titleInTopBar && "hidden lg:flex",
        )}
      >
        {emoji && (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface text-2xl shadow-sm ring-1 ring-line">
            {emoji}
          </span>
        )}
        <div>
          <h1 className="font-display text-[1.75rem] font-bold leading-tight text-ink">
            {title}
          </h1>
          {description && (
            <p className="mt-0.5 text-sm text-ink-soft">{description}</p>
          )}
        </div>
      </div>
      {/* 폰에서만: 제목 자리에 서는 셈. 데스크톱은 위에 제목이 이미 있다. */}
      {summary && titleInTopBar && (
        <p className="text-sm font-semibold text-ink-soft lg:hidden">{summary}</p>
      )}
      {children && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {children}
        </div>
      )}
    </div>
  );
}
