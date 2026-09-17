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

## 아기 페이지 (`/baby`)
- 모델 `Baby`(태명·예정일·출생일·showOnHome) · `BabyEntry`(kind: diary|checkup|letter, 작성자=FamilyMember) · `BabyChecklistItem`. 사진은 마크다운 이미지로.
- `BabyLink`(참고 사이트 — url + 사용자가 쓴 한 줄 설명, 표시는 도메인만): 주소 정규화·도메인 추출은 `lib/url.ts`의 `normalizeUrl`·`displayDomain` (vitest). 카드는 `app/baby/baby-links.tsx`, API는 `/api/baby-links`.
- 주차 계산은 `lib/date.ts`의 `pregnancyProgress(dueDate)`·`weekLabel`·`daysSinceBirth`·`dueDateFromLmp` (vitest: `npm test`). 분기 경계 14주/28주.
- UI 파일은 `app/baby/*` 책임별 분리(setup·hero·settings-modal·entry-modal·entry-timeline·checklist). 종류 메타·기본 체크리스트는 `app/baby/baby-meta.ts`.
- 의료 시기·국가 제도 문구를 UI에 넣지 않는다. 홈 노출은 `showOnHome` 토글일 때만. 스펙: `docs/superpowers/specs/2026-09-08-baby-page-design.md`.

## 사이트 에이전트 (`lib/agent/`, 1단계=엔진)
- 리소스는 `lib/agent/resources.ts` 의 `RESOURCES` 한 곳에만 선언한다(현재 16종). 목차·도구·경로해석·추가·되돌리기가 전부 거기서 파생 — **리소스별 if/else 금지**. 타입과 경로 해석기는 `registry.ts`.
- 도구는 5개 고정(`open_page`·`list_resource`·`create_item`·`read_url`·`view_screen`). 새 기능이 생기면 도구가 아니라 **리소스를 추가**한다.
- **추가 전용**: 수정·삭제 도구를 만들지 않는다. 되돌리기는 `create.undoApi` 화이트리스트로 서버만 실행.
- 추가는 기존 API 라우트를 HTTP로 호출한다(검증 중복 금지).
- 숫자·모델명은 `lib/agent/config.ts`(환경변수)에서만. 코드에 박지 않는다. 목록은 `.env.example`.
- LLM 와이어 포맷은 `lib/agent/llm/codex.ts` 안에서만 다룬다. 루프는 정규화 이벤트만 안다.
- `read_url` 의 사설·내부망 차단은 **도구 층에만** 둔다 — `lib/url.ts` 는 아기 참고 사이트 카드가 공유하므로 거기를 조이면 무관한 기능이 깨진다.
- 테스트는 `llm/fake.ts` 로 네트워크 없이 돈다. 스펙: `docs/superpowers/specs/2026-09-17-site-agent-design.md`(§16에 실측/미확인 구분).
- 토큰은 `AgentAuth` 에 암호화 저장, 주입은 `npm run agent:auth`. **`AUTH_SECRET` 또는 `crypto.ts` 의 `KEY_DOMAIN` 이 바뀌면 기존 토큰을 못 읽는다** — 배포 전 [DEPLOY.md](DEPLOY.md) 6절 필독.
- **2단계(라우트·UI)가 지켜야 할 것** — 엔진이 강제하지 못하는 부분이라 여기 적어 둔다.
  - `ToolContext.origin` 을 `Host`/`X-Forwarded-Host` 헤더에서 만들지 말 것. 세션 쿠키가 공격자 서버로 나간다 — 환경변수나 고정 상수에서.
  - `listPath` 중 `/decorations`(꾸미기)·`/family`(가족)는 **실재하지 않는 가상 경로**다(`app/decorations/`·`app/family/` 없음 — 리소스끼리 겹치지 않게 둔 자리표시자). 결과 카드에서 그리로 보내면 404.
  - `runAgent` 는 최종 `messages` 를 반환하지 않는다. 라우트가 대화 기록을 보관할 땐 assistant 의 `toolCalls` 와 tool 의 `toolCallId` 를 **짝째로** 저장해야 네이티브 도구 모드가 그 경계에서 안 깨진다.
  - `/api/agent` 의 `maxDuration` 은 토큰 갱신 HTTP 타임아웃(8초)×2 + 여유보다 크게. 갱신이 트랜잭션 안에서 일어나므로 중간에 함수가 죽으면 refresh_token 이 영구히 죽는다.

## 마크다운 글쓰기
- `components/markdown-editor.tsx`(툴바·단축키 ⌘B/I/K·미리보기·이미지 업로드·목록 자동이음) + `components/markdown-view.tsx`(react-markdown+remark-gfm). 렌더 스타일은 globals.css `.md-content`.
- 적용처: 게시판 글(작성/수정/표시), 계획 설명·일정 메모. 새 글쓰기 UI엔 MarkdownEditor를 쓸 것.

## 사이트 커스터마이즈 (브랜드·홈·메뉴)
- `SiteConfig`(싱글턴 id="main": siteName·tagline·brandEmoji/Image·heroSubtitle·heroEmoji/Image) + `NavItem`(href별 emoji·label·description 오버라이드).
- 로더 `lib/site.ts`의 `getSiteConfig()`·`getNav()` — **DB 없으면 기본값(lib/nav, SITE_DEFAULTS) 폴백** → 시드 안 해도, 배포 DB에서도 동작.
- 소비처: `app/layout.tsx`(→ AppShell에 site·nav prop, generateMetadata 제목), `app/page.tsx`(히어로), `app/login`(브랜드). 편집 UI는 `/admin`, API는 `/api/site-config`·`/api/nav`(관리자 전용). 저장 후 `router.refresh()`로 반영.
- 경로(href)와 색은 고정 — 이모지·이름·설명만 편집 가능.

## 꾸미기 (스티커) — 재사용 표면
- 핵심: `components/decoration-surface.tsx`의 `<DecorationSurface surfaceKey canEdit variant clip editing onEditingChange showTrigger>`. 전역 래퍼는 `components/decorations.tsx`.
- surfaceKey 규칙: 페이지="/"·"/albums"…(관리자만), 게시글=`board:<id>`, 계획=`plan:<id>`(로그인 가족 누구나). 권한은 `app/api/decorations/*`에서 강제.
- 전역 페이지 꾸미기는 상단 메뉴 페이지(NAV href 일치)에서만 렌더. 상세(계획)는 자체 embedded 표면(히어로 별✨ 버튼)으로 편집.
- 좌표: xPct(중심 가로 %), yPx(중심 세로 px), width(px), rotation(deg). 앞/뒤: `z`(≥10 앞/기본20, <10 뒤/2, 콘텐츠 z-10, 선택 z-50). `clip`은 보기 모드에서만 적용(편집 중 핸들 안 잘리게).
- `/admin`에서 페이지별 스티커 업로드·관리. 편집 모드 localStorage `podong_edit_mode`(page variant).

## 구글 로그인/캘린더/알림
아직 미연동 (밑작업만). `lib/auth.ts`, `lib/google-calendar.ts`, `lib/notifications.ts` 스텁 + [REQUIREMENTS.md](REQUIREMENTS.md) 절차 참고. `.env`는 git 제외.
