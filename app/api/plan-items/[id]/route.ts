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
  if ("dayDate" in body)
    data.dayDate = body.dayDate ? new Date(body.dayDate) : null;
  if ("time" in body) data.time = body.time?.trim() || null;
  if (body.tz === "home" || body.tz === "local") data.tz = body.tz;
  if ("note" in body) data.note = body.note?.trim() || null;
  if ("location" in body) data.location = body.location?.trim() || null;
  if (typeof body.category === "string") data.category = body.category;
  if (typeof body.done === "boolean") data.done = body.done;
  if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;

  const item = await prisma.planItem.update({ where: { id }, data });
  return NextResponse.json(item);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.planItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
