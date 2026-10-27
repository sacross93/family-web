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
- **`ItemActions` 는 `group` 이 붙은 조상 안에 둘 것.** 데스크톱 아이콘이 `group-hover` 로 뜨기 때문에, 없으면 **영영 투명해서** 데스크톱에서는 고칠·지울 길이 없다(폰 `…` 는 멀쩡해서 모른다 — 기념일·계획 히어로·앨범 히어로가 그랬다). 사용자가 손을 얹는 카드/줄에 `group`.
- **기념일 고치기·지우기는 만든 사람이나 관리자만**(`lib/anniversary.ts` 한 곳 — 화면의 버튼과 라우트의 403 이 같이 쓴다). 만든 사람은 `AnniversaryOwner` 표(ensure.sql 이 ALTER 를 못 해서 따로 둔다 — `Anniversary.memberId` 는 "누구의 날" 이지 만든 사람이 아니다). 그 표가 생기기 전의 기념일·시드는 줄이 없어 **관리자만** 고친다.
- **기념일이 언제 돌아오는지는 `lib/anniversary-dates.ts` 의 `anniversaryWhen()` 으로**(음력 기념일, 2026-10-27). 기념일에 `dday()` 를 직접 쓰면 음력 생일을 양력으로 센다. 음력은 `AnniversaryLunar` 표(달·날·윤달 — 해는 `Anniversary.date` 가 원래 음력 날의 양력이라 거기서 되짚는다)라 **기념일을 읽는 쿼리마다 `lunar: ANNIVERSARY_LUNAR`**(lib/anniversary.ts) — 한 곳이라도 빠지면 그 화면만 조용히 양력이 된다(변이 시험으로 확인). 음력 표 라이브러리(`korean-lunar-calendar`, KASI 기준, 음력 2050-11 까지)는 `lib/lunar.ts` 에서만 — `lib/date.ts` 에 넣으면 달력·계획·아기 묶음에도 실린다(달력은 서버가 센 날짜만 받는다). 음력 기념일에 `lunar` 없이 `date` 만 PATCH 하면 400 이다(포동이 몫 — 화면은 `lunar` 를 늘 싣는다).
- **Next 16 동적 라우트 params는 Promise**: `{ params }: { params: Promise<{ id: string }> }` → `await params`.
- 사진은 `<img loading="lazy">` (eslint 허용). 업로드는 `public/uploads/`(git 제외).
- **사진을 올릴 때는 `lib/upload-client.ts` 의 `uploadImage(file, mode)` 만.** `/api/upload` 를 화면에서 직접 부르지 말 것.
  - **앨범 사진·꾸미기 스티커(페이지·관리자)·포동이에게 붙인 사진은 원본 그대로**(`ORIGINAL`) — 바이트 하나 안 바꾼다. 가족이 고른 방향이다(예전엔 JPEG 로 다시 눌러 투명 PNG 의 빈 곳이 검게 칠해졌다). 예외는 HEIC 하나: 브라우저가 읽으면(사파리) 같은 해상도 JPEG 로 바꾼다 — 크롬·안드로이드와 최적화가 HEIC 를 못 읽는다.
  - **글 속 사진(2000)·브랜드/홈 그림(800)은 줄여서**(`{ maxEdge }`, `lib/image-upload.ts`). 투명을 담을 수 있는 형식(PNG·WebP·AVIF)은 PNG 로 다시 써서 **투명을 지킨다.** 줄인 게 더 크면 원본이 간다.
  - **운영은 브라우저가 Blob 에 바로 올린다**(`/api/upload/token` 은 표만 내준다). Vercel 함수 본문은 **4.5MB 가 끝**(413, 못 바꾼다)이고 폰 원본은 3~12MB 다. 표 라우트에 `onUploadCompleted` 를 두지 말 것 — Vercel 이 쿠키 없이 다시 불러 proxy 가 401 로 막는다. 경로는 `uploads/<uuid><확장자>`, 무작위 꼬리 없이(`lib/upload-kinds.ts` — 포동이 주소 허용·`canOptimize`·지우기가 이 모양에 기댄다). **이 길은 로컬에서 못 밟는다**(토큰 없음) — 단위 시험(`lib/upload-token.test.ts`)만 있다.
  - 로컬은 `/api/upload` POST 로 **한 장씩**. `proxy.ts` 가 본문을 복사하는 상한(기본 10MB)을 `next.config.ts` 의 `proxyClientMaxBodySize` 로 올려 두었다 — 빼면 큰 사진이 잘려 안 올라간다(실측).
  - **저장 공간 문지기**(`lib/upload-guard.ts`, 계산은 `lib/blob-budget.ts`): Blob Hobby 는 저장 1GB·**고급 요청(put·copy·list) 월 2천 건** — 하나라도 넘으면 저장소가 통째로 약 30일 멈추고 **이미 올린 사진까지 403** 이다. 그래서 90% 에서 올리기를 막는다(507 `STORAGE_FULL` → 화면은 `uploadErrorMessage` 로 "저장 공간이 거의 찼어요"). 사용량은 `BlobUsage` 표에 기억하고(허락할 때마다 원자적으로 더한다), **`list()` 는 6시간에 한 번·관리자 [다시 재기](1분에 한 번까지)만** — 요청마다 부르면 문지기가 저장소를 멈춘다. 같은 이유로 **조각 올리기(multipart) 금지**(한 장에 고급 요청 여러 건). 관리자 화면 「사진 저장 공간」 카드.
- **큰 사진은 줄여서 보낸다** — `lib/img.ts`. 저장은 원본이라 화면이 받는 쪽을 줄여야 한다. 홈 스티커 한 장이 **2,208KB** 였다(운영에서 폰 폭으로 실측). `next/image` **컴포넌트는 안 쓴다** — 스티커는 DB 에 가로 px 만 있고 세로는 사진 비율을 따르는데 `next/image` 는 width+height 를 요구하고 감싸는 요소가 하나 더 생겨 드래그 좌표가 어긋난다. 그래서 `<img>` 는 그대로 두고 **주소만** 최적화 주소로 바꾼다.
  - 그려질 너비를 아는 곳(스티커)은 `sized()`·`sizedSrcSet()`. 칸 너비가 CSS 로 정해지는 곳(앨범 격자·표지·사진 보기·홈 최근 사진·포동이 풍선·관리자 스티커 목록)은 **`PhotoImg`**(`@/components/ui` — `responsive()` 의 w 표시 `srcSet` + `sizes`). 각 `sizes` 옆에 **재 본 너비**가 적혀 있다(2026-10-19) — 레이아웃을 바꾸면 다시 재고 고칠 것. 짐작하면 흐려지거나 헛되이 크다.
  - 줄인 주소가 실패하면 **원래 주소로 한 번** 바꾼다(`PhotoImg`·`fallbackToRaw`) — 무료 한도를 넘으면 402, 한 변 8192px 넘는 원본은 400 이다. 사진 보기에는 `원본 보기` 링크가 있다(저장된 원본을 새 탭으로).
  - 허용 크기·허용 호스트는 `lib/img.ts` 한 곳에서 오고 `next.config.ts` 가 그것을 가져다 쓴다. **어긋나면 사진이 400 으로 안 뜬다**(실측: 허용 밖 `w` 도, 등록 안 된 호스트도 400).
  - 못 태우는 주소(남의 서버·`data:`·`blob:`·**SVG·HEIC**)는 **있는 그대로** 내보낸다. 줄이려다 사진이 안 뜨는 쪽이 훨씬 나쁘다(SVG 스티커가 400 으로 안 뜨던 것을 이걸로 고쳤다).
  - 무료 한도(실측): 만들어진 사진은 엣지에 `x-vercel-cache: HIT` 로 남고 브라우저에는 30일(`max-age=2592000`) 머문다. 원본 한 장에 변형 몇 개가 전부라 볼 때마다 새로 만들지 않는다. 폰이 실제로 받는 것은 **AVIF 16KB**(curl 로 webp 를 요구하면 32KB — 브라우저가 더 좋은 쪽을 고른다). Hobby 는 변환 월 5천 건 — 넘으면 402 이고 위의 되돌리기가 원본을 띄운다.
  - **꾸미기 편집 중에는 고정된 한 주소**(가장 큰 너비)를 쓴다. 크기를 끄는 동안 주소가 바뀌면 그때마다 다시 받느라 깜빡인다. 원본을 쓰지 않는 건 원본이 이제 폰 사진(수 MB)이라서다.
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
- 새 계정: `/admin` 의 **로그인 계정** 카드(만들기·이름·비밀번호 바꾸기 — 지우기·권한 바꾸기는 **일부러 없다**, 같은 아이디는 409. 이름은 세션(JWT)에 실려 있어 **본인 것만 즉시** 바뀌고 다른 사람은 다시 로그인해야 보인다)
  또는 `npm run user:add`(같은 아이디면 **덮어쓴다**). 공유 계정 `wlsdud022`(관리자). 모든 IP 접속: `npm run dev:lan`.
- `proxy.ts`(Next 16 에서 `middleware` 가 이 이름으로 바뀜)는 `lib/session.ts`만 import (jose). prisma/next-headers/bcrypt는 route(nodejs)에서만 — v16 부터 proxy 가 Node 런타임이 기본이라도 여기는 가볍게 둔다.

## 아기 페이지 (`/baby`) — 준비부터 출산까지
- 스펙 `docs/superpowers/specs/2026-10-16-baby-journey-design.md`. 기록(`JourneyEntry`·`JourneyChecklistItem`·`JourneyLink`·`CycleEvent`)은 **페이지의 것**, 임신(`Pregnancy`)은 그 아래 0..n. 진행 중 = `endedAt` 없음(최대 1개, `POST /api/pregnancy` 가 409 로 지킨다).
- **도장은 서버가 찍는다**: 진행 중인 임신이 있을 때 만든 일기·체크리스트에 `pregnancyId`. "준비 단계로 · 지우기" 가 지울 범위가 이 값이라 클라이언트 값을 받지 않는다. 단계는 `stageOf()` 로 계산(저장 안 함).
- 서버 조회는 `lib/journey.ts` 의 `journeyState()` 한 곳(홈·달력·포동이). 예측은 `lib/cycle.ts`(vitest).
- **예측에는 `cycleSince` 를 꼭 넘긴다** — `predictCycle(events, today, cycleSince)`. 끝난 임신의 추정 시작(`JourneySettings.cycleSince` = 예정일 − 266일, `/api/pregnancy/[id]/end` 가 `cycleSinceAfter` 로 찍는다 — **누른 날이 아니다**: 끝나고 며칠 뒤에 눌러도 그 사이의 생리가 기준이 되어야 한다)이고, 그 앞의 시작(곧 임신 전 생리)은 기준이 못 된다. 빼먹으면 준비로 돌아온 직후 히어로가 "21일 지남" 을 날마다 키운다. 새 화면은 직접 부르지 말고 `journeyState().prediction` 을 쓸 것. 남은 날 글자는 `prepCountdown`(journey-core) 하나에서.
- 옛 `Baby`·`BabyEntry`·`BabyChecklistItem`·`BabyLink` 표는 **쓰지 않는다**(운영에 남아 있을 수 있다 — DEPLOY.md). `ensure.sql` 이 ALTER 를 못 해서 새 표로 옮겼다.
- **의료 문구 원칙과 그 예외 하나**: 의료 시기·국가 제도 문구를 UI 에 넣지 않는다. **예외는 주기 계산 날짜(다음 생리 예정·배란 예정·가임기)뿐** — 날짜와 "추정" 표시만, **권하는 문장 금지.** 준비 체크리스트에 기본 항목을 넣지 않는 것도 같은 이유다.
- 화면 문구는 임신이 끝난 이유를 암시하지 않는다(두 리셋: "준비 단계로" = 그 임신만, "처음부터 다시 시작" = 전부).
- 홈 노출은 `JourneySettings.showOnHome` 일 때만. `BabyLink` 시절의 참고 사이트 규칙(`lib/url.ts`, 도메인만 표시)은 그대로.

## 사이트 에이전트 (AI 포동이)

**`lib/agent/`·`components/agent/`·`app/api/agent/` 를 고치기 전에 [PODONGI.md](PODONGI.md) 필독.**
(이 파일 `AGENTS.md` 와 한 글자 차이로 헷갈리지 않게 포동이 이름을 붙였다.)
여기에는 **모르고 어기기 쉬운 것**만 남긴다 — 나머지는 다 그 문서에 있다.

- 도구는 **6개 고정**. 새 기능이 생기면 도구가 아니라 **리소스를 추가**한다(`lib/agent/resources.ts` 한 곳, 현재 18종).
- **고치기·지우기는 리소스가 `update`·`remove` 를 선언한 것만**(지금은 기념일 하나, 2026-10-19 집주인 결정). **모델은 지우지 않는다** — `delete_item` 은 확인 카드만 띄우고 가족이 [지우기]를 눌러야 `/api/agent/remove` 가 지운다. 경로는 언제나 서버가 선언에서 만든다(되돌리기: `create.undoApi` DELETE · `update.api` PATCH, 키는 `update.fields` 만).
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

## 구글 캘린더 (양방향 — 사이트 "일정"만)
스펙 `docs/superpowers/specs/2026-10-16-google-calendar-sync-design.md`, 켜는 법 DEPLOY.md 7절. 코드는 `lib/gcal/`
(판단은 순수 함수 `plan.ts`·`map.ts`, 구글 REST 는 `client.ts`, DB·잠금·실행은 `sync.ts`).
- **서비스 계정**으로 붙는다(사이트에 구글 로그인 화면 없음). 환경변수 두 개: `GOOGLE_SERVICE_ACCOUNT_JSON`(키 파일 내용 전체)·
  `GOOGLE_CALENDAR_ID`. 없거나 키를 못 읽으면 **꺼짐** — 던지지 않는다(일정 화면이 500 이 된다). 키·토큰은 로그·응답·오류 문구에
  절대 싣지 않는다(오류는 HTTP 상태 + 짧은 영숫자 코드만).
- **처음 맞추기는 관리자가 누른다**(`/admin` 카드: 미리보기 "보낼 N · 이을 M · 가져올 K" → [처음 맞추기]). 그 전에는
  (`GoogleSyncState.initialDoneAt` 이 빔) 자동 동기화도 쓰기 훅도 **구글을 한 번도 부르지 않는다.** 로컬 `.env` 에 진짜 키·진짜
  캘린더가 들어 있어서, 이게 없으면 로컬 화면을 열기만 해도 시드 견본 일정이 가족 캘린더로 간다. 자동으로 시작하게 바꾸지 말 것.
- 창: 오늘(서울) 기준 **90일 전 ~ 365일 뒤**. 그 안에서만 읽고 "구글에서 지워졌다" 도 그 안에서만 판단한다.
- **목록을 끝까지 못 읽으면 계획을 세우지 않는다** — `listWindow` 는 끝까지 읽거나 던진다. 반쯤 읽은 목록의 "없음 = 지워짐" 은
  창 안 사이트 일정을 한꺼번에 지운다. 끝까지 읽었어도 "목록에 없음" 만으로는 안 지운다(하나씩 다시 묻고 404·410·취소됨일 때만).
- 반복 회차·여러 날 일정은 `readOnly` → `/api/events/[id]` PATCH/DELETE 가 **409**(`READONLY_MESSAGE`, 구글에는 요청 0).
  화면도 포동이도 이 라우트를 탄다. 반복 시리즈 **원본**(`recurrence`)도 반복이다 — 연결된 단일 일정을 가족이 구글에서
  "매주 반복" 으로 바꾸면 그 id 가 원본이 되는데, 원본은 목록(singleEvents)에 안 와서 연결이 모르는 채 남는다. 그래서
  **구글에 쓰기(PATCH·DELETE) 전에는 언제나 그 일정을 다시 묻고**, 반복·여러 날이면 쓰지 않는다(연결을 readOnly 로/묘비는
  거둔다). 다시 묻기가 실패하면 쓰지 않는다. 원본 id 로 PATCH 하면 시리즈 전체가 덮이고, DELETE 하면 시리즈가 통째로 사라진다.
- 처음 맞추기에서 **이을 때는 구글 내용이 이긴다**(사이트 일정에 구글 내용을 쓴다 — 구글에는 쓰지 않는다). 사이트 내용을 두면
  처음 사이트에서 고칠 때 그 내용 전체가 구글로 가 구글의 시각·메모·장소를 덮는다.
- 꼬리표 `G` 는 **연결(`GoogleEventLink`) 유무**로. `CalendarEvent.source` 는 처음 어디서 왔는지(local|google)만 — 판단에 쓰지 말 것.
- 구글 일정 id 는 사이트 일정 id 에서 뽑는다(`googleIdFor` — **식을 바꾸지 말 것**, 이미 보낸 일정과 짝을 못 찾는다).
- 언제 도나: 홈·캘린더 화면이 그려진 뒤(`components/google-sync-trigger.tsx`, 60초 제한) · 포동이 턴 시작(3초까지만 기다림) ·
  관리자 [지금 맞추기]. **자동화 브라우저(`navigator.webdriver`)에서는 화면 트리거가 돌지 않는다** — `ui:audit` 의
  "로그인 말고 쓰기 0" 약속 때문. ⚠️ 이 가드는 **화면 트리거만** 막는다. `ui:flows` 가 일정을 만들고 지우는 것은 쓰기 훅
  (`/api/events`)을 타므로 **로컬이 "처음 맞추기 전" 일 때만** 진짜 캘린더와 무관하다 — 로컬에서 처음 맞추기를 해 둔 채로
  `ui:flows` 를 돌리면 그 일정이 진짜 캘린더로 간다. (`gcal:check` 의 정리와 `db:seed` 가 로컬을 "처음 맞추기 전" 으로 돌린다.)
- ⚠️ **`npm run gcal:check` 는 진짜 캘린더를 건드린다**(시험용 캘린더를 따로 두지 않았다). 로컬 DB 전용.
  - **돌리기 전에 개발 서버(`npm run dev`·`dev:lan`·`start`)를 끈다** — 시험 도중에는 로컬이 "처음 맞추기를 마친" 상태라
    탭·LAN 기기·포동이·`ui:flows` 가 만든 일정이 진짜 캘린더로 간다. `localhost:3000`·`3001` 이 응답하면 스크립트가 멈춘다.
  - 연결 없는 로컬 일정이 있으면 멈춘다(**견본 일정을 먼저 비울 것** — `db:seed` 직후에도 시드가 견본을 다시 만들어 두므로 멈춘다):
    `psql postgresql://ascentai@localhost:5432/podong -c 'DELETE FROM "CalendarEvent" e WHERE NOT EXISTS (SELECT 1 FROM "GoogleEventLink" l WHERE l."eventId" = e.id);'`
  - `[포동시험]` 일정을 약 300일 뒤에 만들고, 끝에(실패해도, Ctrl+C·터미널 닫기·kill 이어도) 지운 뒤 **로컬 동기화 상태를
    처음으로 되돌린다**(상태·연결·구글에서 가져온 일정 — 로컬만). 그래서 돌린 뒤 로컬은 "처음 맞추기 전" 이다.
    지운 시험 일정은 구글 휴지통에 "취소됨" 으로 한동안 남는다(새는 게 아니다).
  - **강제로 꺼졌다면**(kill -9 등 — 정리가 못 돎) 로컬이 "처음 맞추기를 마친" 채로 남아 다음에 로컬 화면을 열기만 해도 진짜
    캘린더와 맞춘다. **먼저** 로컬 동기화 표를 비운다 — `npm run db:seed`, 또는(로컬 DB 만)
    `psql postgresql://ascentai@localhost:5432/podong -c 'DELETE FROM "GoogleEventLink"; DELETE FROM "GoogleSyncState"; DELETE FROM "CalendarEvent";'`
    — 그다음 `gcal:check` 를 다시 돌린다(끝의 정리가 창 안의 `[포동시험]` 을 제목으로 찾아 전부 지운다).
- `db:seed` 도 `GoogleEventLink`·`GoogleSyncState` 를 비운다 — 새로 만든 견본 일정이 "처음 맞추기 뒤에 만든 것" 으로 보여
  진짜 캘린더로 가지 않게. (견본 일정 자체는 연결 없이 다시 생기므로 `gcal:check` 전에는 위 한 줄로 비운다.)
- 구글 → 사이트로 쓸 때는 일정과 연결을 **한 번에** 쓰고 `updatedAt` = `siteSyncedAt` 을 같은 값으로 직접 적는다(`sync.ts`).
  어긋나면 다음 동기화가 "사이트에서 고쳤다" 로 보고 왕복에서 잃은 내용("(제목 없음)"·색 7번·끝 +1시간)으로 진짜 일정을 덮어쓴다.
- **하지 않는 것**: 하루 한 번 cron(로그인 없는 경로가 필요해진다 — 대신 열 때마다 맞춘다) · 할 일(화면의 "구글 캘린더에도 저장" 은
  숨김) · 아기 페이지의 주기·병원 표시 · 기념일.

## 구글 로그인/알림
아직 미연동 (밑작업만). `lib/auth.ts`(구글 로그인), `lib/notifications.ts`(탭이 열려 있는 동안의 로컬 알림) 스텁 +
[REQUIREMENTS.md](REQUIREMENTS.md) 절차 참고. `lib/google-calendar.ts` 는 할 일용 옛 스텁(위 "하지 않는 것" — 일정 동기화와 무관).
`.env`는 git 제외.
