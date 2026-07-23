import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.planId) {
    return NextResponse.json({ error: "계획을 찾을 수 없어요." }, { status: 400 });
  }
  if (!body?.title?.trim()) {
    return NextResponse.json({ error: "일정 내용을 입력해 주세요." }, { status: 400 });
  }
  const item = await prisma.planItem.create({
    data: {
      planId: body.planId,
      dayDate: body.dayDate ? new Date(body.dayDate) : null,
      time: body.time?.trim() || null,
      tz: body.tz === "home" ? "home" : "local",
      title: body.title.trim(),
      note: body.note?.trim() || null,
      location: body.location?.trim() || null,
      category: body.category || "mint",
    },
  });
  return NextResponse.json(item);
}
