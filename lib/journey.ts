// 아기 페이지의 "지금 상태" 를 한 곳에서 읽는다 — 홈 · 달력 · 포동이가 모두 이것을 부른다.
// (아기 페이지 자체는 일기 전체가 필요해 page.tsx 가 따로 읽는다.)
// 홈은 요청당 SQL 이 16개로 재여 있다(2026-09-23). 여기서 다섯 개를 쓴다 — 늘리면 다시 잴 것.
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { predictCycle, periodsFrom, type CyclePrediction } from "@/lib/cycle";
import { startOfDay, toDateInput, isSameDay } from "@/lib/date";
import type { CycleEvent, FamilyMember, JourneyEntry, Pregnancy } from "@prisma/client";

export type Stage = "prep" | "pregnant" | "born";

/** 단계는 저장하지 않고 계산한다: 진행 중인 임신 없음 = 준비, 있음 = 임신, 출생일 = 출생 */
export function stageOf(active: Pick<Pregnancy, "birthDate"> | null): Stage {
  if (!active) return "prep";
  return active.birthDate ? "born" : "pregnant";
}

export interface JourneyState {
  showOnHome: boolean;
  /** 진행 중인 임신(endedAt 없음). 없으면 준비 단계 */
  active: Pregnancy | null;
  stage: Stage;
  /** 날짜순 전부(작은 표다) */
  cycleEvents: CycleEvent[];
  /** 준비 단계일 때만 계산한다. 임신 중에는 null */
  prediction: CyclePrediction | null;
  latestEntry: (JourneyEntry & { author: FamilyMember | null }) | null;
  /** 오늘 이후 병원 기록(가까운 순, 20개까지) */
  upcomingHospital: JourneyEntry[];
  /** 홈 초대 줄을 띄울지: 임신·일기·주기 중 무엇이든 있으면 */
  hasAnything: boolean;
}

export async function journeyState(today: Date = new Date()): Promise<JourneyState> {
  const t = startOfDay(today);
  const [settings, active, cycleEvents, latestEntry, upcomingHospital] = await Promise.all([
    prisma.journeySettings.findUnique({ where: { id: "main" } }),
    prisma.pregnancy.findFirst({ where: { endedAt: null }, orderBy: { createdAt: "desc" } }),
    prisma.cycleEvent.findMany({ orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    prisma.journeyEntry.findFirst({
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: { author: true },
    }),
    prisma.journeyEntry.findMany({
      where: { kind: "checkup", date: { gte: t } },
      orderBy: { date: "asc" },
      take: 20,
    }),
  ]);
  const stage = stageOf(active);
  return {
    showOnHome: settings?.showOnHome ?? false,
    active,
    stage,
    cycleEvents,
    prediction: stage === "prep" ? predictCycle(cycleEvents, today) : null,
    latestEntry,
    upcomingHospital,
    hasAnything: Boolean(active || latestEntry || cycleEvents.length > 0),
  };
}

export type MarkKind = "period" | "periodPredicted" | "fertile" | "ovulation" | "hospital" | "due";

/** 달력에 얹는 읽기 전용 표시. CalendarEvent 로 저장하지 않는다(주기를 적을 때마다 다시 맞춰야 한다). */
export interface JourneyMark {
  /** "yyyy-MM-dd" */
  date: string;
  kind: MarkKind;
  label: string;
}

/** 마크다운 첫 줄을 글자로. 기호(#·>·*·-·`)와 이미지·링크 껍데기를 걷어낸다. */
export function firstLineOf(content: string, max = 24): string {
  const line =
    content
      .split("\n")
      .map((l) =>
        l
          .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
          .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
          .replace(/^[\s#>*\-+]+/, "")
          .replace(/[*_`~]/g, "")
          .trim()
      )
      .find(Boolean) ?? "";
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

function eachDay(from: Date, to: Date, fn: (d: Date) => void) {
  for (let d = startOfDay(from); d.getTime() <= startOfDay(to).getTime(); d = addDays(d, 1)) fn(d);
}

export function journeyMarks(
  s: Pick<JourneyState, "stage" | "active" | "cycleEvents" | "prediction" | "upcomingHospital">
): JourneyMark[] {
  const out: JourneyMark[] = [];
  const push = (d: Date, kind: MarkKind, label: string) => out.push({ date: toDateInput(d), kind, label });

  // 주기 표시는 준비 단계에서만 — 임신 중에 "다음 생리 예정" 을 그리면 안 된다.
  if (s.stage === "prep") {
    for (const p of periodsFrom(s.cycleEvents)) eachDay(p.start, p.end ?? p.start, (d) => push(d, "period", "생리"));
    const pr = s.prediction;
    // 예정일이 지났으면 예정·가임기를 그리지 않는다 — 지난 날짜에 "예정" 을 칠하면 거짓말이다.
    if (pr && pr.lateDays === 0) {
      eachDay(pr.nextStart, addDays(pr.nextStart, pr.avgPeriod - 1), (d) =>
        push(d, "periodPredicted", "생리 예정 (추정)")
      );
      eachDay(pr.fertileStart, pr.fertileEnd, (d) =>
        isSameDay(d, pr.ovulation) ? push(d, "ovulation", "배란 예정 (추정)") : push(d, "fertile", "가임기 (추정)")
      );
    }
  }
  for (const h of s.upcomingHospital) push(h.date, "hospital", `병원 · ${firstLineOf(h.content) || "진료"}`);
  if (s.stage === "pregnant" && s.active) push(s.active.dueDate, "due", `${s.active.nickname} 출산 예정일`);
  return out;
}
