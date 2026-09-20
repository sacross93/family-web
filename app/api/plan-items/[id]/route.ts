import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { imageUrlsIn, sweepUploads } from "@/lib/uploads";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  // 허용 필드만 반영
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title.trim();
  if ("dayDate" in body)
    data.dayDate = body.dayDate ? new Date(body.dayDate) : null;
  if ("time" in body) data.time = body.time?.trim() || null;
  if (body.tz === "home" || body.tz === "local") data.tz = body.tz;
  if ("note" in body) data.note = body.note?.trim() || null;
  if ("location" in body) data.location = body.location?.trim() || null;
  if (typeof body.category === "string") data.category = body.category;
  if (typeof body.done === "boolean") data.done = body.done;
  if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;

  const prev =
    "note" in data
      ? await prisma.planItem.findUnique({ where: { id }, select: { note: true } })
      : null;

  const item = await prisma.planItem.update({ where: { id }, data });
  if (prev) await sweepUploads(imageUrlsIn(prev.note));
  return NextResponse.json(item);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const before = await prisma.planItem.findUnique({ where: { id }, select: { note: true } });
  // `delete` 가 아니라 `deleteMany` — 없는 행을 지우면 prisma 가 P2025 를 던져 **500** 이 된다.
  // 공유 목록이라 실제로 일어난다: 두 사람이 같은 항목을 동시에 지우면 뒤쪽이 500 을 받고,
  // 화면은 낙관적 삭제를 되돌려 **지운 것이 되살아난다.** 이미 없으면 그걸로 된 것이다.
  await prisma.planItem.deleteMany({ where: { id } });
  await sweepUploads(imageUrlsIn(before?.note));
  return NextResponse.json({ ok: true });
}
