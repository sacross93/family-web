<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 포동 (Podong) — 프로젝트 규칙

한국어 가족 웹사이트. **디자인 일관성이 최우선.** 새 화면/기능 전에 **[DESIGN.md](DESIGN.md) 필독.**

## 스택
Next.js 16 (App Router) · React 19 · TS · Tailwind v4 (CSS-first `@theme` in `app/globals.css`) · Prisma 6 + PostgreSQL · Pretendard(본문)+Fredoka(숫자/디스플레이).

## 핵심 규칙
- 색상은 `lib/colors.ts`의 `palette(key)`로만. `"bg-"+key` 식 동적 클래스 조합 금지 (Tailwind v4가 스캔 못 함).
- UI는 `@/components/ui` 배럴에서 import. 임의 HEX/그림자/폰트 추가 금지 (토큰은 `app/globals.css`).
- 날짜는 `lib/date.ts` 헬퍼(`kDate`, `dday`, `ageFrom` …). 타입은 `lib/types.ts`.
- 데이터 패턴: `app/<기능>/page.tsx`(서버, prisma로 read, `export const dynamic="force-dynamic"`) → `<기능>-client.tsx`("use client", 낙관적 업데이트 + `/api/...` fetch). 예시: `app/shopping/*`.
- **Next 16 동적 라우트 params는 Promise**: `{ params }: { params: Promise<{ id: string }> }` → `await params`.
- 사진은 `<img loading="lazy">` (eslint 허용). 업로드는 `public/uploads/`(git 제외).
- UI 언어 한국어, 존댓말·따뜻·간결. 이모지는 양념.
- **모바일 우선**: 반드시 폰 폭(≈390px)에서 검증. hover로만 뜨는 액션 금지 — 모바일엔 항상 보이게(`opacity-100 lg:opacity-0 lg:group-hover:opacity-100`). 탭 타깃 넉넉히, 가로 스크롤 금지(body `overflow-x:hidden`). 하단 FAB 가림 방지로 콘텐츠 하단 여백 확보.

## DB / 실행
- 로컬: `postgresql://ascentai@localhost:5432/podong` (Homebrew `postgresql@16`, `brew services start postgresql@16`).
- `npm run dev` · `npm run db:push` · `npm run db:seed` · `npm run db:reset` · `npm run db:studio`.

## 로그인 / 인증 (적용됨)
- 아이디·비밀번호 로그인. `AppUser`(bcrypt) + jose 세션 쿠키. 전 페이지를 `middleware.ts`가 보호.
- 세션 로직: `lib/session.ts`(edge-safe, next/headers 금지) · 서버 조회: `lib/current-user.ts`의 `getCurrentUser()`.
- 새 계정: `npm run user:add`. 공유 계정 `wlsdud022`(관리자). 모든 IP 접속: `npm run dev:lan`.
- `middleware.ts`는 `lib/session.ts`만 import (jose). prisma/next-headers/bcrypt는 route(nodejs)에서만.

## 마크다운 글쓰기
- `components/markdown-editor.tsx`(툴바·단축키 ⌘B/I/K·미리보기·이미지 업로드·목록 자동이음) + `components/markdown-view.tsx`(react-markdown+remark-gfm). 렌더 스타일은 globals.css `.md-content`.
- 적용처: 게시판 글(작성/수정/표시), 계획 설명·일정 메모. 새 글쓰기 UI엔 MarkdownEditor를 쓸 것.

## 꾸미기 (스티커) — 재사용 표면
- 핵심: `components/decoration-surface.tsx`의 `<DecorationSurface surfaceKey canEdit variant clip editing onEditingChange showTrigger>`. 전역 래퍼는 `components/decorations.tsx`.
- surfaceKey 규칙: 페이지="/"·"/albums"…(관리자만), 게시글=`board:<id>`, 계획=`plan:<id>`(로그인 가족 누구나). 권한은 `app/api/decorations/*`에서 강제.
- 전역 페이지 꾸미기는 상단 메뉴 페이지(NAV href 일치)에서만 렌더. 상세(계획)는 자체 embedded 표면(히어로 별✨ 버튼)으로 편집.
- 좌표: xPct(중심 가로 %), yPx(중심 세로 px), width(px), rotation(deg). 앞/뒤: `z`(≥10 앞/기본20, <10 뒤/2, 콘텐츠 z-10, 선택 z-50). `clip`은 보기 모드에서만 적용(편집 중 핸들 안 잘리게).
- `/admin`에서 페이지별 스티커 업로드·관리. 편집 모드 localStorage `podong_edit_mode`(page variant).

## 구글 로그인/캘린더/알림
아직 미연동 (밑작업만). `lib/auth.ts`, `lib/google-calendar.ts`, `lib/notifications.ts` 스텁 + [REQUIREMENTS.md](REQUIREMENTS.md) 절차 참고. `.env`는 git 제외.
