import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const items = await prisma.shoppingItem.findMany({
    orderBy: [{ done: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
    include: { addedBy: true },
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.name?.trim()) {
    return NextResponse.json({ error: "이름을 입력해 주세요." }, { status: 400 });
  }
  const item = await prisma.shoppingItem.create({
    data: {
      name: body.name.trim(),
      quantity: body.quantity?.trim() || null,
      category: body.category || "mint",
      addedById: body.addedById || null,
    },
    include: { addedBy: true },
  });
  return NextResponse.json(item);
}
