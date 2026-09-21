import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { PALETTE_KEYS } from "@/lib/colors";

export const runtime = "nodejs";

function clean(v: unknown, max: number): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "관리자만 바꿀 수 있어요." }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const data: Record<string, unknown> = {};

  if (body?.name !== undefined) {
    const name = clean(body.name, 20);
    if (!name) return NextResponse.json({ error: "이름을 적어 주세요." }, { status: 400 });
    const same = await prisma.familyMember.findFirst({ where: { name, NOT: { id } }, select: { id: true } });
    if (same) return NextResponse.json({ error: `"${name}" 은(는) 이미 있어요.` }, { status: 409 });
    data.name = name;
  }
  if (body?.emoji !== undefined) data.emoji = clean(body.emoji, 4) || "🙂";
  if (body?.role !== undefined) data.role = clean(body.role, 20) || null;
  if (body?.color !== undefined && (PALETTE_KEYS as string[]).includes(String(body.color))) data.color = String(body.color);

  const rows = await prisma.familyMember.updateMany({ where: { id }, data });
  if (rows.count === 0) return NextResponse.json({ error: "그 사람을 찾지 못했어요." }, { status: 404 });
  return NextResponse.json(await prisma.familyMember.findUnique({ where: { id } }));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "관리자만 지울 수 있어요." }, { status: 403 });
  }
  const { id } = await params;
  // `delete` 가 아니라 `deleteMany` — 없는 행에 delete 를 걸면 P2025 로 500 이 되고 화면이
  // 낙관적 삭제를 되돌린다(AGENTS.md). 스키마의 관계는 전부 `onDelete: SetNull` 이라,
  // 지운 사람이 쓴 글·할일은 **남고 이름만 빈다.** 글이 같이 사라지지 않는다.
  await prisma.familyMember.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
