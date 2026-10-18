import { pageTitle } from "@/lib/site";
import { prisma } from "@/lib/prisma";
import { journeyState, journeyMarks } from "@/lib/journey";
import { GoogleSyncTrigger } from "@/components/google-sync-trigger";
import { CalendarClient } from "./calendar-client";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: await pageTitle("/calendar", "캘린더") };
}

export default async function CalendarPage() {
  // 가족 일정은 양이 적으므로 전체를 한 번에 전달합니다.
  const [events, marks] = await Promise.all([
    // 구글 연결은 있는지와 readOnly 만 — 꼬리표 `G` 와 "구글 캘린더에서 고쳐 주세요" 에 쓴다.
    prisma.calendarEvent.findMany({
      orderBy: { start: "asc" },
      include: { googleLink: { select: { readOnly: true } } },
    }),
    // 아기 페이지에서 오는 읽기 전용 표시(주기 추정·병원·예정일). 못 읽어도 달력은 떠야 한다.
    journeyState().then(journeyMarks).catch(() => []),
  ]);

  return (
    <>
      {/* 그려진 뒤 구글 캘린더와 맞춘다 — 바뀐 게 들어오면 router.refresh() 로 이 페이지를 다시 읽는다. */}
      <GoogleSyncTrigger />
      <CalendarClient initialEvents={events} marks={marks} />
    </>
  );
}
