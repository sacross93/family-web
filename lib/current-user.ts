import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken, type SessionUser } from "@/lib/session";

/** 서버 컴포넌트/라우트에서 현재 로그인 사용자 조회 (없으면 null) */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export type { SessionUser };
