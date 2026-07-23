import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

  const plan = await prisma.plan.update({
    where: { id },
    data,
    include: { items: { orderBy: [{ dayDate: "asc" }, { sortOrder: "asc" }] } },
  });
  return NextResponse.json(plan);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.plan.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
