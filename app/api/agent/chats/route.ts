// 대화 목록. 공용 계정 하나를 온 가족이 함께 쓰므로 대화도 함께 본다(스펙 §18.2).
import { NextResponse } from "next/server";
import { listChats } from "@/lib/agent/chat-store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await listChats());
}
