// ─────────────────────────────────────────────────────────────
// 인증(Auth.js / NextAuth) · 밑작업 스텁
//
// 지금은 로그인 없이 사용합니다(가족 개인 공간). 구글 로그인을 켤 준비만 해둡니다.
// 켜는 절차는 REQUIREMENTS.md "1. 구글 로그인 + 캘린더 연동" 참고.
// ─────────────────────────────────────────────────────────────

export function authConfigured(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

/*
켤 때 할 일:

1) 설치
   npm i next-auth@beta @auth/prisma-adapter googleapis

2) 아래 설정을 활성화 (이 파일)

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          // 캘린더 이벤트 읽기/쓰기 + 오프라인(리프레시 토큰)
          scope:
            "openid email profile https://www.googleapis.com/auth/calendar.events",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      // 필요 시 session.user.id 등 확장
      return session;
    },
  },
});

3) app/api/auth/[...nextauth]/route.ts 생성:
   import { handlers } from "@/lib/auth";
   export const { GET, POST } = handlers;

4) 헤더/설정 화면에 로그인·로그아웃 버튼 연결(signIn("google") / signOut()).

5) 저장된 access_token 으로 lib/google-calendar.ts 의 TODO 부분 구현.
*/
