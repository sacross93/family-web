import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const plans = await prisma.plan.findMany({
    include: { _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(plans);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.title?.trim()) {
    return NextResponse.json({ error: "제목을 입력해 주세요." }, { status: 400 });
  }
  const plan = await prisma.plan.create({
    data: {
      title: body.title.trim(),
      type: body.type || "여행",
      emoji: body.emoji?.trim() || "🗺️",
      color: body.color || "sky",
      description: body.description?.trim() || null,
      location: body.location?.trim() || null,
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
    },
    include: { _count: { select: { items: true } } },
  });
  return NextResponse.json(plan);
}
