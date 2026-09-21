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

## 사이트 에이전트 (`lib/agent/`, 1단계=엔진)
- **글이 본체인 리소스는 `CatalogEntry.body` 에 본문을 싣는다**(아기 기록·게시판 글·일정 메모·기념일 메모). **목차(`catalog.ts`)는 body 를 쓰지 않는다** — 16종이 4,000자 안에 다 들어가야 하는 자리라 본문을 넣으면 한 종류가 다른 종류를 밀어낸다. 본문은 `list_resource` 로 한 종류를 펼칠 때만 나간다. 이 경계가 "훑어보기"와 "읽기"를 가른다.
- 리소스는 `lib/agent/resources.ts` 의 `RESOURCES` 한 곳에만 선언한다(현재 17종). 목차·도구·경로해석·추가·되돌리기가 전부 거기서 파생 — **리소스별 if/else 금지**. 타입과 경로 해석기는 `registry.ts`.
- 도구는 4개 고정(`open_page`·`list_resource`·`create_item`·`read_url`). 새 기능이 생기면 도구가 아니라 **리소스를 추가**한다.
- **문맥은 도구로 묻게 하지 않는다 — 안내문으로 준다.** 다섯째 도구였던 `view_screen` 은 언제나 "아직 지원하지 않습니다" 만 돌려주는 껍데기였고, 모델이 그걸 한 번 부르면 `maxSteps` 6걸음 중 한 걸음이 그냥 사라졌다. 지금 보고 있는 화면은 `loop.ts` 의 `screenLine()` 이 안내문 맨 앞에 한 줄로 싣는다(모델 호출 0회). **경로는 `resolvePath` 를 통과한 것만** 싣는다 — 안내문에 글로 들어가는 자리라 임의 문자열이 새면 거기 적힌 문장이 지시로 읽힌다. 라우트(`knownPath`)와 `screenLine` 이 **두 번** 거르는 것은 중복이 아니라 그 이유다. 홈(`/`)은 리소스가 아니라 특례 한 줄이다. 메뉴가 늘면 `loop.test.ts` 가 "그 화면을 못 알아본다" 고 걸어 준다.
- **추가 전용**: 수정·삭제 도구를 만들지 않는다. 되돌리기는 `create.undoApi` 화이트리스트로 서버만 실행.
- **만든 뒤에는 되읽는다**(`tools.ts` 의 `confirmCreated`). 200 을 받았다고 저장된 값이 보낸 값과 같지는 않다 — 라우트가 모르는 필드를 조용히 버리면 "내일 우유 사기" 가 **날짜 없이** 저장되고도 200 이 온다. 그러면 포동이가 "내일 할일로 넣었어요" 라고 사실이 아닌 말을 한다. 그래서 리소스의 `catalog()` 에서 그 id 를 찾아 `ToolResult.stored` 에 싣고, **화면 카드의 label 도 그 값을 쓴다**(화면과 모델이 다른 말을 하면 안 된다). ⚠️ **못 찾은 것을 실패로 돌리지 말 것** — 목차는 `LIST_TAKE` 상한이 있고 종류마다 정렬이 달라 방금 만든 것이 목록 밖으로 밀릴 수 있다. 실패로 바꾸면 이미 만들어진 것을 모델이 **또** 만든다.
- 추가는 기존 API 라우트를 HTTP로 호출한다(검증 중복 금지).
- 숫자·모델명은 `lib/agent/config.ts`(환경변수)에서만. 코드에 박지 않는다. 목록은 `.env.example`.
- LLM 와이어 포맷은 `lib/agent/llm/codex.ts` 안에서만 다룬다. 루프는 정규화 이벤트만 안다.
- `read_url` 의 사설·내부망 차단은 **도구 층에만** 둔다 — `lib/url.ts` 는 아기 참고 사이트 카드가 공유하므로 거기를 조이면 무관한 기능이 깨진다.
- 테스트는 `llm/fake.ts` 로 네트워크 없이 돈다. 스펙: `docs/superpowers/specs/2026-09-17-site-agent-design.md`(§16에 실측/미확인 구분).
- 토큰은 `AgentAuth` 에 암호화 저장. 재발급은 `npm run agent:login`(브라우저 로그인 → DB 직행, 평문 파일 없음), 파일이 있으면 `npm run agent:auth -- <경로>`. **`AUTH_SECRET` 또는 `crypto.ts` 의 `KEY_DOMAIN` 이 바뀌면 기존 토큰을 못 읽는다** — 배포 전 [DEPLOY.md](DEPLOY.md) 6절 필독.
- **2단계(라우트·UI)**: 화면은 `components/agent/*`(fab·sheet·thread·history·use-agent-chat·agent-stream), 라우트는 `app/api/agent/*`(대화 SSE·chats·undo). 대화 읽기·쓰기는 `lib/agent/chat-store.ts` 를 통한다 — 다만 `chats/[id]` 는 404 판정 때문에 `prisma` 를 직접 한 번 부른다(유일한 예외. 늘리지 말 것).
- **2단계가 지킨 것** — 엔진이 강제하지 못하니 고칠 때 깨뜨리지 말 것.
  - `ToolContext.origin` 은 `lib/agent/origin.ts` 의 `agentOrigin()`(환경변수) 한 곳에서만. `Host`/`X-Forwarded-Host` 헤더로 만들면 그 주소로 나가는 요청에 **요청자의 세션 쿠키가 실려** 남의 서버로 걸어 나간다.
  - 가상 경로 `/decorations`·`/family` 는 링크로 만들지 않는다 — `components/agent/agent-thread.tsx` 의 `canVisit()`. `listPath` 자리를 채우려고 둔 값이라 **그런 페이지가 없다**(`app/decorations/`·`app/family/` 부재). 타입으로는 못 막으니 이 함수가 유일한 방어선이다.
  - assistant 의 `toolCalls` ↔ tool 의 `toolCallId` 를 **짝째로** 저장한다 — `app/api/agent/route.ts` + `lib/agent/chat-store.ts`. 짝이 깨지면 네이티브 도구 모드가 그 경계에서 죽는다. 같은 밀리초의 순서는 `orderBy: [{createdAt:desc},{id:desc}]` 의 cuid 단조성에 기댄다.
  - `app/api/agent/route.ts` 의 `maxDuration = 60` — 토큰 갱신 HTTP 타임아웃(8초)×2 + 여유. 갱신이 트랜잭션 안에서 일어나므로 중간에 함수가 죽으면 refresh_token 이 영구히 죽는다.
  - `agentConfig().enabled` 는 **POST `/api/agent` 만** 검사한다(403 "아직 준비 중이에요."). `chats/*`·`undo` 는 **일부러** 안 건다 — 기능을 꺼도 남은 대화는 지울 수 있어야 하고 로그인은 `proxy.ts` 가 이미 강제한다. "빠졌다"고 채우지 말 것.
  - 되돌리기는 `{resource, id}` 만 받는다 — `app/api/agent/undo/route.ts`. 경로는 서버가 `findResource(key)?.create?.undoApi(id)` 로만 만들고, `id` 는 `/^[A-Za-z0-9_-]{1,64}$/` 만 통과한다(`../site-config` 가 지나가면 화이트리스트가 무의미해진다). 대상의 5xx 는 502 로 번역해 우리 라우트가 500 으로 남지 않게 한다.
- **2단계가 아직 안 지킨 것** — 하게 되면 여기서 지운다.
  - **"…더 있음"을 사용자에게 보이기.** 목록이 상한(`LIST_TAKE`)에 걸리면 엔진이 꼬리(`MORE_TITLE`)를 붙이지만, 화면은 도구 결과를 카드 한 장(제목+버튼)으로만 그려 모델이 말로 옮겨 주는 데 기대고 있다.
- **한 턴에 들어갈 글의 상한** — 세 겹이고, 겹마다 **줄였다는 사실을 숫자로 말한다**.
  - `read_url` = `fetchMaxChars`(6,000) ÷ 이번 턴의 읽기 수(`loop.ts` 의 `readBudget`).
  - 목록 = `listMaxChars`(8,000). `budgetBodies()` 가 **본문만** 항목 수로 나눠 준다 — 제목·보조정보는 목록의 뼈대라 안 자른다. ⚠️ 바깥 웹 한 쪽에 6,000자를 주면서 **우리 게시판 목록은 무제한**이었다(실측: 8,000자 글 다섯 개에 `list_resource` 하나가 647자 → **39,117자**. 상한은 30개라 여기서 더 간다. 고친 뒤 같은 데이터로 5,757자).
  - 마지막 안전장치 = `toolResultMaxChars`(12,000), `loop.ts` 의 `serializeResult()`. **JSON 을 그냥 자르지 않는다** — 잘린 JSON 은 모델에게 깨진 글이다. 온전한 JSON 한 개로 감싸 앞부분과 숫자를 같이 준다.
  - **함수만 시험하면 안 된다.** 변이 시험에서 루프·도구의 호출을 각각 지워도 시험이 다 통과했다(헬퍼만 보고 있었다). 배선 시험이 셋 붙어 있다.
- **안내문을 통째로 읽어 보는 법: `npm run agent:prompt [경로] [사람이름]`.** 모델을 부르지 않고 실제 목차·기억·화면·사람이 다 붙은 안내문을 찍는다. 조각마다 시험이 있어도 **합쳤을 때 말이 되는지는 사람이 읽어야 안다** — 처음 읽자마자 `/baby` 가 "아기 목록" 으로 나가는 것을 봤다(아기는 하나뿐이다). 안내문을 고쳤으면 한 번 읽어 볼 것.
- **지금 누가 말하는가 (`lib/me.ts`, `loop.ts` 의 `speakerLine`)** — **짐작이다.**
  - 계정이 하나라(온 가족이 `wlsdud022` 를 함께 쓴다) 세션으로는 알 수 없다. 기기에 한 번 골라 둔 값(`podong_me`, 없으면 예전 열쇠 `podong_baby_author`)이 전부다. 고르는 자리는 포동이 **빈 화면의 "나는 ___"**.
  - 라우트가 **실제 가족 명단과 맞춰 본 이름만** 넘긴다(`speakerName`). id 를 그대로 믿지 않는 이유 둘: 브라우저 저장소에서 오므로 아무 글자나 올 수 있고 그 글자가 안내문에 **글로** 실린다 · 지운 가족의 id 가 기기에 남아 있을 수 있다. 못 찾으면 조용히 없던 일(400 을 내면 사용자가 멈춘다).
  - **"짐작"이라는 말이 이 줄의 절반이다.** 이름만 주면 모델은 사실로 쓴다 — 아빠 폰을 엄마가 들면 일기가 조용히 아빠 이름으로 적히고, 되돌리기가 있어도 **틀렸다는 것을 아무도 모른다.** 그래서 안내문이 "확실하지 않다" 와 "무엇으로 적었는지 밝혀라" 를 함께 강제한다. 이 문장을 지우지 말 것 — 시험이 잡고 있다.
- **기억 (`AgentMemory`, 리소스 `memory`, 화면 `/memories`)** — 포동이가 대화를 넘어 들고 가는 **한 줄짜리 사실**.
  - **도구가 아니라 리소스다.** 쓰기는 `create_item("memory")`, 되돌리기는 `undoApi`, 지우기는 가족이 `/memories` 에서. 고치는 도구는 없다(추가 전용).
  - **목차에 안 나온다**(`inCatalog: false`). 목차는 "사이트에 뭐가 있나" 고 기억은 "내가 아는 것" 이라 질문이 다르다. 같은 4,000자를 두고 게시판 글과 다투게 두면 글이 늘어난 날 기억이 조용히 접힌다. 대신 안내문에 **제 몫의 예산**(`memoryMaxChars`, 600)을 가진 칸으로 들어간다 — `loop.ts` 의 `memoryLines()`.
  - **누가 적었는지(`by`)를 반드시 같이 보여 준다.** 포동이가 짐작해 적은 것과 가족이 말해 준 것이 같아 보이면, 잘못 짐작한 기억이 사실처럼 굳는다. `/memories` 는 태그로, 안내문은 괄호로.
  - 같은 문장은 두 번 저장하지 않는다(`/api/memories` 가 먼저 찾아본다) — 안 막으면 같은 줄이 예산을 다 먹는다.
  - **못 읽은 것을 "없다"로 만들지 않는다.** 표가 없으면 `memoryLines` 는 칸을 빼고(던지지 않는다), `/memories` 는 "아직 확인할 수 없어요" 를 그린다. 스키마 push 전 배포에서 실제로 일어난다.
  - `/memories` 는 **메뉴에 없다**(매일 여는 화면이 아니다). 길은 `/admin` 아래 링크와 포동이의 결과 카드.
- **실행 기록 (`lib/agent/run-log.ts`, `AgentRun`)** — 한 턴이 끝나면 라우트가 한 줄 남긴다.
  - 남기는 것은 **도구 이름·성패·label·걸린 시간**과 질문 200자·결과(ok/error/aborted)·화면에 띄운 오류 한 문장까지다. **`ToolResult.data` 도, 도구의 `error` 문구도, 공급자 오류 본문도 넣지 않는다** — `read_url` 로 가져온 바깥 글과 가족의 일기 본문이 로그 표에 눌러앉고, 공급자 원문에는 사용자 ChatGPT 세션 사정이 섞인다. 거르는 곳은 `shapeRun()` 한 군데(순수 함수라 프리즈마 없이 시험한다).
  - **기록이 실패해도 대화는 살아야 한다** — `recordRun` 은 던지지 않는다. 로그 때문에 가족의 답이 사라지면 본말이 뒤집힌다.
  - 무료 티어라 **30일치만** 둔다(`AGENT_RUN_LOG_DAYS`). 기록할 때마다 지난 것을 지운다(실측: 40일 전 행이 지워졌다).
  - 보는 법은 **`npm run agent:runs [개수]`**. 표만 만들고 읽을 길이 없으면 없는 것과 같다.
- **2단계가 정한 것**
  - `createCodexProvider()` 수명 = **요청 하나.** `app/api/agent/route.ts` 가 요청마다 새로 만들어 `session_id` 도 턴마다 새로 생긴다. `store:false` 라 히스토리를 매번 다시 보내므로 문제되지 않는다.
  - 결과 카드는 `components/agent/agent-stream.ts` 의 `visibleResults` 가 두 갈래로 추린다. **만든 것(`undo` 있음)은 하나도 접지 않는다** — 되돌리기를 품은 유일한 자리이고, 리소스 16종 중 14종은 `detailPattern` 이 없어 만든 항목의 `path` 가 목록 경로로 다 같아지므로 경로로 중복을 지우면 "우유·계란·빵" 의 둘째·셋째가 되돌리기째 사라진다. **찾아준 곳(`undo` 없음)만** 같은 경로 한 번 · 만든 카드가 이미 가리키는 곳 제외 · `MAX_PLACE_CARDS`(2장) 상한.
  - 시트는 **폰에서만** `보러가기` 에 스스로 닫힌다(`onNavigate`). 데스크톱은 우하단에 380px 로 떠서 **본문 오른쪽 한 줄만** 가리고 도착한 페이지가 뒤에 그대로 보이므로 닫지 않는다 — "아무것도 안 가린다"가 아니다(1440px 에서 재 봤다). 폰은 전체를 덮으니 닫아야 한다.
  - 기록 삭제는 숨은 제스처가 아니라 **보이는 휴지통**(저장소의 다른 목록과 같은 규칙). 목록 조회가 실패하면 빈 목록으로 그리지 않는다 — "확인 안 됨"을 "없음"으로 보여주지 말 것.
- **링크 읽기 (`lib/agent/read/`, §20)** — `read_url` 이 계단으로 훑는다: 메타 → JSON-LD → 본문 → 블롭 → 그림. 위 칸이 쓸 만하면 아래로 안 간다. 순수 함수라 네트워크 없이 시험한다.
  - **헤드리스 브라우저를 쓰지 않는다.** 실측(`docs/superpowers/specs/2026-09-20-web-reading-findings.md`)에서 주류 5/5 사이트가 fetch 만으로 읽혔고, 못 읽는 네 종류 중 렌더가 고치는 건 하나뿐이다 — 쿠팡은 렌더해도 차단, 인스타는 안 지어도 블롭에 다 있다. **"안 읽히니 브라우저를 넣자"로 되돌아가기 전에 그 문서를 읽을 것.**
  - **공급자 내장 웹검색(`web_search`)이 켜져 있다**(`AGENT_WEB_SEARCH`, 기본 켬). 우리가 못 읽는 사이트를 모델이 대신 읽는다(실측: 쿠팡 403 을 정직하게 보고). **다만 본 것처럼 말하면서 틀리기도 한다** — 유튜브 도입부 대사를 지어냈다. 그래서 안내문이 "주소를 받으면 read_url 을 먼저, 검색으로 안 것은 검색이라고 밝혀라"를 강제한다. 이 순서를 뒤집지 말 것. native 모드에서만 붙인다(json 모드는 우리가 글로 도구를 설명하는 안전망이라 섞으면 안 된다).
  - ⚠️ **유튜브 자막은 배포 환경에서 안 온다.** Vercel 빌드에서 직접 재 보니 `player` 가 HTTP 200 에 **트랙 0개**를 준다 — 같은 코드가 집 IP 에서는 31개를 받는다. 데이터센터 IP 를 다르게 대우하는 것이다. **클라이언트 6종 × 재시도 3번, 무료 프록시 6곳, 브라우저 직접(CORS 차단), Invidious 를 다 확인했다 — 무료로는 길이 없다**(`yt-dlp` 도 같은 벽이다. 클라이언트가 아니라 IP 문제다). 그래서 배포된 사이트는 설명·챕터로 답하고 그 사실을 밝힌다. 뚫으려면 주거용 IP 프록시(유료)가 필요하다. **"코드가 틀렸나" 하고 세 값을 의심하기 전에 어디서 실행 중인지부터 볼 것.**
  - **유튜브 자막은 ANDROID player 경로로만 받아진다.** watch 페이지의 `captionTracks[].baseUrl` 은 죽은 주소다(빈 몸통). 살아 있는 주소는 `youtubei/v1/player` 를 `clientName:"ANDROID", clientVersion:"20.10.38"` 으로 불러야 나온다. **세 값이 어긋나면 안 된다** — 버전(낮추면 400) · `&fmt=srv3` 를 뗄 것(붙이면 빈 몸통) · `&exp=xpe` 면 포기(PO 토큰 필요). 시험이 셋 다 붙잡고 있다. 비공식 경로라 깨지면 **이 세 값부터 의심할 것.**
  - 자막을 못 받은 영상은 설명과 **시각이 붙은 챕터**로 답한다. **자막을 읽었는지 아닌지를 결과 글이 밝힌다** — 안 밝히면 모델이 영상을 본 것처럼 말한다(실측: 없는 대사를 지어냈다). 자동 생성 자막이면 "받아쓰기라 틀릴 수 있다"까지 적는다.
  - **못 읽은 것을 읽은 척하지 않는다.** ① HTTP 200 에 실린 `Access Denied` 는 차단으로 판정한다(쿠팡 실측). ② 제목 말고 아무것도 없으면 `ok` 를 주지 않는다. ③ 잘랐으면 "전체 43,270자 중 앞부분 6,000자" 처럼 숫자로 말한다 — `…` 하나로는 전달되지 않는다.
  - **그림은 `data` 밖에 둔다.** 루프가 `ToolResult` 를 JSON 으로 직렬화해 대화에 넣으므로, `imageData` 를 `data` 안에 넣으면 base64 가 글로 박혀 한 턴을 먹는다. 루프가 직렬화 전에 떼어 그림 파트로 보낸다(`detail:"low"` — 토큰 ~85개 고정). 스크린샷이 아니라 **페이지가 내놓은 그림**(og:image 등)이다.
  - 바깥 사이트에는 평범한 브라우저 UA 를 보낸다. 가족이 준 주소를 한 번 여는 것이지 크롤링이 아니다 — 한 주소당 한 번, 링크를 따라 돌아다니지 않고, 세션 쿠키는 붙이지 않는다. **이 함수를 사이트 긁기로 늘리지 말 것.**
  - 껍데기 주소를 바꾸는 표는 `read/rewrite.ts` 에 **짧게** 둔다(현재 네이버 블로그 하나). 사이트마다 규칙을 늘리기 시작하면 끝이 없다.

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
