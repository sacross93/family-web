import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ALLOWED_TYPES = ["birthday", "anniversary", "memorial", "event"];

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const s = value.trim();
  const d = new Date(s.length <= 10 ? `${s}T00:00:00` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  // 허용 필드만 반영
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim())
    data.title = body.title.trim();
  if ("date" in body) {
    const date = parseDate(body.date);
    if (date) data.date = date;
  }
  if (typeof body.type === "string" && ALLOWED_TYPES.includes(body.type))
    data.type = body.type;
  if (typeof body.recurring === "boolean") data.recurring = body.recurring;
  if (typeof body.emoji === "string") data.emoji = body.emoji.trim() || "🎉";
  if (typeof body.color === "string") data.color = body.color;
  if ("note" in body) data.note = body.note?.trim() || null;
  if (typeof body.memberId === "string" || body.memberId === null)
    data.memberId = body.memberId || null;

  const item = await prisma.anniversary.update({
    where: { id },
    data,
    include: { member: true },
  });
  return NextResponse.json(item);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.anniversary.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
