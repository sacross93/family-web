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
- **DELETE 는 두 번 불러도 같은 결과여야 한다.** 라우트에서 `prisma.X.delete()` 를 쓰지 말고 **`deleteMany({ where: { id } })`** 를 쓸 것 — 없는 행에 `delete` 를 걸면 P2025 가 던져져 **500** 이 되고, 화면은 `!res.ok` 를 보고 낙관적 삭제를 되돌려 **지운 것이 되살아난다.** 공유 목록이라 실제로 일어난다(두 사람이 같은 항목을 동시에 지울 때·연결이 끊겼다 다시 눌렀을 때). `ui-flows` 가 확인한다.
- 데이터 패턴: `app/<기능>/page.tsx`(서버, prisma로 read, `export const dynamic="force-dynamic"`) → `<기능>-client.tsx`("use client", 낙관적 업데이트 + `/api/...` fetch). 예시: `app/shopping/*`.
- **Next 16 동적 라우트 params는 Promise**: `{ params }: { params: Promise<{ id: string }> }` → `await params`.
- 사진은 `<img loading="lazy">` (eslint 허용). 업로드는 `public/uploads/`(git 제외).
- **큰 사진은 줄여서 보낸다** — `lib/img.ts` 의 `sized()`·`sizedSrcSet()`. 홈 스티커 한 장이 **2,208KB** 였다(운영에서 폰 폭으로 실측. 홈이 받는 이미지가 그것 하나뿐이었다). 원본은 저장소에 그대로 두고 화면에만 줄인 것이 간다. `next/image` **컴포넌트는 안 쓴다** — 스티커는 DB 에 가로 px 만 있고 세로는 사진 비율을 따르는데 `next/image` 는 width+height 를 요구하고 감싸는 요소가 하나 더 생겨 드래그 좌표가 어긋난다. 그래서 `<img>` 는 그대로 두고 **주소만** 최적화 주소로 바꾼다.
  - 허용 크기·허용 호스트는 `lib/img.ts` 한 곳에서 오고 `next.config.ts` 가 그것을 가져다 쓴다. **어긋나면 사진이 400 으로 안 뜬다**(실측: 허용 밖 `w` 도, 등록 안 된 호스트도 400).
  - 못 태우는 주소(남의 서버·`data:`)는 **있는 그대로** 내보낸다. 줄이려다 사진이 안 뜨는 쪽이 훨씬 나쁘다.
  - 무료 한도 걱정은 안 해도 된다(실측): 만들어진 사진은 엣지에 `x-vercel-cache: HIT` 로 남고 브라우저에는 30일(`max-age=2592000`) 머문다. 원본 한 장에 변형 몇 개가 전부라 볼 때마다 새로 만들지 않는다. 폰이 실제로 받는 것은 **AVIF 16KB**(curl 로 webp 를 요구하면 32KB — 브라우저가 더 좋은 쪽을 고른다).
  - **꾸미기 편집 중에는 원본을 쓴다.** 크기를 끄는 동안 주소가 계속 바뀌면 그때마다 다시 받느라 깜빡인다.
  - **지금 걸려 있는 곳은 꾸미기 스티커뿐이다.** 운영 다섯 화면을 재 보니(2026-09-21) 사진을 받는 곳이 홈 하나였다 — 사진첩·아기·게시판·계획은 **0장**(아직 올린 사진이 없다). 가족이 사진을 올리기 시작하면 사진첩이 같은 문제를 겪는다. 그때는 격자 칸 너비가 CSS 로 정해지므로 `sized()` 하나가 아니라 `sizes` + 여러 너비의 `srcSet` 이 필요하다 — **재 보고 하라.** 지금 넣으면 너비를 짐작하게 되어 흐려지거나 헛되이 크다.
- UI 언어 한국어, 존댓말·따뜻·간결. 이모지는 양념.
- **모바일 우선**: 반드시 폰 폭(≈390px)에서 검증. hover로만 뜨는 액션 금지 — 모바일엔 항상 보이게(`opacity-100 lg:opacity-0 lg:group-hover:opacity-100`). 탭 타깃 넉넉히, 가로 스크롤 금지(body `overflow-x:hidden`).
- **폰 네비게이션은 하단 탭바**(`components/bottom-tabs.tsx`) — `getNav()` 앞 `TAB_COUNT`개 + `더보기`(드로어). 탭 목록을 따로 만들지 말 것: `NavItem` DB 오버라이드도 꾸미기 표면도 NAV href 로 돈다.
- **아래쪽 여백은 `--bottom-bar`**(`app/globals.css`) 하나에서 온다. 탭바·`물어보기` FAB·본문 `padding-bottom`·꾸미기 툴바가 전부 이 값을 읽는다. 페이지에서 `pb-28` 같은 값을 손으로 맞추면 무엇 하나는 반드시 가려진다.
- **떠 있는 버튼을 두지 않는다.** 하단 탭바(화면 가장자리) 말고는 아무것도 화면에 띄우지 말 것. 콘텐츠 한가운데에 떠 있는 버튼은 그 밑에 깔린 것을 **누를 수 없게** 만든다 — 우하단 `물어보기` 가 아기 기록의 `…` 를 정확히 덮어서, 일기를 고치려고 누르면 AI 채팅이 열렸다. 지금 `포동이` 는 탭바 안(폰)·사이드바(데스크톱)에 있다. 새 기능도 같은 자리를 찾을 것.
- **메뉴·툴팁·팝오버는 `document.body` 로 내보낸다**(portal). 제자리에 그리면 조상의 `overflow-hidden` 이 잘라 아래 항목을 아예 못 누르고, 조상에 `transform` 이 있으면 `fixed` 기준이 어긋난다. `components/ui/item-actions.tsx` 가 본보기.

## 검사 두 가지 — 하나는 읽기만, 하나는 만들고 지운다
- **`npm run ui:audit [주소]` 는 읽기만 한다** → **운영에 대고 돌려도 된다.**
  감사가 보내는 GET 아닌 요청은 **로그인 하나뿐**이다(실측). `POST /api/agent` 도 없어서
  가족의 ChatGPT 사용량도 안 쓴다. **감사가 이걸 스스로 확인한다** — 로그인 말고 쓰는 요청이
  하나라도 나가면 오류로 올린다. 그러니 "`…` 메뉴에서 삭제도 눌러 보자" 같은 단계를 넣으면
  바로 걸린다(그건 `ui-flows` 가 할 일이다).
- **`npm run ui:flows` 는 실제로 만들고 지운다** → **로컬 전용**(주소가 localhost 가 아니면 멈춘다).
  `npm run dev` 로 띄운 서버여야 한다 — `npm start` 로 돌리면 사진 검사가 거짓이 된다.

## 린트
- `npm run lint` 는 **0건이어야 한다.** 오늘까지 21건(오류 9·경고 12)이 늘 떠 있었고,
  그러면 **진짜 오류가 그 안에 묻힌다.** 0으로 맞춰 뒀으니 새로 뜨는 것은 새 문제다.
- `react-hooks/set-state-in-effect` 를 끌 때는 **왜 효과가 맞는 도구인지 한 줄로 적을 것**
  (지금 8곳: localStorage·알림 권한·포털 마운트·라우트 변경·모달 초기화 등 **React 바깥의
  것과 맞추는** 자리들이다). 이유 없이 끄면 규칙이 아니라 소음이 된다.
- 이름을 `use...` 로 시작하지 말 것 — 리액트 컴포넌트가 아닌데도 eslint 가 훅으로 보고
  헛된 오류를 낸다(`app/api/upload/route.ts` 의 `useBlob` 이 그랬다 → `blobConfigured`).
- `_` 로 시작하는 이름은 **일부러 안 쓰는 것**이라는 약속을 eslint 설정이 안다.

## DB / 실행
- 로컬: `postgresql://ascentai@localhost:5432/podong` (Homebrew `postgresql@16`, `brew services start postgresql@16`).
- `npm run dev` · `npm run db:push` · `npm run db:seed` · `npm run db:reset` · `npm run db:studio`.
- ⚠️ **Vercel 함수 지역은 `vercel.json` 의 `regions`(`sin1`)** — Neon DB 와 같은 싱가포르. 지우거나 바꾸면 기본값 미국 동부(`iad1`)로 돌아가 **화면마다 태평양을 건넌다**(실측 0.57~0.81초 → 로컬 0.005초, DEPLOY.md "함수 지역"). DB 를 다른 지역으로 옮기면 이 값도 같이 옮길 것.
- ⚠️ **`db:reset` 은 `AgentAuth` 를 날린다** — `--force-reset` 이라 테이블을 통째로 다시 만든다. 거기 들어 있는 건 사용자의 **암호화된 ChatGPT 토큰**이고, 다시 받으려면 브라우저 로그인(`npm run agent:login`)을 또 해야 한다. 시드 내용만 되돌리고 싶으면 **`db:seed`** 를 쓸 것 — 그건 콘텐츠 표만 지우고 `AgentAuth`·`AppUser` 는 건드리지 않는다(확인함: 지운 뒤에도 토큰 1행 그대로).

## 로그인 / 인증 (적용됨)
- 아이디·비밀번호 로그인. `AppUser`(bcrypt) + jose 세션 쿠키. 전 페이지를 `proxy.ts`가 보호.
- 세션 로직: `lib/session.ts`(edge-safe, next/headers 금지) · 서버 조회: `lib/current-user.ts`의 `getCurrentUser()`.
- 새 계정: `npm run user:add`. 공유 계정 `wlsdud022`(관리자). 모든 IP 접속: `npm run dev:lan`.
- `proxy.ts`(Next 16 에서 `middleware` 가 이 이름으로 바뀜)는 `lib/session.ts`만 import (jose). prisma/next-headers/bcrypt는 route(nodejs)에서만 — v16 부터 proxy 가 Node 런타임이 기본이라도 여기는 가볍게 둔다.

## 아기 페이지 (`/baby`)
- 모델 `Baby`(태명·예정일·출생일·showOnHome) · `BabyEntry`(kind: diary|checkup|letter, 작성자=FamilyMember) · `BabyChecklistItem`. 사진은 마크다운 이미지로.
- `BabyLink`(참고 사이트 — url + 사용자가 쓴 한 줄 설명, 표시는 도메인만): 주소 정규화·도메인 추출은 `lib/url.ts`의 `normalizeUrl`·`displayDomain` (vitest). 카드는 `app/baby/baby-links.tsx`, API는 `/api/baby-links`.
- 주차 계산은 `lib/date.ts`의 `pregnancyProgress(dueDate)`·`weekLabel`·`daysSinceBirth`·`dueDateFromLmp` (vitest: `npm test`). 분기 경계 14주/28주.
- UI 파일은 `app/baby/*` 책임별 분리(setup·hero·settings-modal·entry-modal·entry-timeline·checklist). 종류 메타·기본 체크리스트는 `app/baby/baby-meta.ts`.
- 의료 시기·국가 제도 문구를 UI에 넣지 않는다. 홈 노출은 `showOnHome` 토글일 때만. 스펙: `docs/superpowers/specs/2026-09-08-baby-page-design.md`.

## 사이트 에이전트 (인공 포동이)

**`lib/agent/`·`components/agent/`·`app/api/agent/` 를 고치기 전에 [PODONGI.md](PODONGI.md) 필독.**
(이 파일 `AGENTS.md` 와 한 글자 차이로 헷갈리지 않게 포동이 이름을 붙였다.)
여기에는 **모르고 어기기 쉬운 것**만 남긴다 — 나머지는 다 그 문서에 있다.

- 도구는 **4개 고정**. 새 기능이 생기면 도구가 아니라 **리소스를 추가**한다(`lib/agent/resources.ts` 한 곳, 현재 17종).
- **추가 전용.** 수정·삭제 도구를 만들지 않는다. 되돌리기는 `create.undoApi` 화이트리스트로 서버만 실행.
- 숫자·모델명은 `lib/agent/config.ts`(환경변수)에서만, **이름은 `lib/agent/name.ts` 에서만**. 코드에 박지 않는다.
- 고친 뒤에는 **`npm run agent:smoke`** — 모델 없이 엔진·DB·라우트를 끝까지 한 번 돌린다(로컬 전용). 안내문·도구·나가는 본문을 글로 읽으려면 `npm run agent:prompt [경로] [사람이름]`, 실행 기록은 `npm run agent:runs`. 셋 다 모델을 부르지 않는다.
- **가족의 개인 ChatGPT 사용량으로 돈다.** 확인하겠다고 진짜 턴을 돌리지 말 것 — 가짜 공급자(`llm/fake.ts`)와 라우트 가로채기로 왕복을 다 밟을 수 있다.

## 마크다운 글쓰기
- `components/markdown-editor.tsx`(툴바·단축키 ⌘B/I/K·미리보기·이미지 업로드·목록 자동이음) + `components/markdown-view.tsx`(react-markdown+remark-gfm). 렌더 스타일은 globals.css `.md-content`.
- 적용처: 게시판 글(작성/수정/표시), 계획 설명·일정 메모. 새 글쓰기 UI엔 MarkdownEditor를 쓸 것.

## 홈 화면에 추가 (PWA 겉면)
- `app/manifest.ts`(이름은 `SiteConfig` 에서 — `/admin` 에서 바꾸면 홈 화면 글자도 바뀐다) ·
  `app/apple-icon.png`(iOS 는 SVG 를 안 받는다. 없으면 **화면 캡처**가 홈 화면에 붙는다) ·
  `public/icon-192.png`·`icon-512.png`(안드로이드 매니페스트).
- **PNG 는 손으로 만들지 않는다.** `app/icon.svg` 가 원본이고 `node scripts/make-icons.mjs` 로 뽑는다.
  모서리는 안 깎는다 — **기기가 알아서 깎는다**(먼저 둥글리면 두 번 깎여 흰 띠가 생긴다).
- 매니페스트의 `background_color`·`theme_color` 와 `layout.tsx` 의 `themeColor` 는 CSS 변수를
  못 읽어 **손으로 베낀 값**이다. 셋 다 `lib/design-doc.test.ts` 가 토큰과 대조한다.

## 오프라인 구명정 (`public/sw.js`)
- 서비스 워커가 **딱 한 가지**만 한다: 화면을 여는 요청이 **네트워크 때문에** 실패하면
  `/offline` 로 돌린다. 그 밖의 요청은 `respondWith` 를 안 불러 **손대지 않는다**.
- **데이터도 화면도 캐시하지 않는다.** 들고 있는 건 `/offline` 한 장과 `/icon.svg` 뿐이다 —
  가족 사이트에서 오래된 장보기 목록을 최신인 척 보여 주는 쪽이 훨씬 나쁘다.
  그래서 이 워커는 낡을 수가 없다. **캐시를 늘리고 싶어지면 그 이유부터 여기 적을 것.**
- 사본을 **남의 주소에 그냥 그려 주면 안 된다** — Next 가 "주소는 `/shopping` 인데 내용은
  `/offline`" 을 만나 오류 경계로 떨어진다(실제로 그랬다). 그래서 `Response.redirect` 다.
- 등록은 `components/service-worker.tsx`, **운영에서만**(dev 새로고침과 섞이면 원인을 못 찾는다).
- 빼는 법: `public/sw.js` 를 지우고 배포하면 다음 방문에 등록이 풀린다. 급하면
  개발자도구 → Application → Service Workers → Unregister.

## 사이트 커스터마이즈 (브랜드·홈·메뉴)
- `SiteConfig`(싱글턴 id="main": siteName·tagline·brandEmoji/Image·heroSubtitle·heroEmoji/Image) + `NavItem`(href별 emoji·label·description 오버라이드).
- 로더 `lib/site.ts`의 `getSiteConfig()`·`getNav()` — **DB 없으면 기본값(lib/nav, SITE_DEFAULTS) 폴백** → 시드 안 해도, 배포 DB에서도 동작.
- 소비처: `app/layout.tsx`(→ AppShell에 site·nav prop, generateMetadata 제목), `app/page.tsx`(히어로), `app/login`(브랜드). 편집 UI는 `/admin`, API는 `/api/site-config`·`/api/nav`(관리자 전용). 저장 후 `router.refresh()`로 반영.
- 경로(href)와 색은 고정 — **이모지·이름·설명·순서**를 편집한다.
- **순서는 세 곳이 맞아떨어져야 돈다**(오래 죽어 있었다): `/admin` 이 지금 화면 순서를
  `sortOrder` 로 보내고 → `/api/nav` 가 **보낸 값**을 저장하고(예전엔 `DEFAULT_NAV` 인덱스를
  써서 무슨 순서를 보내도 기본값이 됐다) → `getNav()` 가 그걸 읽어 정렬한다(예전엔 안 읽었다).
  **아홉 개가 다 저장돼 있을 때만** 저장된 순서를 쓴다 — 한 줄만 남아 있던 적이 있는데
  그 하나 때문에 사진첩이 맨 앞으로 왔다. 부분 데이터는 순서가 아니다.
- 순서가 곧 **폰 하단 탭**이다(앞 `TAB_COUNT`=4개). 관리자 화면이 그 사실을 글로 알려 준다.

## 꾸미기 (스티커) — 재사용 표면
- 핵심: `components/decoration-surface.tsx`의 `<DecorationSurface surfaceKey canEdit variant clip editing onEditingChange showTrigger>`. 전역 래퍼는 `components/decorations.tsx`.
- surfaceKey 규칙: 페이지="/"·"/albums"…(관리자만), 게시글=`board:<id>`, 계획=`plan:<id>`(로그인 가족 누구나). 권한은 `app/api/decorations/*`에서 강제.
- 전역 페이지 꾸미기는 상단 메뉴 페이지(NAV href 일치)에서만 렌더. 상세(계획)는 자체 embedded 표면(히어로 별✨ 버튼)으로 편집.
- 좌표: xPct(중심 가로 %), yPx(중심 세로 px), width(px), rotation(deg). 앞/뒤: `z`(≥10 앞/기본20, <10 뒤/2, 콘텐츠 z-10, 선택 z-50). `clip`은 보기 모드에서만 적용(편집 중 핸들 안 잘리게).
- `/admin`에서 페이지별 스티커 업로드·관리. 편집 모드 localStorage `podong_edit_mode`(page variant).

## 구글 로그인/캘린더/알림
아직 미연동 (밑작업만). `lib/auth.ts`, `lib/google-calendar.ts`, `lib/notifications.ts` 스텁 + [REQUIREMENTS.md](REQUIREMENTS.md) 절차 참고. `.env`는 git 제외.
