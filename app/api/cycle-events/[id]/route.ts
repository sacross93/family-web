import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // deleteMany — 이미 없으면 0건. 두 번 눌러도 200 이라 화면이 지운 줄을 되살리지 않는다.
  await prisma.cycleEvent.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
