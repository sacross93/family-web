// 아기 페이지 "지금 상태" 의 순수한 부분 — 클라이언트 컴포넌트가 가져와도 prisma 가 브라우저 묶음에 섞이지 않게 나눴다.
// (DB 를 읽는 journeyState() 는 lib/journey.ts 에 있고, 그 파일이 여기 것을 전부 다시 내보낸다.)
import { addDays } from "date-fns";
import { periodsFrom, type CyclePrediction } from "@/lib/cycle";
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
  /** 준비 단계일 때만 계산한다. 임신 중에는 null. 끝난 임신 뒤(cycleSince) 새 시작이 없거나 마지막 시작이 60일 넘었어도 null */
  prediction: CyclePrediction | null;
  latestEntry: (JourneyEntry & { author: FamilyMember | null }) | null;
  /** 오늘 이후 병원 기록(가까운 순, 20개까지). 끝난 임신 때 적은 것은 뺀다(`findNextCheckup` 과 같은 규칙) */
  upcomingHospital: JourneyEntry[];
  /** 홈 초대 줄을 띄울지: 임신·일기·주기 중 무엇이든 있으면 */
  hasAnything: boolean;
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

/**
 * 준비 단계의 "다음 생리 예정" 한 줄. 홈 카드·초대 줄·포동이 목차가 **이 하나에서** 글자를 받고,
 * 아기 페이지 히어로의 큰 숫자도 `value` 를 쓴다 — 따로 만들면 언젠가 서로 다른 말을 한다
 * (포동이 목차만 지난 예정일을 "다음 생리 예정" 이라 부르고 있었다).
 * 기록으로 낸 **추정**이라 늘 "추정" 을 붙이고, 날짜와 그 표시 말고는 아무 말도 하지 않는다.
 * 예정일이 지났으면 다음 달로 굴리지 않고 지난 날수만 말한다(`lib/cycle.ts` 와 같은 규칙).
 */
export function prepCountdown(p: Pick<CyclePrediction, "lateDays" | "daysUntilNext">): {
  label: string;
  value: string;
  line: string;
} {
  if (p.lateDays > 0) {
    const value = `${p.lateDays}일 지남`;
    return { label: "예정일에서", value, line: `예정일에서 ${value} · 추정` };
  }
  const value = p.daysUntilNext === 0 ? "오늘" : `D-${p.daysUntilNext}`;
  return { label: "다음 생리 예정", value, line: `다음 생리 예정 ${value} · 추정` };
}

/**
 * 오늘 이후(오늘 포함) 가장 가까운 병원 기록. 준비·임신 두 히어로의 "다음 진료" 가 쓴다.
 * **지금 단계 것만**: 준비 때 적은 것(pregnancyId 없음)과 진행 중인 임신(`activeId`) 것.
 * 끝난(남기기 한) 임신 때 잡아 둔 앞날의 진료가 준비 단계로 돌아온 뒤에도 "다음 진료" 로
 * 올라오면 안 된다. 타임라인에는 그대로 남는다(남기기를 고른 것이다).
 * 서버 쪽(`journeyState().upcomingHospital` → 달력)도 같은 규칙이다.
 */
export function findNextCheckup<T extends { kind: string; date: Date | string; pregnancyId?: string | null }>(
  entries: T[],
  activeId: string | null,
  today: Date = new Date()
): T | null {
  const t = startOfDay(today).getTime();
  return (
    entries
      .filter((e) => e.kind === "checkup" && startOfDay(new Date(e.date)).getTime() >= t)
      .filter((e) => !e.pregnancyId || e.pregnancyId === activeId)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] ?? null
  );
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
