import { SignJWT, jwtVerify } from "jose";

// ─────────────────────────────────────────────────────────────
// 아이디/비밀번호 로그인 세션 (서명된 쿠키, jose HS256)
// ⚠️ 이 파일은 edge(middleware)에서도 import 되므로 next/headers 등
//    서버 전용 모듈을 여기서 import 하지 않습니다.
//    현재 사용자 조회는 lib/current-user.ts 참고.
// ─────────────────────────────────────────────────────────────

export const SESSION_COOKIE = "podong_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30일

export interface SessionUser {
  uid: string;
  username: string;
  name: string | null;
  isAdmin: boolean;
}

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET 이 설정되지 않았어요 (.env 확인).");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());
}

export async function verifySessionToken(
  token: string | undefined
): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return {
      uid: String(payload.uid),
      username: String(payload.username),
      name: (payload.name as string) ?? null,
      isAdmin: Boolean(payload.isAdmin),
    };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE,
  // 프로덕션(HTTPS)에서는 secure 권장. 로컬/사설 IP 접속을 위해 기본은 false.
  secure:
    process.env.NODE_ENV === "production" &&
    process.env.FORCE_INSECURE_COOKIE !== "1",
};
