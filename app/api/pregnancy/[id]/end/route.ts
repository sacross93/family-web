import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { imageUrlsIn, sweepUploads } from "@/lib/uploads";
import { cycleSinceAfter } from "@/lib/cycle";

/**
 * 준비 단계로 돌아간다.
 * - keep: true  → endedAt 만 찍는다. 그 기간 일기는 타임라인에 남는다(이미 끝났으면 그대로).
 * - keep: false → 그 임신을 지운다. 도장 찍힌 일기·체크리스트가 cascade 로 같이 사라진다.
 *   **이미 끝난(남기기 했던) 임신도 지운다** — 안 그러면 한 번 남긴 기간은 전체 리셋 말고는 지울 길이 없다.
 * 둘 다 몇 번 불러도 같은 결과다.
 *
 * 둘 다 `JourneySettings.cycleSince` 를 그 임신의 추정 시작(예정일 − 266일, `cycleSinceAfter`)으로 찍는다 —
 * 주기 기록은 임신 동안에도 남아 있어서, 안 찍으면 준비 단계의 예측이 **임신 전** 생리일을 기준으로
 * "21일 지남" 을 날마다 키운다(lib/cycle.ts `predictCycle` 의 since). 누른 날이 아닌 이유: 끝나고 며칠 뒤에
 * 눌러도 그 사이에 시작한 생리가 기준이 되어야 한다.
 * 임신을 **끝내거나 지우기 전에** 읽는다(지우면 예정일이 없다). 없는 id 면 건드리지 않는다.
 * 값은 앞으로 물러나지 않으므로 몇 번 불러도 같은 결과다.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (typeof body?.keep !== "boolean") {
    return NextResponse.json({ error: "남길지 지울지 골라 주세요." }, { status: 400 });
  }
  const [pregnancy, settings] = await Promise.all([
    prisma.pregnancy.findUnique({ where: { id }, select: { dueDate: true } }),
    prisma.journeySettings.findUnique({ where: { id: "main" }, select: { cycleSince: true } }),
  ]);
  if (pregnancy) {
    const cycleSince = cycleSinceAfter(pregnancy.dueDate, new Date(), settings?.cycleSince);
    await prisma.journeySettings.upsert({
      where: { id: "main" },
      create: { id: "main", cycleSince },
      update: { cycleSince },
    });
  }
  if (body.keep) {
    await prisma.pregnancy.updateMany({ where: { id, endedAt: null }, data: { endedAt: new Date() } });
    return NextResponse.json({ ok: true });
  }
  // 사진 주소는 지우기 전에 — cascade 로 일기가 사라지면 본문을 못 읽는다.
  const entries = await prisma.journeyEntry.findMany({ where: { pregnancyId: id }, select: { content: true } });
  await prisma.pregnancy.deleteMany({ where: { id } });
  await sweepUploads(entries.flatMap((e) => imageUrlsIn(e.content)));
  return NextResponse.json({ ok: true });
}
