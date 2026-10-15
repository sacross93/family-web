// 아기 페이지의 "지금 상태" 를 한 곳에서 읽는다 — 홈 · 달력 · 포동이가 모두 이것을 부른다.
// (아기 페이지 자체는 일기 전체가 필요해 page.tsx 가 따로 읽는다.)
// 홈은 요청당 SQL 이 16개로 재여 있다(2026-09-23). 여기서 다섯 개를 쓴다 — 늘리면 다시 잴 것.
// 서버 전용(prisma). 순수한 부분은 lib/journey-core.ts 에 있고 여기서 그대로 다시 내보낸다 —
// 클라이언트 컴포넌트는 "@/lib/journey-core" 에서 가져올 것.
import { prisma } from "@/lib/prisma";
import { predictCycle } from "@/lib/cycle";
import { startOfDay } from "@/lib/date";
import { stageOf, type JourneyState } from "@/lib/journey-core";

export * from "@/lib/journey-core";

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
      // 끝난(남기기 한) 임신 때 잡아 둔 진료는 빼고 — 준비로 돌아온 뒤 달력에 "병원" 으로 남으면 안 된다.
      // 아기 페이지 히어로의 "다음 진료"(`findNextCheckup`)와 같은 규칙이다.
      where: { kind: "checkup", date: { gte: t }, OR: [{ pregnancyId: null }, { pregnancy: { endedAt: null } }] },
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
    // cycleSince: 끝난 임신의 추정 시작 — 그 앞의 시작(임신 전 생리)은 예측의 기준이 못 된다.
    prediction: stage === "prep" ? predictCycle(cycleEvents, today, settings?.cycleSince) : null,
    latestEntry,
    upcomingHospital,
    hasAnything: Boolean(active || latestEntry || cycleEvents.length > 0),
  };
}
