"use client";

import { Settings } from "lucide-react";
import { Button, IconButton } from "@/components/ui";
import { palette } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { kDate, kDateShort, dday, differenceInCalendarDays } from "@/lib/date";
import type { CyclePrediction } from "@/lib/cycle";
import type { JourneyEntryWithAuthor } from "@/lib/types";
import { findNextCheckup } from "./baby-hero";

const clampPct = (n: number) => Math.min(100, Math.max(0, n));

/**
 * 준비 단계의 히어로. 임신 히어로(`BabyHero`)와 **같은 판·같은 글자 크기 체계**를 쓴다 —
 * 단계가 바뀌어도 페이지의 가장 큰 자리가 같은 모양이어야 "같은 페이지" 로 읽힌다.
 *
 * 여기 나오는 날짜(다음 예정일·가임기·배란 예정일)는 전부 기록으로 낸 **추정**이고,
 * 화면은 날짜와 "추정" 표시만 말한다. **권하는 문장("이때 ~해 보세요")은 쓰지 않는다**
 * — 아기 페이지에서 의료 시기 문구의 유일한 예외가 이 날짜들이고, 그 예외는 날짜까지만이다.
 */
export function PrepHero({
  prediction,
  entries,
  starting = false,
  onOpenSettings,
  onRecordStart,
  onStartPregnancy,
}: {
  prediction: CyclePrediction | null;
  entries: JourneyEntryWithAuthor[];
  /** 임신 단계로 넘어가는 중(서버는 바꿨고 새 화면을 받아 오는 중) */
  starting?: boolean;
  onOpenSettings: () => void;
  onRecordStart: () => void;
  onStartPregnancy: () => void;
}) {
  const nextCheckup = findNextCheckup(entries);

  return (
    <section className="on-chrome relative overflow-hidden rounded-xl bg-gradient-to-br from-chrome via-chrome to-peach-soft p-6 sm:p-8">
      <IconButton
        variant="ghost"
        size="sm"
        aria-label="아기 페이지 설정"
        onClick={onOpenSettings}
        className="absolute right-4 top-4 z-20 text-chrome-faint hover:bg-chrome-soft hover:text-chrome-ink"
      >
        <Settings className="h-4 w-4" />
      </IconButton>

      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xl">🌱</span>
          {/* 이 화면의 `h1` — 임신 히어로는 태명, 준비 단계는 이 이름. */}
          <h1 className="font-display text-lg font-bold text-chrome-ink">아기 준비</h1>
        </div>

        {prediction ? <Prediction p={prediction} /> : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-[0.9375rem] text-chrome-ink">
              생리 시작일을 적으면 다음 예정일과 가임기를 추정해 드려요.
            </p>
            <Button size="sm" variant="outline" onClick={onRecordStart}>
              생리 시작 적기
            </Button>
          </div>
        )}

        {nextCheckup && (
          <p className="flex items-baseline gap-2 border-t border-ink/20 pt-4 text-sm text-chrome-faint">
            <span className="text-chrome-ink">다음 진료</span>
            <span className="font-num">{kDateShort(nextCheckup.date)}</span>
            <span className="font-num text-ink-soft">{dday(nextCheckup.date).label}</span>
          </p>
        )}

        <Button variant="soft" onClick={onStartPregnancy} disabled={starting} className="self-start">
          임신을 확인했어요
        </Button>
      </div>
    </section>
  );
}

function Prediction({ p }: { p: CyclePrediction }) {
  const late = p.lateDays > 0;
  const big = late ? `${p.lateDays}일 지남` : p.daysUntilNext === 0 ? "오늘" : `D-${p.daysUntilNext}`;
  const pct = Math.round(clampPct((p.cycleDay / p.avgCycle) * 100));
  // 가임기 띠: 이번 주기(시작 ~ 평균 주기) 위의 자리. 막대 밖으로 나가는 부분은 자른다.
  const left = clampPct((differenceInCalendarDays(p.fertileStart, p.lastStart) / p.avgCycle) * 100);
  const right = clampPct(((differenceInCalendarDays(p.fertileEnd, p.lastStart) + 1) / p.avgCycle) * 100);

  return (
    <div>
      <p className="font-display text-6xl font-bold leading-none text-chrome-ink sm:text-7xl">{big}</p>
      <p className="font-num mt-3 text-base text-ink-soft">
        {late ? `${kDate(p.nextStart)} 예정이었어요 · 추정` : `다음 생리 예정 ${kDate(p.nextStart)} · 추정`}
      </p>

      <div className="mt-7">
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-white"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="이번 주기 진행"
        >
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        {/* 가임기는 막대 **아래** 옅은 띠로 — 막대 안에 깔면 진행 채움이 덮는다.
            예정일이 지났으면 그리지 않는다: 설명하던 줄(아래 "가임기 …")이 숨으니 이름 없는 띠만
            남고, 지난 날짜를 "가임기" 로 칠하는 셈이다(달력도 지나면 예정·가임기를 안 그린다). */}
        {!late && right > left && (
          <div aria-hidden className="relative mt-1 h-1.5 w-full">
            <span
              className={cn("absolute inset-y-0 rounded-full", palette("mint").soft)}
              style={{ left: `${left}%`, width: `${right - left}%` }}
            />
          </div>
        )}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-3 text-xs text-chrome-faint">
        <span className="font-num">{p.cycleDay}일째</span>
        <span className="font-num">평균 {p.avgCycle}일</span>
      </div>

      {!late && (
        <p className="font-num mt-4 text-sm text-chrome-ink">
          가임기 {kDateShort(p.fertileStart)} ~ {kDateShort(p.fertileEnd)} · 배란 예정 {kDateShort(p.ovulation)} (추정)
        </p>
      )}
      {p.basis === "default" && <p className="mt-1.5 text-xs text-chrome-faint">기록이 두 번 쌓이면 더 맞아져요</p>}
    </div>
  );
}
