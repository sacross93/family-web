"use client";

import { useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { Card, Button, Tag, ItemActions, CollapsibleCard } from "@/components/ui";
import { palette } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { kDateShort, kDateShortYear, startOfDay } from "@/lib/date";
import {
  CYCLE_KINDS,
  CYCLE_KIND_META,
  TEST_RESULT_META,
  periodsFrom,
  type CycleKind,
  type CyclePrediction,
  type TestResult,
} from "@/lib/cycle";
import type { CycleEvent } from "@/lib/types";

/** 기간 목록은 최근 여섯 개까지 — 평균도 최근 여섯 주기로 낸다(lib/cycle.ts). */
const RECENT_PERIODS = 6;

const dayTime = (d: Date | string) => startOfDay(new Date(d)).getTime();

function kindLabel(kind: string) {
  const m = CYCLE_KIND_META[kind as CycleKind];
  return m ? `${m.emoji} ${m.label}` : kind;
}

function resultMeta(result: string | null) {
  return result ? (TEST_RESULT_META[result as TestResult] ?? null) : null;
}

/**
 * 주기 기록 카드.
 *
 * - 준비 단계: 펼친 카드. 적는 버튼 셋이 맨 위에 있다.
 * - 임신·출생 단계(`collapsed`): 접힌 한 줄. 펼치면 같은 목록(읽기·지우기만, 적는 버튼은 없다).
 *
 * 지우기는 **묻지 않는다** — 날짜 하나라 다시 적는 데 3초다(장보기와 같은 규칙, DESIGN §8).
 */
export function CycleCard({
  events,
  prediction,
  collapsed = false,
  color = "rose",
  onAdd,
  onRemove,
}: {
  events: CycleEvent[];
  prediction: CyclePrediction | null;
  collapsed?: boolean;
  /** 이모지 동그라미 색 — 옆의 체크리스트·참고 사이트와 맞춘다. 준비 단계는 로즈. */
  color?: string;
  onAdd: (kind: CycleKind) => void;
  onRemove: (id: string) => void;
}) {
  const pal = palette(color);

  if (collapsed) {
    return (
      <CollapsibleCard emoji="🌸" emojiClassName={pal.soft} title={`준비 때 주기 기록 ${events.length}개`}>
        <CycleBody events={events} prediction={null} onRemove={onRemove} />
      </CollapsibleCard>
    );
  }

  return (
    <Card className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg", pal.soft)}>
          🌸
        </span>
        <h3 className="font-display text-lg font-bold text-ink">주기 기록</h3>
      </div>
      {/* 폰 폭에서 셋이 한 줄에 안 들어가면 아래로 내려간다(글자만 커져도 잘리지 않게). */}
      <div className="flex flex-wrap gap-2">
        {CYCLE_KINDS.map((k) => (
          <Button key={k} size="sm" variant="outline" onClick={() => onAdd(k)}>
            {CYCLE_KIND_META[k].emoji} {CYCLE_KIND_META[k].label}
          </Button>
        ))}
      </div>
      <CycleBody events={events} prediction={prediction} onRemove={onRemove} />
    </Card>
  );
}

function CycleBody({
  events,
  prediction,
  onRemove,
}: {
  events: CycleEvent[];
  prediction: CyclePrediction | null;
  onRemove: (id: string) => void;
}) {
  const [allOpen, setAllOpen] = useState(false);

  if (events.length === 0) {
    return <p className="text-sm text-ink-faint">아직 기록이 없어요.</p>;
  }

  // 기간마다 그 주기(이번 시작 ~ 다음 시작 전)에 한 테스트기를 붙인다 —
  // 테스트기는 생리 중이 아니라 그 사이에 하므로 "생리 기간 안" 으로 자르면 하나도 안 걸린다.
  const tests = events.filter((e) => e.kind === "ovulationTest");
  const periods = periodsFrom(events);
  const rows = periods
    .map((p, i) => {
      const from = p.start.getTime();
      const until = periods[i + 1]?.start.getTime() ?? Infinity;
      const inCycle = tests.filter((t) => dayTime(t.date) >= from && dayTime(t.date) < until);
      return { ...p, tests: inCycle };
    })
    .slice(-RECENT_PERIODS)
    .reverse();

  // 원본 기록 전부, 최신 먼저. 짝이 안 맞는 "생리 끝"·첫 시작 전 테스트기도 여기서는 지울 수 있다.
  const all = [...events].sort((a, b) => {
    const d = new Date(b.date).getTime() - new Date(a.date).getTime();
    return d !== 0 ? d : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {prediction && (
        <p className="font-num text-sm text-ink-soft">
          평균 주기 {prediction.avgCycle}일 · 생리 {prediction.avgPeriod}일
        </p>
      )}

      {rows.length > 0 && (
        <ul className="flex min-w-0 flex-col">
          {rows.map((r) => (
            <li key={r.start.getTime()} className="flex min-w-0 flex-col gap-1.5 border-b border-line py-2.5 last:border-0">
              <div className="flex min-w-0 items-baseline justify-between gap-3">
                <span className="font-num min-w-0 text-[0.9375rem] text-ink">
                  {kDateShort(r.start)} ~ {r.end ? kDateShort(r.end) : "?"}
                </span>
                {r.length !== null && <span className="font-num shrink-0 text-xs text-ink-faint">{r.length}일</span>}
              </div>
              {r.tests.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {r.tests.map((t) => {
                    const m = resultMeta(t.result);
                    return m ? (
                      <Tag key={t.id} color={m.color}>
                        {CYCLE_KIND_META.ovulationTest.emoji} {m.label}
                      </Tag>
                    ) : null;
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* 기간 묶음은 두 기록(시작·끝)을 합친 줄이라 하나만 골라 지울 수가 없다.
          지우기는 원본 기록 한 줄씩 — 짝이 안 맞아 기간에 안 잡히는 기록도 여기서는 보인다. */}
      <div className="flex min-w-0 flex-col">
        <button
          type="button"
          onClick={() => setAllOpen((v) => !v)}
          aria-expanded={allOpen}
          className="flex min-h-11 items-center gap-2 text-left text-sm font-semibold text-ink-soft lg:min-h-9"
        >
          모든 기록
          <span className="font-num font-normal text-ink-faint">{events.length}개</span>
          <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 text-ink-faint transition", allOpen && "rotate-180")} />
        </button>
        {allOpen && (
          <ul className="flex min-w-0 flex-col">
            {all.map((e) => {
              const m = resultMeta(e.result);
              return (
                <li key={e.id} className="group flex min-w-0 items-center gap-2 border-b border-line py-1.5 last:border-0">
                  <span className="font-num shrink-0 text-sm text-ink">{kDateShortYear(e.date)}</span>
                  <span className="min-w-0 truncate text-sm text-ink-soft">{kindLabel(e.kind)}</span>
                  {m && <Tag color={m.color}>{m.label}</Tag>}
                  <ItemActions
                    inline
                    quiet
                    className="ml-auto shrink-0"
                    actions={[{ label: "삭제", icon: Trash2, onClick: () => onRemove(e.id), danger: true }]}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
