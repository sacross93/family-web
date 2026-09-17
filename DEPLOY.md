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

안 하면 새 테이블을 쓰는 페이지가 열리지 않아요. 예: 아기 페이지(`Baby`·`BabyEntry`·`BabyChecklistItem`).
사이트 에이전트도 같습니다 — `AgentAuth`·`AgentRun` 두 테이블을 **코드 배포 전에** 먼저 만들어 주세요(6절).

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
   | `AGENT_ENABLED` | (선택) 사이트 에이전트 스위치. 기본 `false` — 나머지 `AGENT_*` 는 [.env.example](.env.example) 참고 |

   ```bash
   openssl rand -base64 32   # 나온 값을 AUTH_SECRET 에 붙여넣기
   ```
   > DATABASE_URL 예: `postgresql://...-pooler.../neondb?sslmode=require&pgbouncer=true`

   > ⚠️ **사이트 에이전트를 쓴다면 `AUTH_SECRET` 을 새로 만들면 안 됩니다.**
   > 이 값은 로그인 세션 서명뿐 아니라 에이전트 토큰 암호화 키(`lib/agent/crypto.ts`)의 재료입니다.
   > 로컬과 프로덕션의 `AUTH_SECRET` 이 다르면 저장된 토큰을 **복호화할 수 없어요**(GCM 인증 실패).
   > 이미 프로덕션에 다른 값이 들어가 있다면, 그 값 그대로 토큰을 주입하면 됩니다 — 6절 참고.
5. **Deploy** 클릭 → 잠시 후 `https://family-web-xxxx.vercel.app` 주소가 나와요.

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
2. 그 주소 접속 → 로그인 (`wlsdud022`/`wlsdud022` 또는 만든 계정)
3. 이제 **`git push` 하면 자동으로 재배포**됩니다.

---

## 6. 사이트 에이전트 토큰 (선택 — `AGENT_ENABLED=true` 일 때만)

에이전트의 두뇌는 ChatGPT(Codex) OAuth 토큰입니다. Vercel 은 파일을 쓸 수 없어서 토큰은 DB(`AgentAuth`)에 **암호화해서** 넣어 둡니다.

```bash
# 프로덕션 DB 에 주입 — AUTH_SECRET 은 Vercel 에 넣은 값 그대로여야 합니다
DATABASE_URL="<Neon Direct>" AUTH_SECRET="<Vercel 의 AUTH_SECRET>" npm run agent:auth -- <codex_auth.json 경로>
```

주입이 끝나면 화면에 `provider · account_id · 만료`만 찍힙니다(토큰 값은 찍지 않아요).
스크립트가 마지막에 원본 파일 삭제를 권하는데, **지우기 전에 아래 ⚠️ 2 를 먼저 읽어 주세요.**

### ⚠️ 1. `AUTH_SECRET` 은 로컬과 프로덕션이 같아야 합니다

암호화 키가 `AUTH_SECRET` 에서 파생되므로(`lib/agent/crypto.ts`), 로컬에서 넣은 토큰을 프로덕션에서 읽으려면 두 값이 같아야 합니다. 다르면 복호화가 실패하고 `저장된 토큰을 읽지 못했어요` 가 뜹니다.
**3절의 `openssl rand -base64 32` 안내를 그대로 따라 새 값을 만들면 에이전트 토큰이 죽습니다.** 길은 둘입니다.

- **(권장) 프로덕션 값 그대로 주입** — 위 명령의 `AUTH_SECRET` 에 Vercel 에 이미 넣은 값을 씁니다. 로그인 세션은 그대로 살아 있습니다.
- **프로덕션 `AUTH_SECRET` 을 로컬 값으로 교체** — 같은 값이 jose 세션 쿠키 서명에도 쓰이므로 **가족 전원이 다시 로그인**해야 합니다. 그 비용을 감수할 때만.

### ⚠️ 2. `KEY_DOMAIN` 을 바꾸면 기존 암호문을 못 읽습니다

`lib/agent/crypto.ts` 의 `KEY_DOMAIN`(`"agent-token-v1:"`)도 키 재료입니다. 이 문자열을 바꾸면 이미 저장된 토큰이 열리지 않아요. 되살리는 길은 둘입니다.

1. **재주입** — 원본 `codex_auth.json` 이 남아 있으면 `npm run agent:auth` 로 다시 넣습니다.
2. **재암호화 마이그레이션** — 원본이 없으면, 한 트랜잭션 안에서 *옛 키로 복호화 → 새 키로 재암호화*합니다.
   실행 **전**에 "옛 키로 복호화 성공 / 새 키로 실패"를, **후**에 "새 키로 복호화 성공 + 평문이 같음"을 확인하세요.

> 개발 중 실제로 2번 상황이 났습니다. 원본 토큰 파일이 임시 폴더에 있다가 세션과 함께 사라졌거든요.
> **원본 파일은 휘발성이라 믿으면 안 됩니다.** 1번이 언제나 가능하다고 가정하지 마세요.
> (일회용 참고 구현 `rekey.ts` 는 `.superpowers/sdd/` 아래 — gitignore 대상이라 저장소에는 없습니다.)

### ⚠️ 3. 로컬 Codex CLI 와 갱신이 충돌할 수 있습니다

같은 계정의 refresh_token 을 사이트와 로컬 Codex CLI 가 **각자** 갱신하면, 회전된 토큰 때문에 뒤늦은 쪽이 `invalid_grant` 를 받을 수 있습니다. 실제로 지금 `~/.codex/auth.json` 의 만료 시각과 DB `AgentAuth.expiresAt` 이 달라, 같은 계정에 access_token 이 둘 살아 있습니다. 충돌 조건은 이미 있는 셈이에요.

- 에이전트가 갑자기 토큰 오류를 내면 먼저 이걸 의심하세요. 회복은 `npm run agent:auth` 로 **새 토큰을 넣는 것**입니다 —
  `invalid_grant` 이 난 시점에는 예전 `codex_auth.json` 의 refresh_token 도 같이 죽어 있어서, 그 파일을 다시 넣어도 소용없어요.
  ⚠️ **새 `codex_auth.json` 을 받는 로그인 절차는 아직 저장소에 없습니다**(개발 세션에서 수동으로 했습니다).
  `~/.codex/auth.json` 은 모양이 달라서(`{ tokens: { access_token, refresh_token, account_id } }`) 그대로는 못 넣습니다 — `tokens` 안쪽을 꺼내 평평한 JSON 으로 만들어 주세요.
- 첫 갱신 예상 시점은 **2026-09-27**(만료 이틀 전부터 갱신). 그때 Vercel 로그에 `refresh: json ok` 또는 `refresh: form ok` 중 하나가 찍힙니다 — 어느 본문 형식이 맞는지는 아직 실측 전이라 둘 다 시도하게 해 두었고, 이 한 줄이 답을 알려 줍니다.

### ⚠️ 4. 테이블 2개를 먼저 만드세요

`AgentAuth`·`AgentRun` 은 **코드 배포 전에** `prisma db push` 로 프로덕션에 반영합니다(2절). 순서가 어긋나면 해당 기능이 500 을 냅니다 — 예전에 `/baby` 에서 한 번 겪었어요.

---

## 문제 해결

- **DB 연결 에러**: `DATABASE_URL`에 `?sslmode=require` 있는지 확인. Pooled면 `&pgbouncer=true`도.
- **`prisma db push` 실패**: Pooled 말고 **Direct** 문자열로 실행.
- **사진 업로드 실패**: Blob 스토리지 Connect 후 **Redeploy** 했는지 확인.
- **로그인 후 바로 튕김**: `AUTH_SECRET`이 설정됐는지 확인.
- **에이전트가 "저장된 토큰을 읽지 못했어요"**: 토큰을 넣을 때와 `AUTH_SECRET`(또는 `KEY_DOMAIN`)이 달라진 경우예요 → 6절.
- **에이전트가 "토큰 갱신에 실패했어요 (HTTP 4xx · invalid_grant)"**: refresh_token 이 다른 곳에서 회전됐어요 → `npm run agent:auth` 로 재주입 (6절 ⚠️ 3).

## 다음 단계 (선택)
- **구글 로그인/캘린더 연동**: 배포된 `vercel.app` 주소로 redirect URI 등록 → [REQUIREMENTS.md](REQUIREMENTS.md) "구글 로그인" 절
- **예쁜 주소**: Vercel 프로젝트 → Settings → Domains 에서 커스텀 도메인 연결
