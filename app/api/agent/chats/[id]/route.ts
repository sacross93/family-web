// 대화 하나 — 불러오기와 지우기.
import { NextRequest, NextResponse } from "next/server";
import { deleteChat, loadHistory } from "@/lib/agent/chat-store";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** 화면이 한 대화를 통째로 펼치는 데 쓰는 상한. 루프에 넘기는 창(AGENT_HISTORY)과는 다르다. */
const HISTORY_LIMIT = 200;
const NOT_FOUND = "그 대화를 찾지 못했어요.";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // loadHistory 는 없는 대화에도 빈 배열을 돌려준다 — 404 를 주려면 여기서 먼저 확인해야 한다.
  const chat = await prisma.agentChat.findUnique({
    where: { id },
    select: { id: true, title: true },
  });
  if (!chat) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

  const messages = await loadHistory(id, HISTORY_LIMIT);
  return NextResponse.json({ id: chat.id, title: chat.title, messages });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 없는 id 여도 조용히 지나간다(중복 클릭·재시도 안전).
  await deleteChat(id);
  return NextResponse.json({ ok: true });
}
