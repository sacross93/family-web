"use client";

// 달력에 얹는 아기 페이지 표시(주기 추정·병원·출산 예정일) — **읽기 전용**.
// 676줄짜리 달력 클라이언트에 새 개념을 섞지 않으려고 그리는 쪽을 여기 모았다.
// 달력은 이 파일의 조각을 세 자리(격자 칸·하루 모달·폰 목록)에 끼우기만 한다.
// 고치기·지우기는 없다 — 아기 페이지에서 한다(CalendarEvent 로 저장하지 않으므로 지울 것도 없다).
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { palette, type PaletteKey } from "@/lib/colors";
import { fromDateInput, kDateRelative } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { JourneyMark, MarkKind } from "@/lib/journey-core";

// 색은 팔레트 키로만(동적 클래스 금지). 일정 점과 헷갈리지 않게 **막대**로 그린다.
const MARK_COLOR: Record<MarkKind, PaletteKey> = {
  period: "rose",
  periodPredicted: "rose",
  fertile: "mint",
  ovulation: "mint",
  hospital: "sky",
  due: "butter",
};

/** 추정이라 옅게 그리는 것. 흰 칸에서 ΔE 11~12 — 진한 막대(28~40)와 한눈에 갈린다. */
const FAINT: ReadonlySet<MarkKind> = new Set<MarkKind>(["periodPredicted", "fertile"]);

/**
 * 칸 안 막대의 순서. 주기(생리·예정·가임기·배란)를 **맨 아래**에 둔다 — 하루에 주기 표시는
 * 하나뿐이라 그 막대가 언제나 같은 높이에 서고, 며칠 이어지는 가임기가 이웃 칸과 한 줄로 이어 보인다.
 * (Set 의 넣은 순서에 기대지 않는다 — 칸마다 쌓이는 순서가 달라진다.)
 */
const BAR_ORDER: MarkKind[] = ["hospital", "due", "period", "periodPredicted", "fertile", "ovulation"];

function swatch(kind: MarkKind): string {
  const p = palette(MARK_COLOR[kind]);
  return FAINT.has(kind) ? p.soft : p.dot;
}

/**
 * 격자 칸 아래쪽의 얇은 막대들(같은 종류는 한 번). 예측은 옅게.
 * 보이기만 하는 장식이다(`aria-hidden`) — 무엇인지는 칸의 aria-label 이 말한다(`marksSpeech`).
 * 칸이 `<button>` 이라 안에는 `span` 만 둔다.
 */
export function MarkBars({ marks, dim = false }: { marks: JourneyMark[]; dim?: boolean }) {
  const kinds = BAR_ORDER.filter((k) => marks.some((m) => m.kind === k));
  if (kinds.length === 0) return null;
  return (
    <span aria-hidden className="mt-auto flex flex-col gap-0.5 px-0.5">
      {kinds.map((k) => (
        <span
          key={k}
          className={cn(
            "block h-1 w-full rounded-full",
            swatch(k),
            // 이번 달 밖의 칸은 일정 점처럼 흐리게 — 단 **진한 막대만**. 옅은 막대에 60% 를 더 걸면
            // 흰 칸에서 ΔE 6.6(민트)·7.3(로즈)으로 떨어져 기준선 7 아래로 사라진다.
            dim && !FAINT.has(k) && "opacity-60"
          )}
        />
      ))}
    </span>
  );
}

/**
 * 격자 칸 aria-label 에 이어 붙일 글(", 생리 예정 (추정), 병원 · 진료"). 표시가 없으면 "".
 * 칸은 aria-label 을 가진 버튼이라 그 이름이 안쪽 글자를 **덮는다** — 안에 `sr-only` 글자를 두면
 * 화면 읽기 프로그램이 끝내 읽지 않는다. 그래서 이름 자체에 붙인다.
 */
export function marksSpeech(marks: JourneyMark[]): string {
  const labels = [...new Set(marks.map((m) => m.label))];
  return labels.length ? `, ${labels.join(", ")}` : "";
}

/**
 * 폰 목록("다가오는 일정")에 끼울 표시. 오늘부터, **하루짜리 사건만**:
 * 병원 · 출산 예정일 · 배란 예정 · 생리 예정의 **첫날**. 가임기·생리 예정의 나머지 날까지 넣으면
 * 날마다 줄이 생겨 목록이 일정 대신 주기로 찬다(그건 격자의 막대가 보여 준다).
 * `until` 이 있으면 그날까지만 — 일정이 잘린 목록에서 그 뒤 표시만 남으면 사이가 빈 것처럼 읽힌다.
 * 날짜는 모두 "yyyy-MM-dd" 라 글자 비교가 곧 날짜 비교다.
 */
export function upcomingMarks(marks: JourneyMark[], from: string, until?: string): JourneyMark[] {
  const ahead = marks
    .filter((m) => m.date >= from && (until === undefined || m.date <= until))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  // 생리 예정은 한 번에 한 줄기뿐이다(예측은 다음 한 번만 한다) — 날짜순 첫 번째가 첫날.
  const firstPredicted = ahead.find((m) => m.kind === "periodPredicted");
  return ahead.filter(
    (m) => m.kind === "hospital" || m.kind === "due" || m.kind === "ovulation" || m === firstPredicted
  );
}

export type TimelineRow<T> = { type: "item"; item: T } | { type: "mark"; mark: JourneyMark };

/**
 * 날짜순 목록 사이에 표시를 날짜순으로 끼운다. 같은 날이면 표시가 먼저 — 시각 없는 하루짜리라
 * 종일 일정처럼 그날 맨 위에 선다. `items` 는 이미 날짜순이어야 한다(달력이 정렬해서 넘긴다).
 */
export function interleaveMarks<T>(
  items: T[],
  dayOf: (item: T) => string,
  marks: JourneyMark[]
): TimelineRow<T>[] {
  const out: TimelineRow<T>[] = [];
  let i = 0;
  for (const item of items) {
    const day = dayOf(item);
    while (i < marks.length && marks[i].date <= day) out.push({ type: "mark", mark: marks[i++] });
    out.push({ type: "item", item });
  }
  while (i < marks.length) out.push({ type: "mark", mark: marks[i++] });
  return out;
}

/** 줄 앞의 색 표. 격자의 막대와 같은 모양·같은 색이라 "칸의 그 줄" 임을 알아본다(일정은 동그라미). */
function MarkSwatch({ kind, className }: { kind: MarkKind; className?: string }) {
  return <span aria-hidden className={cn("h-1.5 w-4 shrink-0 rounded-full", swatch(kind), className)} />;
}

/**
 * 글자 링크. -my-3 py-3 로 자리는 그대로 두고 누를 높이만 40px 로 키운다(홈 칸 머리줄과 같은 방식).
 * 줄 오른쪽에 **붙박지 않는다** — 글자 1.5배(390px)에서 이 링크가 200px 를 차지해 옆 이름이
 * 20px 로 쪼그라들었다("배란 예정…" 이 "배" 한 글자). 그래서 놓이는 줄이 `flex-wrap` 이고,
 * 좁으면 이 링크가 아래로 내려간다(DESIGN §9 "글자만 커져도 읽혀야 한다").
 */
function BabyPageLink() {
  return (
    <Link
      href="/baby"
      className="-my-3 flex shrink-0 items-center gap-0.5 py-3 text-xs font-semibold text-ink-faint transition hover:text-primary"
    >
      아기 페이지에서 보기
      <ChevronRight className="h-3.5 w-3.5" />
    </Link>
  );
}

/**
 * 하루 모달용 읽기 전용 줄. 고치기·지우기 없이 아기 페이지로 보낸다.
 * 일정 줄은 색으로 **채운** 판이고 이것은 **테두리만** — 같은 모달 안에서 "일정이 아니다" 가 보인다.
 */
export function MarkRows({ marks }: { marks: JourneyMark[] }) {
  if (marks.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {marks.map((m, i) => (
        <li
          key={`${m.kind}:${i}`}
          className="flex items-start gap-3 rounded-md border border-line px-3 py-3"
        >
          {/* 첫 줄(text-sm · 20px) 가운데에 선다 */}
          <MarkSwatch kind={m.kind} className="mt-2" />
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="min-w-0 text-sm font-semibold text-ink">{m.label}</span>
            <BabyPageLink />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * 폰 목록("다가오는 일정")에 일정 사이로 끼우는 한 줄. 일정 줄처럼 이름 / 날짜 두 줄이고,
 * 일정 줄의 `…` 자리 대신 날짜 줄 오른쪽에 링크가 선다 — 이름이 줄 폭을 다 쓴다.
 */
export function UpcomingMarkRow({ mark }: { mark: JourneyMark }) {
  return (
    <li className="flex items-start gap-2.5 border-b border-line px-4 py-3 last:border-0">
      {/* 일정 줄의 점(mt-1.5 · 10px)과 같은 높이에 선다 */}
      <MarkSwatch kind={mark.kind} className="mt-2" />
      <div className="min-w-0 flex-1">
        {/* truncate 가 아니라 두 줄까지 — 병원 줄은 일기 첫 줄(24자)을 달고 와 일정 이름보다 길다.
            한 줄로 자르면 글자 1.5배에서 반 넘게 잘린다(ui:audit 의 "반 넘게 잘린다"). */}
        <span className="line-clamp-2 text-[0.9375rem] font-semibold text-ink">{mark.label}</span>
        <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3">
          <span className="text-xs text-ink-soft">
            {/* "2026-10-25" 를 new Date() 에 그대로 넣으면 UTC 자정으로 읽혀 서쪽 시간대에서 하루 밀린다 */}
            {kDateRelative(fromDateInput(mark.date))}
          </span>
          <BabyPageLink />
        </div>
      </div>
    </li>
  );
}
