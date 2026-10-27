import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { removeUpload } from "@/lib/uploads";
import { parseDateInput } from "@/lib/date";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  // 허용 필드만 반영
  const data: Record<string, unknown> = {};
  if ("caption" in body) data.caption = body.caption?.trim() || null;
  if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;
  // 찍은 날 — "yyyy-MM-dd" 는 서버 로컬 자정(POST 와 같은 규칙), 빈 값·null 은 지우기.
  // 못 읽는 글자는 지우기로 치지 않고 그대로 둔다.
  if ("takenAt" in body) {
    const takenAt = parseDateInput(body.takenAt);
    if (takenAt || !body.takenAt) data.takenAt = takenAt;
  }

  const photo = await prisma.photo.update({ where: { id }, data });
  return NextResponse.json(photo);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const photo = await prisma.photo.findUnique({ where: { id }, select: { url: true } });
  if (!photo) return NextResponse.json({ ok: true });

  // 파일을 먼저 지운다. 행을 먼저 지우면 파일 삭제가 실패했을 때 어느 파일이었는지
  // 알 길이 없는 고아가 남는다 — 그게 고치려던 상태다.
  if (!(await removeUpload(photo.url))) {
    return NextResponse.json({ error: "사진 파일을 못 지웠어요. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }
  // `delete` 가 아니라 `deleteMany` — 없는 행을 지우면 prisma 가 P2025 를 던져 **500** 이 된다.
  // 공유 목록이라 실제로 일어난다: 두 사람이 같은 항목을 동시에 지우면 뒤쪽이 500 을 받고,
  // 화면은 낙관적 삭제를 되돌려 **지운 것이 되살아난다.** 이미 없으면 그걸로 된 것이다.
  await prisma.photo.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
