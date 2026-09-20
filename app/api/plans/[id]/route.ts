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
  if (typeof body.type === "string") data.type = body.type;
  if (typeof body.emoji === "string") data.emoji = body.emoji.trim() || "🗺️";
  if (typeof body.color === "string") data.color = body.color;
  if ("description" in body) data.description = body.description?.trim() || null;
  if ("location" in body) data.location = body.location?.trim() || null;
  if ("startDate" in body)
    data.startDate = body.startDate ? new Date(body.startDate) : null;
  if ("endDate" in body)
    data.endDate = body.endDate ? new Date(body.endDate) : null;
  if (typeof body.tzOffsetMin === "number")
    data.tzOffsetMin = Math.round(body.tzOffsetMin);
  if (typeof body.memo === "string") data.memo = body.memo;

  // 고치면서 뺀 사진은 주인이 없어진다 — 고치기 전 글을 챙겨 두고 나중에 훑는다.
  const prev =
    "description" in data || "memo" in data
      ? await prisma.plan.findUnique({ where: { id }, select: { description: true, memo: true } })
      : null;

  const plan = await prisma.plan.update({
    where: { id },
    data,
    include: { items: { orderBy: [{ dayDate: "asc" }, { sortOrder: "asc" }] } },
  });
  if (prev) {
    await sweepUploads([...imageUrlsIn(prev.description), ...imageUrlsIn(prev.memo)]);
  }
  return NextResponse.json(plan);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // 계획 설명·아이디어 메모·일정 메모에 넣은 사진도 같이 지운다.
  const before = await prisma.plan.findUnique({
    where: { id },
    select: { description: true, memo: true, items: { select: { note: true } } },
  });
  // `delete` 가 아니라 `deleteMany` — 없는 행을 지우면 prisma 가 P2025 를 던져 **500** 이 된다.
  // 공유 목록이라 실제로 일어난다: 두 사람이 같은 항목을 동시에 지우면 뒤쪽이 500 을 받고,
  // 화면은 낙관적 삭제를 되돌려 **지운 것이 되살아난다.** 이미 없으면 그걸로 된 것이다.
  await prisma.plan.deleteMany({ where: { id } });
  await sweepUploads([
    ...imageUrlsIn(before?.description),
    ...imageUrlsIn(before?.memo),
    ...(before?.items ?? []).flatMap((i) => imageUrlsIn(i.note)),
  ]);
  return NextResponse.json({ ok: true });
}
