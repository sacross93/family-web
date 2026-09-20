import { pageTitle } from "@/lib/site";
import { prisma } from "@/lib/prisma";
import { CalendarClient } from "./calendar-client";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: await pageTitle("/calendar", "캘린더") };
}

export default async function CalendarPage() {
  // 가족 일정은 양이 적으므로 전체를 한 번에 전달합니다.
  const events = await prisma.calendarEvent.findMany({
    orderBy: { start: "asc" },
  });

  return <CalendarClient initialEvents={events} />;
}
