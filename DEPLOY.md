# 🚀 Vercel 배포 가이드 (포동)

모두 **무료 티어**로 가능해요. 순서대로 따라 하면 됩니다.

준비: GitHub 저장소(이미 있음 `sacross93/family-web`) · Vercel 계정 · Neon 계정(PostgreSQL)

---

## 1. 데이터베이스 만들기 (Neon)

1. https://neon.tech 가입 → **New Project** 생성 (리전은 가까운 곳, 예: Singapore/Tokyo)
2. 대시보드의 **Connection string** 복사. 두 종류가 있어요(토글로 전환):
   - **Pooled** (호스트에 `-pooler` 포함) → *앱 실행용*
   - **Direct** (`-pooler` 없음) → *스키마 생성용*
3. 둘 다 메모해 둡니다. 예:
   ```
   # Pooled (Vercel DATABASE_URL 용)
   postgresql://USER:PASS@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require

   # Direct (db push 용)
   postgresql://USER:PASS@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

---

## 2. 스키마 + 초기 데이터 넣기 (로컬에서 1회)

방금 만든 **Direct** 연결로 프로덕션 DB에 테이블을 만듭니다:

```bash
# 스키마 생성
DATABASE_URL="<Neon Direct 문자열>" npx prisma db push

# (선택) 샘플 데이터 + 로그인 계정(wlsdud022)
DATABASE_URL="<Neon Direct 문자열>" npm run db:seed
```

> 실제 가족용이면 샘플 시드 대신 계정만 만드는 걸 권장:
> ```bash
> DATABASE_URL="<Neon Direct>" npm run user:add -- 아빠아이디 강한비번 아빠 --admin
> ```

### 스키마가 바뀐 커밋을 배포할 때

모델(`prisma/schema.prisma`)이 바뀐 커밋은 **코드 push 전에** 아래를 먼저 실행하세요.

```bash
DATABASE_URL="<Neon Direct>" npx prisma db push
```

안 하면 새 테이블을 쓰는 페이지가 열리지 않아요. 예: 아기 페이지(`Pregnancy`·`JourneyEntry`·`JourneyChecklistItem`·`JourneyLink`·`CycleEvent`·`JourneySettings`).
사이트 에이전트도 같습니다 — `AgentAuth`·`AgentRun`·`AgentChat`·`AgentChatMessage` **네 테이블**을 **코드 배포 전에** 먼저 만들어 주세요(6절).
특히 `AgentChat`·`AgentChatMessage` 는 대화 기록을 담는 테이블이라, 코드가 먼저 올라가면 **첫 질문을 보내는 순간 500** 이 납니다.

2026-10 아기 페이지 재설계 이후 옛 `Baby`·`BabyEntry`·`BabyChecklistItem`·`BabyLink` 표는 쓰이지 않는다. 비어 있으면 Neon 콘솔에서 `DROP TABLE "BabyLink", "BabyChecklistItem", "BabyEntry", "Baby";` 로 지워도 된다(사람 손으로 한 번 — `ensure.sql` 에 넣지 말 것).

---

## 3. Vercel 프로젝트 만들기

1. https://vercel.com 가입 (**GitHub으로 로그인** 추천)
2. **Add New → Project → Import** `sacross93/family-web`
3. Framework는 **Next.js** 자동 감지 → 그대로 둠
4. **Deploy 누르기 전에** → **Environment Variables** 에 추가:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Neon **Pooled** 문자열 + 끝에 `&pgbouncer=true` 붙이기 |
   | `AUTH_SECRET` | 아래 명령으로 생성한 값 |
   | `TZ` | `Asia/Seoul` — 서버 "오늘" 계산(주차·D-day)을 한국 날짜 기준으로 |
   | `AGENT_ENABLED` | (선택) 사이트 에이전트 스위치. 켤 때 **정확히 `true`** — 그 밖의 값은 전부 "꺼짐"이고, 꺼지면 화면에 "물어보기" 버튼이 안 뜨고 `/api/agent` 는 403 |
   | `AGENT_ORIGIN` | 에이전트를 켠다면 배포 주소로 채우세요(예: `https://family-web-xxxx.vercel.app`, 끝 `/` 없이). 아래 ⚠️ |
   | `AGENT_MODEL` | (선택) 모델 ID. 비우면 코드 기본값(`gpt-5.6-terra`) — 나머지 `AGENT_*` 는 [.env.example](.env.example) 참고 |
   | `GOOGLE_SERVICE_ACCOUNT_JSON`·`GOOGLE_CALENDAR_ID` | (선택) 구글 캘린더 동기화 — **7절**. 없으면 동기화만 꺼지고 사이트는 그대로 |

   ```bash
   openssl rand -base64 32   # 나온 값을 AUTH_SECRET 에 붙여넣기
   ```
   > DATABASE_URL 예: `postgresql://...-pooler.../neondb?sslmode=require&pgbouncer=true`

   > ⚠️ **`AGENT_ORIGIN` 은 에이전트가 이 사이트의 내부 API 를 부를 때 쓰는 주소입니다.**
   > 보안상 요청 헤더에서 만들지 않습니다 — 헤더를 믿으면 그 주소로 나가는 요청에 가족의 세션 쿠키가
   > 실려 남의 서버로 걸어 나가기 때문이에요(`lib/agent/origin.ts`).
   > 그래서 **서버가 아는 값만** 씁니다. 사슬은 이렇습니다:
   >
   > ```
   > AGENT_ORIGIN → AUTH_URL → http://localhost:3000
   > ```
   >
   > 비워 두면 곧바로 깨지는 건 아니고 `AUTH_URL` 로 떨어집니다. 다만 `AUTH_URL` 이 없거나 로컬 주소를
   > 가리키면 **배포 서버의 도구가 localhost 를 부르게 되어** 항목 추가와 되돌리기가 조용히 실패해요.
   > `AUTH_URL` 은 5절에서 첫 배포 뒤에 넣으므로, 그때 `AGENT_ORIGIN` 도 같이 채워 두는 게 안전합니다.

   > ⚠️ **사이트 에이전트를 쓴다면 `AUTH_SECRET` 을 새로 만들면 안 됩니다.**
   > 이 값은 로그인 세션 서명뿐 아니라 에이전트 토큰 암호화 키(`lib/agent/crypto.ts`)의 재료입니다.
   > 로컬과 프로덕션의 `AUTH_SECRET` 이 다르면 저장된 토큰을 **복호화할 수 없어요**(GCM 인증 실패).
   > 이미 프로덕션에 다른 값이 들어가 있다면, 그 값 그대로 토큰을 주입하면 됩니다 — 6절 참고.
5. **Deploy** 클릭 → 잠시 후 `https://family-web-xxxx.vercel.app` 주소가 나와요.

### 함수 지역은 싱가포르(`sin1`) — DB 옆에

저장소 루트의 `vercel.json` 이 서버 함수 지역을 **`sin1`(싱가포르)** 로 정합니다. Neon DB 가
`ap-southeast-1`(싱가포르)에 있기 때문입니다.

**왜:** Vercel 새 프로젝트의 기본 함수 지역은 **미국 동부 `iad1`** 입니다. 그대로 두었더니
화면을 열 때마다 서울 → 미국을 한 번 건너고, 그 안에서 **DB 조회 하나마다 미국 ↔ 싱가포르**를
또 건넜습니다(2026-09-23 실측).

| | 걸린 시간(응답 시작까지) |
|---|---|
| 운영 응답 헤더 `x-vercel-id` | `icn1::iad1::…` — 서울 엣지에서 받고 미국 동부에서 실행 |
| `/login`, 연달아 열 때(iad1) | 0.57~0.81초 |
| `/login`, 7분 쉰 뒤 첫 요청(iad1) | 1.15초 |
| 같은 빌드를 로컬 `next start` + 로컬 DB 로 | 0.004~0.008초 |

코드가 화면을 만드는 시간은 거의 0 이고, 나머지는 전부 지역 사이를 오가는 시간이었습니다.

- `vercel.json` 의 `regions` 는 **대시보드 설정(Settings → Functions → Function Regions)보다 우선**합니다.
  대시보드에서 바꿔도 이 파일이 있으면 파일 값이 적용됩니다.
- **Hobby(무료) 플랜은 지역 하나만** 됩니다. 두 개 이상 적으면 빌드 전에 배포가 실패합니다
  (`lib/deploy-region.test.ts` 가 한 개인지 확인합니다).
- 적용은 **다음 배포부터**입니다. 배포 뒤 응답 헤더 `x-vercel-id` 가 `…::sin1::…` 인지 보면 됩니다.
- ⚠️ **DB 를 옮기면 이 값도 같이 옮기세요.** Neon 프로젝트를 다른 지역에 새로 만들면
  함수와 DB 가 다시 갈라져 화면마다 바다를 건넙니다. 지역 코드 표: https://vercel.com/docs/regions
- `next.config` 나 페이지의 `preferredRegion` 으로는 **안 됩니다** — Vercel 에서는 edge 런타임에만
  먹습니다(Next 16 문서). 이 사이트는 Node 함수라 `vercel.json` 이 맞는 자리입니다.

---

## 4. 사진 저장소 연결 (Vercel Blob)

Vercel은 파일을 서버에 저장할 수 없어서 사진은 Blob에 저장합니다.

1. 프로젝트 → **Storage** 탭 → **Create Database** → **Blob** → Create
2. 프로젝트에 **Connect** → `BLOB_READ_WRITE_TOKEN` 환경변수가 **자동 추가**됨
3. **Deployments** 탭 → 최신 배포 → **Redeploy** (환경변수 반영)

> 코드는 이미 대응돼 있어요: Blob 토큰이 있으면 클라우드 저장, 없으면(로컬) 파일 저장으로 자동 전환.

---

## 5. 마무리

1. `AUTH_URL` 환경변수를 실제 주소로 추가 → 다시 Redeploy
   - `AUTH_URL = https://family-web-xxxx.vercel.app`
   - 사이트 에이전트를 켰다면 **같은 주소를 `AGENT_ORIGIN` 에도** 넣어 주세요(3절 표의 ⚠️).
2. 그 주소 접속 → 로그인 (`wlsdud022`/`wlsdud022` 또는 만든 계정)
3. 이제 **`git push` 하면 자동으로 재배포**됩니다.

---

## 6. 사이트 에이전트 토큰 (선택 — `AGENT_ENABLED=true` 일 때만)

에이전트의 두뇌는 ChatGPT(Codex) OAuth 토큰입니다. Vercel 은 파일을 쓸 수 없어서 토큰은 DB(`AgentAuth`)에 **암호화해서** 넣어 둡니다.

**(가장 쉬움) 관리자 화면에서 연결** — 환경변수도 터미널도 필요 없습니다. 폰에서도 됩니다.

1. 배포된 사이트에 **관리자 계정**으로 로그인 → `/admin` → 「AI 포동이 연결」 카드를 엽니다.
2. **[다시 연결하기]** → 새 탭에서 ChatGPT 로 로그인합니다. 탭이 안 열리면 카드의 **[ChatGPT 로그인 열기]** 를 누르세요.
3. 로그인을 마치면 그 탭이 **"연결할 수 없음"** 화면이 됩니다(`localhost:1455` 로 돌아가서 그래요 — 정상입니다). 그 탭의 **주소창 주소를 통째로** 복사해 카드에 붙여넣고 **[연결]**.
4. "연결됐어요 ✓" 가 뜨면 끝. 15분 안에 마쳐야 하고, 실패하면 처음부터 다시 하면 됩니다.

운영 서버가 이미 운영 DB 와 `AUTH_SECRET` 을 갖고 있어서, 아래 ⚠️ 1 처럼 값을 맞출 일이 없습니다. 지금 연결된 것과 **다른 ChatGPT 계정**으로 로그인하면 저장하지 않고 멈춥니다 — 정말 바꿀 거면 카드의 "다른 ChatGPT 계정으로 바꿔도 돼요" 를 켜고 처음부터 하세요. (구조와 이유는 [PODONGI.md](PODONGI.md) 의 "다시 연결" 항목.)

**터미널에서** — 관리자 화면을 쓸 수 없을 때(처음 배포 전 등):

```bash
# (권장) 브라우저로 로그인해서 DB 에 바로 저장 — 평문 토큰 파일을 만들지 않습니다
DATABASE_URL="<Neon Direct>" AUTH_SECRET="<Vercel 의 AUTH_SECRET>" npm run agent:login

# 이미 받아 둔 토큰 파일이 있다면 이쪽도 됩니다
DATABASE_URL="<Neon Direct>" AUTH_SECRET="<Vercel 의 AUTH_SECRET>" npm run agent:auth -- <토큰 json 경로>
```

⚠️ **프로덕션에 넣을 때는 두 환경변수를 반드시 앞에 붙이세요.** 안 그러면 로컬 DB 에 들어갑니다.

- `npm run agent:login` — 브라우저가 열리고, 로그인이 끝나면 `localhost:1455` 가 콜백을 받아 **DB 에 바로** 저장합니다. 파일을 거치지 않으니 나중에 지울 비밀도 없어요.
  - 포트를 못 열면(원격 접속·이미 점유) **자동으로 붙여넣기 모드로 넘어갑니다** — 안내대로 로그인 후 주소창의 주소를 붙여넣으면 됩니다. 처음부터 그 모드로 가려면 `npm run agent:login -- --paste`.
  - `--paste` 는 인자를 받지 않습니다(URL 은 실행 중에 붙여넣습니다). PKCE 의 `verifier`·`state` 가 인증 주소를 만든 **그 실행 안에만** 있어서, 두 번에 나눠 실행하면 토큰 교환이 반드시 실패하기 때문입니다.
- `npm run agent:auth -- <경로>` — 평평한 `{ access_token, … }` 과 `~/.codex/auth.json` 의 중첩 `{ tokens: { … } }` 을 **둘 다** 받습니다. 중첩 구조엔 만료 정보가 없어 access_token(JWT)의 `exp` 로 대신합니다.

어느 쪽이든 화면에는 `provider · account_id · 만료`만 찍힙니다(토큰 값은 찍지 않아요). 파일로 넣었다면 그 원본에는 평문이 남으니 **아래 ⚠️ 2 를 읽고 나서** 지워 주세요.

### ⚠️ 1. `AUTH_SECRET` 은 로컬과 프로덕션이 같아야 합니다

암호화 키가 `AUTH_SECRET` 에서 파생되므로(`lib/agent/crypto.ts`), 로컬에서 넣은 토큰을 프로덕션에서 읽으려면 두 값이 같아야 합니다. 다르면 복호화가 실패하고 `저장된 토큰을 읽지 못했어요` 가 뜹니다.
**3절의 `openssl rand -base64 32` 안내를 그대로 따라 새 값을 만들면 에이전트 토큰이 죽습니다.** 길은 둘입니다.

- **(권장) 프로덕션 값 그대로 주입** — 위 명령의 `AUTH_SECRET` 에 Vercel 에 이미 넣은 값을 씁니다. 가족들의 로그인 세션은 그대로 살아 있습니다.
- **프로덕션 `AUTH_SECRET` 을 로컬 값으로 교체** — 같은 값이 jose 세션 쿠키 서명에도 쓰이므로 **가족 전원이 다시 로그인**해야 합니다. 그 비용을 감수할 때만.

### ⚠️ 2. `KEY_DOMAIN` 을 바꾸면 기존 암호문을 못 읽습니다

`lib/agent/crypto.ts` 의 `KEY_DOMAIN`(`"agent-token-v1:"`)도 키 재료입니다. 이 문자열을 바꾸면 이미 저장된 토큰이 열리지 않아요. 되살리는 길은 둘입니다.

1. **다시 로그인** — `npm run agent:login`. 가장 간단하고 언제나 됩니다.
2. **재암호화 마이그레이션** — 다시 로그인하지 않고 살리고 싶다면, 한 트랜잭션 안에서 *옛 키로 복호화 → 새 키로 재암호화*합니다.
   실행 **전**에 "옛 키로 복호화 성공 / 새 키로 실패"를, **후**에 "새 키로 복호화 성공 + 평문이 같음"을 확인하세요.

> 개발 중 실제로 이 상황이 났습니다. 그때는 로그인 스크립트가 없었고 원본 토큰 파일도 임시 폴더에서 사라져, 2번으로 살렸어요.
> 지금은 1번이 있으니 막다른 길은 아닙니다. 다만 **토큰 파일은 휘발성이라 믿지 마세요** — 되살리는 길은 파일이 아니라 `agent:login` 입니다.
> (일회용 참고 구현 `rekey.ts` 는 `.superpowers/sdd/` 아래 — gitignore 대상이라 저장소에는 없습니다.)

### ⚠️ 3. 로컬 Codex CLI 와 갱신이 충돌할 수 있습니다

같은 계정의 refresh_token 을 사이트와 로컬 Codex CLI 가 **각자** 갱신하면, 회전된 토큰 때문에 뒤늦은 쪽이 `invalid_grant` 를 받을 수 있습니다. 실제로 지금 `~/.codex/auth.json` 의 만료 시각과 DB `AgentAuth.expiresAt` 이 달라, 같은 계정에 access_token 이 둘 살아 있습니다. 충돌 조건은 이미 있는 셈이에요.

- 에이전트가 갑자기 토큰 오류를 내면 먼저 이걸 의심하세요. **회복은 다시 로그인하는 것**입니다 — `/admin` 의 연결 카드(위)나 `npm run agent:login`. 새 토큰이 DB 에 바로 들어갑니다.
  예전 토큰 파일을 다시 넣는 것으로는 안 됩니다. `invalid_grant` 이 난 시점엔 그 파일의 refresh_token 도 이미 죽어 있어요.
  손에 쓸 만한 토큰 파일(`~/.codex/auth.json` 포함)이 있다면 `npm run agent:auth -- <경로>` 도 됩니다.
  프로덕션을 고치는 거라면 **`DATABASE_URL`·`AUTH_SECRET` 을 프로덕션 값으로** 붙여서 실행하세요.
- 첫 갱신 예상 시점은 **2026-09-27**(만료 이틀 전부터 갱신). 그때 Vercel 로그에 `refresh: json ok` 또는 `refresh: form ok` 중 하나가 찍힙니다 — 어느 본문 형식이 맞는지는 아직 실측 전이라 둘 다 시도하게 해 두었고, 이 한 줄이 답을 알려 줍니다.

### ⚠️ 4. 테이블 4개를 먼저 만드세요

`AgentAuth`·`AgentRun`·`AgentMemory`·`AgentChat`·`AgentChatMessage` 를 **코드 배포 전에** `prisma db push` 로 프로덕션에 반영합니다(2절). 순서가 어긋나면 해당 기능이 500 을 냅니다 — 예전에 `/baby` 에서 한 번 겪었어요.

- `AgentAuth` — 암호화된 토큰 한 줄. 이 절의 명령이 채웁니다.
- `AgentChat`·`AgentChatMessage` — 대화 기록. 창을 여는 것만으로는 DB 를 건드리지 않지만, **질문을 보내면 쓰고 ☰ 기록을 열면 읽습니다.** 코드가 먼저 올라가면 그 두 자리에서 500 이 납니다.
- `AgentRun` — 실행 로그용. 한 턴이 끝나면 한 줄씩 쌓입니다(`npm run agent:runs` 로 봅니다).
- `AgentMemory` — 포동이가 대화를 넘어 기억하는 한 줄들(`/memories`). **없으면 그 기능만 조용히 빠집니다**(500 이 아니라 "아직 확인할 수 없어요").
  - **이제 손으로 할 것이 없습니다.** 배포할 때 `scripts/ensure-tables.mjs` 가 `prisma/ensure.sql` 을 돌려 있어야 할 표를 만듭니다. 운영 `DATABASE_URL` 은 Vercel 에 Secret 이라 아무도 다시 못 읽지만 **빌드 환경은 갖고 있기 때문**입니다.
  - ⚠️ `prisma/ensure.sql` 에는 **`CREATE ... IF NOT EXISTS` 만** 적습니다. 배포마다 도는 자리라 `DROP`·`ALTER` 한 줄이 들어가면 배포할 때마다 운영 데이터가 그 명령을 맞습니다(스크립트가 그런 낱말을 보면 실행을 건너뜁니다). 열을 바꾸거나 표를 지우는 일은 사람이 한 번만 하세요.

### ⚠️ 5. 아직 확인하지 못한 것

- **Vercel Hobby 요금제에서 `maxDuration = 60` 이 허용되는지 모릅니다.** `app/api/agent/route.ts` 가 60초로 선언해 두었는데(토큰 갱신 HTTP 타임아웃 8초 × 2 + 여유가 필요해서), Hobby 의 상한이 그보다 낮으면 빌드나 실행에서 거절될 수 있어요. **첫 배포 후 실제로 한 번 물어보고** 로그를 확인하세요. 거절되면 그때 상한에 맞춰 줄이되, **8초 × 2 아래로는 내리지 마세요** — 갱신이 트랜잭션 안에서 일어나서, 중간에 함수가 죽으면 refresh_token 이 영구히 죽습니다(그러면 `npm run agent:login` 으로 다시 로그인해야 합니다).

---

## 7. 구글 캘린더 동기화 (선택)

사이트 "캘린더" 의 일정과 가족 구글 캘린더를 **양방향으로** 잇습니다. **서비스 계정**으로 붙어서 사이트에 구글 로그인 화면은
없어요. 오가는 것은 사이트 "일정" 뿐입니다(할 일·아기 페이지 표시·기념일은 안 갑니다).
설계는 [스펙](docs/superpowers/specs/2026-10-16-google-calendar-sync-design.md), 지켜야 할 규칙 요약은 AGENTS.md "구글 캘린더".

### 7-1. 캘린더를 서비스 계정에 공유

1. Google Cloud 프로젝트(`podong-511806`)에서 **Google Calendar API** 가 사용 설정돼 있는지, 서비스 계정
   (`id-146@podong-511806.iam.gserviceaccount.com`)의 **키(JSON)** 가 있는지 확인합니다.
2. 구글 캘린더(웹) → 대상 캘린더의 **설정 및 공유** → **특정 사용자와 공유** → 서비스 계정 이메일을 넣고 권한 **"일정 변경"**.
   - **"일정 변경" 이면 충분합니다.** "변경 및 공유 관리"(owner)로 공유해도 동작합니다 — 지금이 그렇습니다(2026-10-16 실측).
   - "보기" 만 주면 쓰기가 막혀 관리자 카드에 "캘린더를 열 수 없어요 — 서비스 계정에 '일정 변경'으로 공유됐는지 확인해 주세요" 가 뜹니다.
     ⚠️ 다만 **읽기는 되므로** 미리보기도 나오고, 보낼 일정이 0개면 [처음 맞추기]도 성공해 구글 일정을 가져옵니다. 오류는
     **처음 쓸 때**(사이트에서 일정을 만들거나 고칠 때, 보낼 것이 있는 처음 맞추기) 비로소 보입니다 — 처음 맞추기가 됐다고
     권한이 맞는 것은 아니에요. 공유 권한을 먼저 확인하세요.

### 7-2. Vercel 환경변수 (Production, **Sensitive**)

| Name | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | 키 파일 내용 **전체**(처음 `{` 부터 끝 `}` 까지) |
| `GOOGLE_CALENDAR_ID` | 대상 캘린더 ID — 기본 캘린더면 그 구글 이메일 |

- ⚠️ **키의 줄바꿈은 손대지 마세요.** 파일 내용을 그대로 붙여넣으면 `private_key` 안의 줄바꿈이 `\n` 글자로 들어가 있고,
  그게 맞습니다. 어떤 도구가 한 번 더 이스케이프해 `\\n` 이 되어도 받습니다(`lib/gcal/config.ts`). 반대로 **손으로 줄을 바꾸거나
  따옴표·중괄호를 떼면** 키를 못 읽어 동기화가 꺼지고, 관리자 카드에 "키 형식을 읽지 못했어요" 가 뜹니다(값은 보이지 않아요).
- 둘 중 하나라도 없거나 키를 못 읽으면 동기화는 **꺼진 상태** — 사이트는 지금처럼 돌고 500 을 내지 않습니다.
- 넣거나 바꾼 뒤 **Redeploy**. 키·토큰은 로그·화면·오류 문구 어디에도 나오지 않습니다.

### 7-3. 처음 맞추기 (관리자가 한 번)

**배포만으로는 아무것도 오가지 않습니다.** 처음 맞추기 전에는 자동 동기화도, 사이트에서 쓴 것을 구글에 반영하는 것도 멈춰 있어요.

1. 운영 사이트에 관리자로 로그인 → `/admin` → 「구글 캘린더」 카드. **켜짐**과 캘린더 ID 를 확인합니다.
2. **미리보기 숫자를 먼저 읽습니다** — "구글로 보낼 N · 하나로 이을 M · 사이트로 가져올 K".
   - **N** = 사이트의 오늘 이후 일정 중 구글에 짝(같은 날·같은 제목)이 없는 것 → 진짜 캘린더에 **새로 생깁니다.**
     예상보다 크면 누르지 말고 사이트 일정부터 보세요(견본 일정이 남아 있지 않은지).
   - **M** = 양쪽에 따로 적힌 같은 날·같은 제목 → 하나로 **잇기만** 합니다(내용은 옮기지 않아요).
   - **K** = 창(90일 전 ~ 365일 뒤) 안의 구글 일정 → 사이트로. 반복 일정은 회차마다 하나씩 들어옵니다.
3. **[처음 맞추기]**. 한 건이라도 실패하면 "한 번 더 눌러 주세요" 가 뜹니다 — 이미 이은 것은 남으니 다시 누르면 남은 것만 합니다.
4. 그 뒤로는 홈·캘린더를 열 때마다 맞춥니다(60초에 한 번). 카드의 **[지금 맞추기]** 는 그 제한을 건너뜁니다.

- `GOOGLE_CALENDAR_ID` 를 다른 캘린더로 바꾸면 연결을 모두 지우고 **처음 맞추기부터** 다시입니다(사이트 일정은 그대로).
- 반복 회차·여러 날 일정은 사이트에서 고치거나 지울 수 없습니다(구글 캘린더에서). 화면이 그렇게 안내합니다.
- 로컬의 `npm run gcal:check` 는 **진짜 캘린더**에 `[포동시험]` 일정을 만들고 지우는 확인 스크립트입니다. 운영 DB 와는 상관없고
  (로컬 DB 전용), 끝나면(실패·Ctrl+C·터미널 닫기·kill 이어도) 로컬 동기화 상태를 처음으로 되돌립니다. 지운 시험 일정은 구글
  휴지통에 "취소됨" 으로 한동안 남아요.
  - **돌리기 전에 로컬 개발 서버(`npm run dev`·`dev:lan`·`start`)를 끄세요.** 시험 도중 그 서버로 들어온 쓰기(브라우저 탭·LAN 기기·
    포동이·`ui:flows`)가 진짜 캘린더로 갑니다. `localhost:3000`·`3001` 이 응답하면 스크립트가 멈춥니다.
  - 로컬 견본 일정(연결 없는 일정)도 먼저 비웁니다 — `db:seed` 직후에도 견본이 다시 생겨 있어 멈춥니다(지우는 한 줄은 AGENTS.md).
  - **강제로 꺼졌다면**(kill -9 등) 로컬이 "처음 맞추기를 마친" 채로 남습니다 — 그대로 로컬 화면을 열면 진짜 캘린더와 맞추기
    시작해요. **먼저** 로컬 동기화 표를 비우고(`npm run db:seed`, 또는 로컬 DB 에
    `DELETE FROM "GoogleEventLink"; DELETE FROM "GoogleSyncState"; DELETE FROM "CalendarEvent";`) `gcal:check` 를 다시 돌리면
    끝의 정리가 남은 `[포동시험]` 을 모두 지웁니다.

---

## 문제 해결

- **DB 연결 에러**: `DATABASE_URL`에 `?sslmode=require` 있는지 확인. Pooled면 `&pgbouncer=true`도.
- **`prisma db push` 실패**: Pooled 말고 **Direct** 문자열로 실행.
- **사진 업로드 실패**: Blob 스토리지 Connect 후 **Redeploy** 했는지 확인.
- **로그인 후 바로 튕김**: `AUTH_SECRET`이 설정됐는지 확인.
- **에이전트가 "저장된 토큰을 읽지 못했어요"**: 토큰을 넣을 때와 `AUTH_SECRET`(또는 `KEY_DOMAIN`)이 달라진 경우예요 → 6절 ⚠️ 1·2.
- **에이전트가 "토큰 갱신에 실패했어요 (HTTP 4xx · invalid_grant)"**, 또는 대화가 **"ChatGPT 연결이 풀렸어요"**: refresh_token 이 죽었거나 다른 곳에서 회전됐어요 → `/admin` 의 연결 카드에서 다시 연결 (또는 `npm run agent:login`, 6절 ⚠️ 3).
- **"물어보기" 버튼이 안 보임**: `AGENT_ENABLED=true` 인지 확인하고 Redeploy. 꺼져 있으면 버튼이 아예 렌더되지 않아요(정상 동작).
- **질문을 보내거나 ☰ 기록을 열면 500** (창을 여는 것 자체는 멀쩡함): `AgentChat`·`AgentChatMessage` 테이블이 아직 없어요 → 2절의 `prisma db push` (6절 ⚠️ 4).
- **에이전트가 뭘 추가했다는데 사이트에 안 보이거나 되돌리기가 안 됨**: `AGENT_ORIGIN` 이 배포 주소인지 확인하세요. 비어 있으면 `AUTH_URL`, 그것도 없으면 `localhost:3000` 으로 나갑니다 (3절 표의 ⚠️).
- **구글 캘린더 카드가 "키 형식을 읽지 못했어요"**: `GOOGLE_SERVICE_ACCOUNT_JSON` 을 파일 내용 그대로 다시 붙여넣고 Redeploy (7절 ⚠️ 줄바꿈).
- **구글 캘린더 카드가 "캘린더를 열 수 없어요"**: 서비스 계정에 공유가 안 됐거나 "보기" 권한이에요 → 7-1. `GOOGLE_CALENDAR_ID` 오타도 같은 모양입니다.
- **구글 캘린더 카드가 켜져 있는데 아무것도 안 오감**: [처음 맞추기]를 아직 안 눌렀어요 → 7-3.

## 다음 단계 (선택)
- **구글 캘린더 동기화**: 7절(서비스 계정 — redirect URI 같은 건 필요 없어요). **구글 로그인**은 아직 밑작업만 → [REQUIREMENTS.md](REQUIREMENTS.md) "구글 로그인" 절
- **예쁜 주소**: Vercel 프로젝트 → Settings → Domains 에서 커스텀 도메인 연결
