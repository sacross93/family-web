import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { ACCOUNT_SELECT, checkPassword, cleanName } from "@/lib/accounts";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

export const runtime = "nodejs";

/**
 * 계정 고치기 — 이름(사이트 위 "○○ 님")과 비밀번호. 가족이 비밀번호를 잊었을 때도 여기서 새로 정해 준다.
 *
 * 본문에서 **`name`·`password` 둘만** 읽고, 온 것만 쓴다. 아이디·관리자 여부는 만들 때 정한 그대로다 —
 * 여기서 다른 칸을 받아 주면 이름을 바꾸는 요청 하나로 가족이 관리자가 될 수 있다.
 *
 * 세션은 30일짜리 서명 쿠키(JWT)라 DB 를 보지 않는다. 그래서
 * - 이미 로그인한 기기는 비밀번호를 바꿔도 **그대로 로그인돼 있다.**
 * - 이름은 그 쿠키에 실려 있다. **내 이름**을 바꾸면 이 응답에 쿠키를 새로 실어 바로 바뀌게 한다
 *   (uid·아이디·관리자 여부는 지금 세션 그대로 — 본문에서 읽지 않는다). **남의 이름**은 그 사람이
 *   다시 로그인할 때까지 예전 이름이 보인다 — 화면마다 DB 를 한 번 더 읽게 만들지 않으려고 일부러 둔다.
 *   남의 계정에 쿠키를 실으면 관리자가 그 사람으로 로그인된다.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "관리자만 바꿀 수 있어요." }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);

  // 한 칸씩 골라 담는다 — `body` 를 펼쳐 넣으면 위의 약속이 깨진다.
  const data: { passwordHash?: string; name?: string | null } = {};
  if (body?.password !== undefined) {
    const p = checkPassword(body.password);
    if (p.error !== undefined) return NextResponse.json({ error: p.error }, { status: 400 });
    data.passwordHash = await bcrypt.hash(p.password, 10);
  }
  // 비우면 null — 위에는 아이디가 대신 나온다.
  if (body?.name !== undefined) data.name = cleanName(body.name);
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "바꿀 이름이나 비밀번호를 적어 주세요." }, { status: 400 });
  }

  // `update` 는 없는 행에 P2025(500)를 던진다 — 404 로 알려 준다.
  const rows = await prisma.appUser.updateMany({ where: { id }, data });
  if (rows.count === 0) return NextResponse.json({ error: "그 계정을 찾지 못했어요." }, { status: 404 });

  const row = await prisma.appUser.findUnique({ where: { id }, select: ACCOUNT_SELECT });
  if (!row) return NextResponse.json({ error: "그 계정을 찾지 못했어요." }, { status: 404 });

  const res = NextResponse.json(row);
  if ("name" in data && id === user.uid) {
    const token = await createSessionToken({
      uid: user.uid,
      username: user.username,
      name: row.name,
      isAdmin: user.isAdmin,
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  }
  return res;
}
