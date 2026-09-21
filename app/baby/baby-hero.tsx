"use client";

import { Settings } from "lucide-react";
import { IconButton } from "@/components/ui";
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

/**
 * 이 사이트에서 가장 중요한 한 가지.
 *
 * 예전엔 `8주 1일` 이 파스텔 카드 안의 48px 숫자였다 — 목록의 카드 제목과 크게 다르지 않아,
 * 가장 중요한 것이 가장 크지 않았다. 이제 진한 판 위에 명조로 크게 쓴다.
 * **과감함은 여기 한 곳에만 쓴다**(DESIGN.md). 나머지 화면은 조용하다.
 *
 * 남은 날·예정일은 진행 막대의 **양 끝**에 붙는다. 가운뎃점으로 이어 붙인 메타 줄
 * (`1분기 · 5월 1일 · D-223`)은 읽는 순서가 없어 눈이 헤맨다 — 막대는 왼쪽에서
 * 오른쪽으로 간다는 뜻이 이미 있으니, 그 끝에 놓으면 설명이 필요 없다.
 */
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
  const pct = Math.round(p.progress * 100);

  return (
    <section className="on-chrome relative overflow-hidden rounded-xl bg-gradient-to-br from-chrome via-chrome to-peach-soft p-6 sm:p-8">
      <IconButton
        variant="ghost"
        size="sm"
        aria-label="아기 설정"
        onClick={onOpenSettings}
        className="absolute right-4 top-4 z-20 text-chrome-faint hover:bg-chrome-soft hover:text-chrome-ink"
      >
        <Settings className="h-4 w-4" />
      </IconButton>

      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-xl">
            {baby.emoji}
          </span>
          {/* 이 화면의 `h1`. 다른 화면은 `PageHeader` 가 만들어 주는데 여기는 자체 히어로라
              **h1 이 아예 없었다** — 스크린리더로 들어오면 이 화면이 무엇인지 말해 주는 줄이
              하나도 없다. 가장 큰 글자(주차)가 아니라 **이름**이 이 화면의 제목이다. */}
          <h1 className="font-display text-lg font-bold text-chrome-ink">{baby.nickname}</h1>
        </div>

        {born ? (
          <div>
            <p className="font-display text-6xl font-bold leading-none text-chrome-ink sm:text-7xl">
              {daysSinceBirth(baby.birthDate!)}
              <span className="ml-2 text-3xl sm:text-4xl">일째</span>
            </p>
            <p className="mt-3 text-sm text-chrome-faint">
              {kDate(baby.birthDate!)}에 태어났어요
            </p>
          </div>
        ) : (
          <div>
            <p className="font-display text-6xl font-bold leading-none text-chrome-ink sm:text-7xl">
              {weekLabel(p)}
            </p>
            {/* 강조색은 '지금 벌어지는 일' 에만 쓴다 — 여기가 그 자리다. */}
            <p className="font-num mt-3 text-base text-ink-soft">
              {p.overdue
                ? `예정일에서 ${Math.abs(p.dueDays)}일 지났어요. 곧 만나요 🤍`
                : `${p.dueDays}일 남았어요`}
            </p>

            {/* 막대 위를 아기가 걸어간다.
                이모지 하나가 "지금 여기" 를 말한다 — 퍼센트를 읽지 않아도 눈에 들어오고,
                이 집에서 가장 중요한 한 가지라 꾸밀 값어치가 있는 유일한 자리다.
                `overflow-hidden` 을 벗겨야 이모지가 막대 밖으로 나온다. 대신 채움에만
                `rounded-full` 을 준다. 양 끝에서 이모지가 잘리지 않게 자리를 가둔다. */}
            <div className="relative mt-7">
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-white"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                aria-label="임신 진행"
              >
                <div
                  className={cn("h-full rounded-full transition-all", pal.dot)}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span
                aria-hidden
                className="pointer-events-none absolute -top-2.5 -translate-x-1/2 text-base transition-all"
                style={{ left: `clamp(0.75rem, ${pct}%, calc(100% - 0.75rem))` }}
              >
                {baby.emoji}
              </span>
            </div>
            {/* 막대의 양 끝이 곧 설명이다 — 왼쪽은 지금, 오른쪽은 만나는 날.
                가운뎃점으로 이어 붙인 메타 줄보다 읽는 순서가 분명하다. */}
            <div className="mt-2 flex items-baseline justify-between gap-3 text-xs text-chrome-faint">
              <span>{p.trimester}분기</span>
              <span className="font-num">{kDate(baby.dueDate)} 예정</span>
            </div>
          </div>
        )}

        {nextCheckup && (
          <p className="flex items-baseline gap-2 border-t border-ink/20 pt-4 text-sm text-chrome-faint">
            <span className="text-chrome-ink">다음 검진</span>
            <span className="font-num">{kDateShort(nextCheckup.date)}</span>
            <span className="font-num text-ink-soft">{dday(nextCheckup.date).label}</span>
          </p>
        )}
      </div>
    </section>
  );
}
