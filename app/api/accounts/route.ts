import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { ACCOUNT_SELECT, checkPassword, checkUsername, cleanName, isUniqueViolation } from "@/lib/accounts";

export const runtime = "nodejs";

/**
 * 로그인 계정(`AppUser`). 가족(`FamilyMember` — 담당자·글쓴이로 고르는 이름)과는 다른 표다.
 *
 * 이 라우트가 생기기 전에는 계정을 만들 길이 `npm run user:add` 뿐이었다 — 터미널이 있어야 했다.
 * 그 스크립트는 같은 아이디면 **덮어쓰지만**(upsert) 여기서는 409 로 돌려보낸다. 화면에서 잘못 친
 * 아이디 하나로 남의 비밀번호와 관리자 권한이 바뀌면 안 된다.
 *
 * 지우기·관리자↔가족 바꾸기는 **일부러 없다.** 이름·비밀번호 고치기는 `[id]/route.ts`.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "관리자만 볼 수 있어요." }, { status: 403 });
  }
  return NextResponse.json(
    await prisma.appUser.findMany({ select: ACCOUNT_SELECT, orderBy: { createdAt: "asc" } })
  );
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "관리자만 계정을 만들 수 있어요." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);

  const u = checkUsername(body?.username);
  if (u.error !== undefined) return NextResponse.json({ error: u.error }, { status: 400 });
  const p = checkPassword(body?.password);
  if (p.error !== undefined) return NextResponse.json({ error: p.error }, { status: 400 });

  const passwordHash = await bcrypt.hash(p.password, 10);
  try {
    const created = await prisma.appUser.create({
      data: {
        username: u.username,
        passwordHash,
        name: cleanName(body?.name),
        // `"true"` 같은 글자로는 관리자가 되지 않는다.
        isAdmin: body?.isAdmin === true,
      },
      select: ACCOUNT_SELECT,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "이미 있는 아이디예요." }, { status: 409 });
    }
    throw e;
  }
}
