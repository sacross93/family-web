import { pageTitle } from "@/lib/site";
import { prisma } from "@/lib/prisma";
import { journeyState, journeyMarks } from "@/lib/journey";
import { CalendarClient } from "./calendar-client";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: await pageTitle("/calendar", "캘린더") };
}

export default async function CalendarPage() {
  // 가족 일정은 양이 적으므로 전체를 한 번에 전달합니다.
  const [events, marks] = await Promise.all([
    prisma.calendarEvent.findMany({ orderBy: { start: "asc" } }),
    // 아기 페이지에서 오는 읽기 전용 표시(주기 추정·병원·예정일). 못 읽어도 달력은 떠야 한다.
    journeyState().then(journeyMarks).catch(() => []),
  ]);

  return <CalendarClient initialEvents={events} marks={marks} />;
}
