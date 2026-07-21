import { prisma } from "@/lib/prisma";
import { CalendarClient } from "./calendar-client";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  // 가족 일정은 양이 적으므로 전체를 한 번에 전달합니다.
  const events = await prisma.calendarEvent.findMany({
    orderBy: { start: "asc" },
  });

  return <CalendarClient initialEvents={events} />;
}
