import { pageTitle } from "@/lib/site";
import { prisma } from "@/lib/prisma";
import { MemoriesClient } from "./memories-client";
import type { MemoryRow } from "./memories-client";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: await pageTitle("/memories", "포동이의 기억") };
}

/**
 * 포동이가 대화를 넘어 들고 다니는 것들.
 *
 * 메뉴에는 없다 — 매일 열어 볼 화면이 아니라 **한 번씩 확인하고 지우는** 자리다.
 * 포동이가 결과 카드에서 여기로 링크를 건다.
 *
 * 표가 아직 없는 배포(`prisma db push` 전)에서도 500 을 내지 않는다. 그때는 "확인 안 됨" 이지
 * "기억이 없음" 이 아니다 — 둘을 섞으면 가족이 "포동이가 다 잊었네" 로 읽는다.
 */
export default async function MemoriesPage() {
  let memories: MemoryRow[] | null = null;
  try {
    memories = await prisma.agentMemory.findMany({ orderBy: { createdAt: "desc" } });
  } catch {
    memories = null;
  }
  return <MemoriesClient initial={memories} />;
}
