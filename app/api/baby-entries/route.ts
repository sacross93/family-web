import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateInput } from "@/lib/date";

const KINDS = new Set(["diary", "checkup", "letter"]);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.babyId) {
    return NextResponse.json({ error: "아기를 찾을 수 없어요." }, { status: 400 });
  }
  const content = String(body?.content ?? "").trim();
  if (!content) {
    return NextResponse.json({ error: "내용을 적어 주세요." }, { status: 400 });
  }
  const date = body?.date ? parseDateInput(body.date) : new Date();
  if (!date) {
    return NextResponse.json({ error: "날짜를 확인해 주세요." }, { status: 400 });
  }

  const entry = await prisma.babyEntry.create({
    data: {
      babyId: body.babyId,
      date,
      kind: KINDS.has(body.kind) ? body.kind : "diary",
      mood: typeof body.mood === "string" && body.mood.trim() ? body.mood.trim() : null,
      content,
      authorId: body.authorId || null,
    },
    include: { author: true },
  });
  return NextResponse.json(entry);
}
