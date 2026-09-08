import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeUrl } from "@/lib/url";

/** 참고 사이트 추가 { babyId, url, title? } */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.babyId) {
    return NextResponse.json({ error: "아기를 찾을 수 없어요." }, { status: 400 });
  }

  const url = normalizeUrl(body.url);
  if (!url) {
    return NextResponse.json({ error: "주소를 확인해 주세요." }, { status: 400 });
  }
  const title = String(body.title ?? "").trim();

  const last = await prisma.babyLink.findFirst({
    where: { babyId: body.babyId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const link = await prisma.babyLink.create({
    data: { babyId: body.babyId, url, title, sortOrder },
  });
  return NextResponse.json(link);
}
