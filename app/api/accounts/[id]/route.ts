import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { checkPassword } from "@/lib/accounts";

export const runtime = "nodejs";

/**
 * 비밀번호 바꾸기 — 가족이 비밀번호를 잊었을 때 관리자가 새로 정해 준다.
 *
 * 본문에서 **`password` 하나만** 읽는다. 아이디·관리자 여부는 만들 때 정한 그대로다 —
 * 여기서 다른 칸을 받아 주면 비밀번호를 바꾸는 요청 하나로 가족이 관리자가 될 수 있다.
 *
 * 이미 로그인한 기기는 **그대로 둔다**(세션은 30일짜리 서명 쿠키라 DB 를 보지 않는다).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "관리자만 바꿀 수 있어요." }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);

  const p = checkPassword(body?.password);
  if (p.error !== undefined) return NextResponse.json({ error: p.error }, { status: 400 });

  // `update` 는 없는 행에 P2025(500)를 던진다 — 404 로 알려 준다.
  const rows = await prisma.appUser.updateMany({
    where: { id },
    data: { passwordHash: await bcrypt.hash(p.password, 10) },
  });
  if (rows.count === 0) return NextResponse.json({ error: "그 계정을 찾지 못했어요." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
