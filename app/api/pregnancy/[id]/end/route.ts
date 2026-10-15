import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { imageUrlsIn, sweepUploads } from "@/lib/uploads";

/**
 * 준비 단계로 돌아간다.
 * - keep: true  → endedAt 만 찍는다. 그 기간 일기는 타임라인에 남는다(이미 끝났으면 그대로).
 * - keep: false → 그 임신을 지운다. 도장 찍힌 일기·체크리스트가 cascade 로 같이 사라진다.
 *   **이미 끝난(남기기 했던) 임신도 지운다** — 안 그러면 한 번 남긴 기간은 전체 리셋 말고는 지울 길이 없다.
 * 둘 다 몇 번 불러도 같은 결과다.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (typeof body?.keep !== "boolean") {
    return NextResponse.json({ error: "남길지 지울지 골라 주세요." }, { status: 400 });
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
