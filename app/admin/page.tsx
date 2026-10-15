import { pageTitle } from "@/lib/site";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { getSiteConfig, getNav } from "@/lib/site";
import { authStatus } from "@/lib/agent/auth";
import { AdminClient } from "./admin-client";
import type { AgentConnection } from "./agent-connect-card";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: await pageTitle("/admin", "관리자") };
}

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) redirect("/");

  const [decorations, site, nav, agentConnection] = await Promise.all([
    prisma.decoration.findMany({ orderBy: [{ page: "asc" }, { createdAt: "asc" }] }),
    getSiteConfig(),
    getNav(),
    readAgentConnection(),
  ]);

  return <AdminClient decorations={decorations} site={site} nav={nav} agentConnection={agentConnection} />;
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
