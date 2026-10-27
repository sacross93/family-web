import { pageTitle } from "@/lib/site";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { getSiteConfig, getNav } from "@/lib/site";
import { authStatus } from "@/lib/agent/auth";
import { gcalStatus } from "@/lib/gcal/sync";
import { storageStatus } from "@/lib/blob-usage";
import { MISSING_TAKEN_AT } from "@/lib/photo-date-server";
import { AdminClient } from "./admin-client";
import type { AgentConnection } from "./agent-connect-card";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: await pageTitle("/admin", "관리자") };
}

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) redirect("/");

  const [decorations, site, nav, agentConnection, gcal, storage, photoDatesPending] = await Promise.all([
    prisma.decoration.findMany({ orderBy: [{ page: "asc" }, { createdAt: "asc" }] }),
    getSiteConfig(),
    getNav(),
    readAgentConnection(),
    // 구글 캘린더 카드의 상태(DB 만 본다 — 미리보기는 카드가 열릴 때 따로). 표가 아직 없는 배포에서도 관리자 화면은
    // 떠야 한다 — 못 읽으면 null 이고, 카드는 그걸 "꺼짐" 이 아니라 "확인할 수 없어요" 로 그린다.
    gcalStatus().catch(() => null),
    // 사진 저장 공간 — 기억한 값(6시간보다 오래됐으면 서버에서 한 번 다시 잰다. 화면이 쓰기 요청을 보내지 않는다).
    // 못 재면 null → 카드가 "아직 확인할 수 없어요".
    storageStatus(),
    // 찍은 날짜가 비어 있는 (우리가 올린) 사진 수 — 세기만 한다. 채우기는 관리자가 누를 때만.
    prisma.photo.count({ where: MISSING_TAKEN_AT }).catch(() => null),
  ]);

  return (
    <AdminClient
      decorations={decorations}
      site={site}
      nav={nav}
      agentConnection={agentConnection}
      gcal={gcal}
      storage={storage}
      photoDatesPending={photoDatesPending}
      currentUid={user.uid}
    />
  );
}

/**
 * 연결 카드의 상태 — account_id 와 마지막으로 바뀐 때만(토큰 열은 고르지 않는다).
 * 못 읽으면 관리자 화면 전체가 죽지 않게 삼키되, **"연결 안 됨" 으로 바꾸지 않는다** —
 * 확인 못 한 것을 "없음" 으로 보여 주면 멀쩡한 연결을 괜히 다시 하게 된다(PODONGI.md 의 기억 표와 같은 규칙).
 */
async function readAgentConnection(): Promise<AgentConnection> {
  try {
    const row = await authStatus();
    return row
      ? { kind: "connected", accountId: row.accountId, updatedAt: row.updatedAt.toISOString() }
      : { kind: "none" };
  } catch {
    return { kind: "unknown" };
  }
}
