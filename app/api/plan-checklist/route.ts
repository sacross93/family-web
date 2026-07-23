import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const KINDS = new Set(["prep", "packing"]);

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.planId) {
    return NextResponse.json({ error: "계획을 찾을 수 없어요." }, { status: 400 });
  }
  if (!body?.text?.trim()) {
    return NextResponse.json({ error: "내용을 입력해 주세요." }, { status: 400 });
  }
  const kind = KINDS.has(body.kind) ? body.kind : "packing";

  const last = await prisma.planChecklistItem.findFirst({
    where: { planId: body.planId, kind },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const item = await prisma.planChecklistItem.create({
    data: { planId: body.planId, kind, text: body.text.trim(), sortOrder },
  });
  return NextResponse.json(item);
}
