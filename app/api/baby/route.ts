import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { imageUrlsIn, sweepUploads } from "@/lib/uploads";
import { stageOf } from "@/lib/journey";

/** 지금 단계와 홈 표시 — 검사(ui-flows)·홈 초대 줄이 쓴다 */
export async function GET() {
  const [settings, active] = await Promise.all([
    prisma.journeySettings.findUnique({ where: { id: "main" } }),
    prisma.pregnancy.findFirst({
      where: { endedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, nickname: true, dueDate: true, birthDate: true },
    }),
  ]);
  return NextResponse.json({ stage: stageOf(active), showOnHome: settings?.showOnHome ?? false, active });
}

/** 페이지 설정 — 지금은 홈 표시 하나. 싱글턴이라 없으면 만든다 */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (typeof body?.showOnHome !== "boolean") {
    return NextResponse.json({ error: "바꿀 설정이 없어요." }, { status: 400 });
  }
  const s = await prisma.journeySettings.upsert({
    where: { id: "main" },
    create: { id: "main", showOnHome: body.showOnHome },
    update: { showOnHome: body.showOnHome },
  });
  return NextResponse.json({ showOnHome: s.showOnHome });
}

/** 처음부터 다시 시작: 아기 페이지의 모든 기록(주기 기록·임신·설정 포함)을 지운다 */
export async function DELETE() {
  // 사진 주소는 **지우기 전에** 챙긴다 — 일기가 사라지면 읽을 본문이 없다.
  const entries = await prisma.journeyEntry.findMany({ select: { content: true } });
  const urls = entries.flatMap((e) => imageUrlsIn(e.content));
  // 전부 deleteMany — 이미 비어 있으면 0건을 지우고 끝난다. 두 번 눌러도 같은 결과다.
  // 자식(일기·체크리스트)부터 지우면 FK 순서를 신경 쓸 일이 없다.
  await prisma.$transaction([
    prisma.journeyEntry.deleteMany({}),
    prisma.journeyChecklistItem.deleteMany({}),
    prisma.journeyLink.deleteMany({}),
    prisma.cycleEvent.deleteMany({}),
    prisma.pregnancy.deleteMany({}),
    prisma.journeySettings.deleteMany({}),
  ]);
  // 행을 지운 뒤에 훑는다: "아직 어디서 쓰이나" 를 세므로 순서가 바뀌면 하나도 못 지운다.
  await sweepUploads(urls);
  return NextResponse.json({ ok: true });
}
