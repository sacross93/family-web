import { pageTitle } from "@/lib/site";
import { prisma } from "@/lib/prisma";
import { BabyClient } from "./baby-client";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: await pageTitle("/baby", "아기") };
}

/**
 * 아기 페이지 — 준비 → 임신 → 출생. **"아기가 없으면 첫 설정" 화면은 없다** — 아무 기록이 없어도
 * 준비 단계 페이지가 뜬다(그래서 "처음부터 다시 시작" 도 빈 준비 단계로 돌아간다).
 */
export default async function BabyPage() {
  const active = await prisma.pregnancy.findFirst({ where: { endedAt: null }, orderBy: { createdAt: "desc" } });
  const [entries, checklist, links, cycleEvents, settings, members] = await Promise.all([
    prisma.journeyEntry.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }], include: { author: true } }),
    // 지금 단계 것만: 임신 중이면 그 임신의 체크리스트, 아니면 준비 체크리스트(pregnancyId null)
    prisma.journeyChecklistItem.findMany({ where: { pregnancyId: active?.id ?? null }, orderBy: { sortOrder: "asc" } }),
    prisma.journeyLink.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.cycleEvent.findMany({ orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    prisma.journeySettings.findUnique({ where: { id: "main" } }),
    prisma.familyMember.findMany({ orderBy: { createdAt: "asc" } }),
  ]);
  return (
    // key 가 단계(진행 중인 임신)를 따른다 — BabyClient 는 useState(initial) 로 시작하므로
    // router.refresh() 만으로는 상태가 바뀌지 않는다. 임신을 시작하거나 끝내면 key 가 바뀌어
    // 새 단계의 데이터(특히 그 단계의 체크리스트)로 다시 붙는다.
    <BabyClient
      key={active?.id ?? "prep"}
      initial={{ showOnHome: settings?.showOnHome ?? false, active, entries, checklist, links, cycleEvents }}
      members={members}
    />
  );
}
