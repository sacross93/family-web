import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");

  if (!username || !password) {
    return NextResponse.json(
      { error: "아이디와 비밀번호를 입력해 주세요." },
      { status: 400 }
    );
  }

  const user = await prisma.appUser.findUnique({ where: { username } });
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!user || !ok) {
    return NextResponse.json(
      { error: "아이디 또는 비밀번호가 올바르지 않아요." },
      { status: 401 }
    );
  }

  const token = await createSessionToken({
    uid: user.id,
    username: user.username,
    name: user.name,
    isAdmin: user.isAdmin,
  });

  const res = NextResponse.json({ ok: true, isAdmin: user.isAdmin, name: user.name });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}
