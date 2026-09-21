import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // `delete` 가 아니라 `deleteMany` — 없는 행에 `delete` 를 걸면 P2025 가 던져져 500 이 되고,
  // 화면은 낙관적 삭제를 되돌려 지운 것이 되살아난다(AGENTS.md).
  await prisma.agentMemory.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
