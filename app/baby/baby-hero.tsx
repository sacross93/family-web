"use client";

import { Settings } from "lucide-react";
import { IconButton, Tag } from "@/components/ui";
import { palette } from "@/lib/colors";
import { cn } from "@/lib/utils";
import {
  pregnancyProgress,
  weekLabel,
  daysSinceBirth,
  dday,
  kDate,
  kDateShort,
  startOfDay,
} from "@/lib/date";
import type { Baby, BabyEntryWithAuthor } from "@/lib/types";

/** 오늘 이후(오늘 포함) 가장 가까운 검진 기록 */
export function findNextCheckup(entries: BabyEntryWithAuthor[]): BabyEntryWithAuthor | null {
  const today = startOfDay(new Date()).getTime();
  return (
    entries
      .filter((e) => e.kind === "checkup" && startOfDay(new Date(e.date)).getTime() >= today)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] ?? null
  );
}

export function BabyHero({
  baby,
  entries,
  onOpenSettings,
}: {
  baby: Baby;
  entries: BabyEntryWithAuthor[];
  onOpenSettings: () => void;
}) {
  const pal = palette(baby.color);
  const nextCheckup = findNextCheckup(entries);
  const born = !!baby.birthDate;
  const p = pregnancyProgress(baby.dueDate);

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br p-6 shadow-sm sm:p-8",
        pal.gradient
      )}
    >
      <IconButton
        variant="surface"
        size="sm"
        aria-label="아기 설정"
        onClick={onOpenSettings}
        className="absolute right-4 top-4 z-20"
      >
        <Settings className="h-4 w-4" />
      </IconButton>

      <div className="relative z-10 flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/70 text-2xl shadow-sm">
            {baby.emoji}
          </span>
          <div>
            <p className="font-display text-xl font-bold text-ink">{baby.nickname}</p>
            <p className="text-xs text-ink-soft">
              {born ? `${kDate(baby.birthDate!)} 태어남` : `출산 예정 ${kDate(baby.dueDate)}`}
            </p>
          </div>
        </div>

        {born ? (
          <div>
            <p className="text-sm font-semibold text-ink-soft">태어난 지</p>
            <p className="font-num text-5xl font-bold leading-none text-ink">
              {daysSinceBirth(baby.birthDate!)}
              <span className="ml-1 text-2xl">일</span>
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-num text-5xl font-bold leading-none text-ink">{weekLabel(p)}</p>
                <p className="mt-2 text-sm text-ink-soft">
                  {p.overdue ? "예정일이 지났어요 · 곧 만나요 🤍" : `${p.trimester}분기`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Tag color={baby.color} className="font-num">
                  출산 {p.dueLabel}
                </Tag>
                {nextCheckup && (
                  <Tag color="sky" className="font-num">
                    다음 검진 {dday(nextCheckup.date).label} · {kDateShort(nextCheckup.date)}
                  </Tag>
                )}
              </div>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-white/60"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(p.progress * 100)}
              aria-label="임신 진행"
            >
              <div
                className={cn("h-full rounded-full transition-all", pal.dot)}
                style={{ width: `${Math.round(p.progress * 100)}%` }}
              />
            </div>
          </>
        )}
      </div>

      <div className="pointer-events-none absolute -right-6 -bottom-8 text-[140px] opacity-15 sm:text-[180px]">
        {baby.emoji}
      </div>
    </section>
  );
}
