"use client";

// 달력에 얹는 기념일·계획을 그리는 쪽 — **읽기 전용**(아기 페이지 표시 `journey-marks.tsx` 와 같은 방식).
// 달력은 이 파일의 조각을 세 자리(격자 칸·하루 모달·폰 목록)에 끼우기만 한다. 고치기·지우기는 없다 —
// 줄을 누르면 그 화면(/anniversaries, /plans/<id>)으로 간다. 날짜는 서버가 센 글자(`occasions.ts`)다:
// 여기서 음력을 세지 않는다(음력 표를 달력 묶음에 싣지 않으려고 — 타입만 가져온다).
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { palette } from "@/lib/colors";
import { fromDateInput, kDateRelative } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { AnniversaryOverlay, CalendarOccasions, PlanOverlay } from "./occasions";

/**
 * 계획 막대의 색 — 계획마다 고른 색이 아니라 **하나로 고정**한다. 아기 표시가 로즈·민트·하늘·버터 막대를
 * 쓰므로, 계획 색을 따라가면 로즈 계획이 생리 막대와 같아진다(DESIGN §2 "같은 색이 두 가지를 뜻하면…").
 * 막대 넷이 안 쓰는 라벤더. 무슨 계획인지는 하루 모달·목록의 이모지와 이름이 말한다.
 */
const PLAN_BAR = palette("lavender").dot;

/** 폰 목록에 기념일·계획을 며칠 앞까지 끼울지. 반복 기념일은 해마다 오므로 다 넣으면 목록이 한 해치 생일로 찬다. */
export const OCCASION_HORIZON_DAYS = 60;

export interface DayOccasions {
  anniversaries: AnniversaryOverlay[];
  plans: PlanOverlay[];
}

/** 그날(`day` = "yyyy-MM-dd") 걸리는 기념일·계획. 날짜가 같은 꼴이라 글자 비교가 곧 날짜 비교다. */
export function occasionsOn(o: CalendarOccasions, day: string): DayOccasions {
  return {
    anniversaries: o.anniversaries.filter((a) => a.dates.includes(day)),
    plans: o.plans.filter((p) => p.start <= day && day <= p.end),
  };
}

/**
 * 격자 칸 aria-label 에 붙일 글(", 기념일 엄마 생일, 계획 제주 여행"). 없으면 "".
 * 칸은 aria-label 을 가진 버튼이라 안쪽 글자를 읽지 않는다 — `marksSpeech` 와 같은 이유로 이름에 붙인다.
 */
export function occasionsSpeech(d: DayOccasions): string {
  const parts = [
    ...d.anniversaries.map((a) => `기념일 ${a.title}`),
    ...d.plans.map((p) => `계획 ${p.title}`),
  ];
  return parts.length ? `, ${parts.join(", ")}` : "";
}

export interface UpcomingOccasion {
  /** 목록에 서는 날 "yyyy-MM-dd" */
  date: string;
  kind: "anniversary" | "plan";
  id: string;
  emoji: string;
  title: string;
  href: string;
  /** 기념일: 음력 이름 · 계획: 끝나는 날(여러 날이면) */
  lunar?: string | null;
  end?: string;
  /** 이미 시작한 계획(오늘 줄에 "~까지" 로 선다) */
  ongoing?: boolean;
}

/**
 * 폰 목록("다가오는 일정")에 끼울 기념일·계획. `from`(오늘)부터 `until` 까지, 날짜순.
 * 기념일은 그 사이 첫 날 하나, 계획은 **첫날 하나**(여러 날짜리를 날마다 넣으면 목록이 그 여행으로 찬다 —
 * 그건 격자 막대가 보여 준다). 이미 시작해 아직 안 끝난 계획은 오늘 줄로 선다.
 */
export function upcomingOccasions(o: CalendarOccasions, from: string, until: string): UpcomingOccasion[] {
  const out: UpcomingOccasion[] = [];
  for (const a of o.anniversaries) {
    const date = a.dates.find((d) => d >= from && d <= until);
    if (date) {
      out.push({ date, kind: "anniversary", id: a.id, emoji: a.emoji, title: a.title, href: "/anniversaries", lunar: a.lunar });
    }
  }
  for (const p of o.plans) {
    if (p.end < from || p.start > until) continue;
    const ongoing = p.start < from;
    out.push({
      date: ongoing ? from : p.start,
      kind: "plan",
      id: p.id,
      emoji: p.emoji,
      title: p.title,
      href: `/plans/${p.id}`,
      end: p.end,
      ongoing,
    });
  }
  return out.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}

/** "10월 6일" — 목록·모달의 짧은 날짜(요일까지 붙이면 폰 한 줄을 넘는다). */
function shortDay(day: string): string {
  const d = fromDateInput(day);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 계획의 기간 글: 하루면 "10월 3일", 여러 날이면 "10월 3일 ~ 10월 6일". */
export function planRange(p: Pick<PlanOverlay, "start" | "end">): string {
  return p.start === p.end ? shortDay(p.start) : `${shortDay(p.start)} ~ ${shortDay(p.end)}`;
}

/**
 * 격자 칸 날짜 옆의 기념일 이모지(첫 하나). 무엇인지는 칸 이름(`occasionsSpeech`)과 하루 모달이 말한다.
 * 날짜 숫자 곁(넓으면 옆, 폰에서는 아래)에 두는 이유: 칸 아래쪽은 아기 표시 막대, 가운데는 일정 점·칩이
 * 쓴다 — 자리와 모양으로 갈린다.
 */
export function AnniversaryGlyph({ day, dim = false }: { day: DayOccasions; dim?: boolean }) {
  const first = day.anniversaries[0];
  if (!first) return null;
  return (
    <span aria-hidden className={cn("text-xs leading-none sm:text-sm", dim && "opacity-60")}>
      {first.emoji}
    </span>
  );
}

/** 칸 아래 계획 막대. 아기 표시 막대(`MarkBars`)와 같은 모양·같은 묶음 안에서 맨 위에 선다. */
export function PlanBar({ dim = false }: { dim?: boolean }) {
  return <span aria-hidden className={cn("block h-1 w-full rounded-full", PLAN_BAR, dim && "opacity-60")} />;
}

/** 줄 앞 표: 기념일은 이모지(칸의 그것), 계획은 칸의 막대와 같은 색 막대. */
function OccasionMarker({ kind, emoji, className }: { kind: "anniversary" | "plan"; emoji: string; className?: string }) {
  if (kind === "anniversary") {
    return (
      <span aria-hidden className={cn("flex w-4 shrink-0 justify-center text-sm leading-5", className)}>
        {emoji}
      </span>
    );
  }
  return <span aria-hidden className={cn("mt-2 h-1.5 w-4 shrink-0 rounded-full", PLAN_BAR, className)} />;
}

/** 글자 링크 — `journey-marks.tsx` 의 BabyPageLink 와 같은 모양(-my-3 py-3 로 누를 높이만 40px). */
function GoLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="-my-3 flex shrink-0 items-center gap-0.5 py-3 text-xs font-semibold text-ink-faint transition hover:text-primary"
    >
      {children}
      <ChevronRight className="h-3.5 w-3.5" />
    </Link>
  );
}

const LINK_LABEL = { anniversary: "기념일에서 보기", plan: "계획에서 보기" } as const;

/**
 * 하루 모달용 읽기 전용 줄. 아기 표시 줄(`MarkRows`)과 같은 **테두리만** 판 — 일정(색으로 채운 판)이 아니라는 것이 보인다.
 */
export function OccasionRows({ day }: { day: DayOccasions }) {
  const rows = [
    ...day.anniversaries.map((a) => ({
      key: `a:${a.id}`, kind: "anniversary" as const, emoji: a.emoji, title: a.title, sub: a.lunar, href: "/anniversaries",
    })),
    ...day.plans.map((p) => ({
      key: `p:${p.id}`, kind: "plan" as const, emoji: p.emoji, title: `${p.emoji} ${p.title}`, sub: planRange(p),
      href: `/plans/${p.id}`,
    })),
  ];
  if (rows.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.key} className="flex items-start gap-3 rounded-md border border-line px-3 py-3">
          <OccasionMarker kind={r.kind} emoji={r.emoji} />
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{r.title}</span>
              {r.sub && <span className="block text-xs text-ink-soft">{r.sub}</span>}
            </span>
            <GoLink href={r.href}>{LINK_LABEL[r.kind]}</GoLink>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * 폰 목록("다가오는 일정")에 끼우는 한 줄. `UpcomingMarkRow` 와 같은 꼴 — 이름 / 날짜 두 줄, 날짜 줄 오른쪽에 링크.
 */
export function UpcomingOccasionRow({ occasion: o }: { occasion: UpcomingOccasion }) {
  const when =
    o.kind === "plan" && o.end && o.end !== o.date
      ? o.ongoing
        ? `${shortDay(o.end)}까지`
        : `${kDateRelative(fromDateInput(o.date))}부터 ${shortDay(o.end)}까지`
      : kDateRelative(fromDateInput(o.date));
  return (
    <li className="flex items-start gap-2.5 border-b border-line px-4 py-3 last:border-0">
      <OccasionMarker kind={o.kind} emoji={o.emoji} className={o.kind === "anniversary" ? "mt-0.5" : undefined} />
      <div className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[0.9375rem] font-semibold text-ink">
          {o.kind === "plan" ? `${o.emoji} ${o.title}` : o.title}
        </span>
        <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3">
          <span className="text-xs text-ink-soft">
            {when}
            {o.lunar && ` ${o.lunar}`}
          </span>
          <GoLink href={o.href}>{LINK_LABEL[o.kind]}</GoLink>
        </div>
      </div>
    </li>
  );
}
