# 포동 · 밑작업 & 준비물 (REQUIREMENTS)

지금 앱은 **로컬 PostgreSQL에 실제로 저장되며 바로 사용 가능한 상태**입니다.
아래는 "나중에 켜고 싶다"고 하신 기능들(구글 로그인·캘린더 연동·알림)과, 실제 가족이
여러 기기에서 함께 쓰려면 필요한 것들을 정리한 체크리스트예요. **급하지 않으면 안 하셔도
앱은 잘 돌아갑니다.** 필요할 때 이 문서대로 하나씩 켜면 됩니다.

---

## 🔐 로그인 & 접속 (지금 적용됨)

- **로그인 필수**: 모든 페이지가 로그인 뒤에 있어요. 로그인 안 하면 `/login`으로 보냅니다.
- **공유 계정**: 아이디 `wlsdud022` · 비밀번호 `wlsdud022` (DB에 bcrypt 해시로 저장, 관리자 권한).
- **회원가입 없음**: 계정은 아래처럼 직접 추가합니다.

### 각자 계정 추가하기 (2가지 방법)

**① 도우미 스크립트 (쉬움)**
```bash
npm run user:add -- 아이디 비밀번호 이름          # 일반 계정
npm run user:add -- 아이디 비밀번호 이름 --admin  # 관리자(꾸미기 가능)
# 예: npm run user:add -- appa 1234 아빠
```

**② DB에서 직접** — `npm run db:studio`로 `AppUser` 테이블 열기.
비밀번호는 반드시 **bcrypt 해시**로 넣어야 해요(평문 저장 금지). 해시 생성:
```bash
node -e "console.log(require('bcryptjs').hashSync(process.argv[1],10))" 내비밀번호
```

### 모든 IP에서 접속하게 하기
```bash
npm run dev:lan     # 또는 프로덕션: npm run build && npm run start:lan
```
같은 네트워크의 다른 기기에서 `http://<이 컴퓨터 IP>:3000` 으로 접속돼요.
(내 IP 확인: 터미널에 `ipconfig getifaddr en0`)

### ⚠️ 보안 주의 (공개 노출 시 꼭 읽기)
- 지금은 **HTTP**라 비밀번호가 암호화 없이 오갑니다. 집 밖(공용 인터넷)에 열 거라면
  **HTTPS**가 필요해요 → 가장 쉬운 길은 Vercel 등에 **배포**(자동 HTTPS)하는 것.
- 공유 비밀번호(`wlsdud022`)는 약해요. 실제로 열기 전에 **각자 강한 비밀번호**로 바꾸세요.
- 세션 비밀키(`AUTH_SECRET`)는 `.env`에 있고 git에 안 올라갑니다. 배포 시 새로 생성 권장.

---

## ✅ 지금 바로 되는 것 (설정 불필요)

- 사진첩 / 계획 / 캘린더 / 할일 / 기념일 / 게시판 / 장보기 — 전부 로컬 DB에 저장
- 사진 업로드 — 내 컴퓨터의 `public/uploads/` 폴더에 저장
- 브라우저가 열려 있는 동안의 로컬 알림 (같은 세션 한정)

## ⏳ 준비하면 켜지는 것

| 기능 | 필요한 준비 | 난이도 |
|---|---|---|
| 구글 로그인 | Google Cloud OAuth 자격증명 | 30분 |
| 구글 캘린더 자동 저장 | 위 + Calendar API 활성화 | +15분 |
| 앱을 닫아도 오는 알림 | 웹푸시(서비스워커) 또는 구글 캘린더 알림 이용 | 중간 |
| 가족이 여러 기기에서 공유 | 호스팅 DB + 배포 | 중간 |
| 사진을 클라우드에 안전 보관 | 오브젝트 스토리지(S3/R2 등) | 중간 |

---

## 1. 구글 로그인 + 캘린더 연동

> 목표: 가족이 구글 계정으로 로그인하고, 할일/일정을 각자의 **구글 캘린더**에 자동 저장·알림.

### 1-1. Google Cloud 준비 (직접 하셔야 하는 부분)

1. https://console.cloud.google.com 접속 → 새 프로젝트 생성 (예: "podong").
2. **API 및 서비스 → 라이브러리** → **Google Calendar API** 검색 후 **사용 설정**.
3. **OAuth 동의 화면** 구성:
   - User Type: **외부(External)**
   - 앱 이름 "포동", 지원 이메일 입력
   - **테스트 사용자**에 우리 가족 구글 이메일들을 추가 (게시 전이라 테스트 사용자만 로그인 가능)
   - 범위(Scopes)에 다음 추가:
     - `openid`, `email`, `profile`
     - `https://www.googleapis.com/auth/calendar.events` (캘린더 이벤트 읽기/쓰기)
4. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**:
   - 유형: **웹 애플리케이션**
   - 승인된 리디렉션 URI:
     - 개발: `http://localhost:3000/api/auth/callback/google`
     - 배포 시: `https://<도메인>/api/auth/callback/google`
   - 생성 후 **클라이언트 ID / 클라이언트 보안 비밀번호** 복사.

### 1-2. `.env` 채우기

프로젝트 루트 `.env` 파일(이미 생성돼 있음)에 붙여넣기:

```env
AUTH_SECRET="..."          # 터미널에서: npx auth secret  (자동 생성)
AUTH_GOOGLE_ID="복사한 클라이언트 ID"
AUTH_GOOGLE_SECRET="복사한 클라이언트 보안 비밀번호"
AUTH_URL="http://localhost:3000"   # 배포 시 실제 도메인으로
```

### 1-3. 코드에서 켜기 (개발자 작업 — 준비되면 알려주세요)

이미 밑작업이 되어 있습니다:
- `prisma/schema.prisma` — NextAuth용 `User/Account/Session` 모델 준비 완료
- `lib/auth.ts` — Auth.js(NextAuth) 설정 **스텁** (주석에 켜는 방법 포함)
- `lib/google-calendar.ts` — 캘린더 동기화 함수 스텁 (`syncTodoToGoogle`, `syncEventToGoogle`)

남은 구현:
1. `npm i next-auth@beta @auth/prisma-adapter googleapis`
2. `lib/auth.ts` 의 주석 처리된 설정을 활성화 (Google provider + Calendar scope + PrismaAdapter, access_token 저장).
3. `app/api/auth/[...nextauth]/route.ts` 생성 (handlers export).
4. `lib/google-calendar.ts` 의 `TODO(연동)` 부분을 `googleapis` 로 실제 구현.
5. 로그인한 구글 계정을 `FamilyMember` 와 연결(`FamilyMember.userId`).

> **`.env` 는 절대 git에 커밋되지 않습니다** (`.gitignore` 처리됨). 자격증명은 안전합니다.

---

## 2. 알림 (Reminders)

- **현재:** 브라우저 탭이 열려 있는 동안만 오는 로컬 알림 (`lib/notifications.ts`). 새로고침하면 사라짐.
- **앱을 닫아도 오게 하려면** 둘 중 하나:
  - **(A) 구글 캘린더 알림 이용 (추천, 쉬움):** 위 1번 연동 후, 할일/일정이 구글 캘린더에
    저장되면 구글이 알아서 폰·PC로 알림을 보냅니다. 별도 구현 거의 불필요.
  - **(B) 웹 푸시 직접 구현:** 서비스 워커(`public/sw.js`) + Web Push(VAPID 키) + 서버 스케줄러 필요.
    구현량이 많습니다. (A)를 먼저 권장.

---

## 3. 사진 저장

- **현재:** 업로드 사진은 내 컴퓨터 `public/uploads/` 에 저장 (개발/단일 기기용).
- **가족이 여러 기기에서 보고, 안전하게 보관하려면** 오브젝트 스토리지로 전환:
  - 추천: **Cloudflare R2**(저렴) 또는 **AWS S3**, **Supabase Storage**.
  - `app/api/upload/route.ts` 의 파일 저장 부분을 해당 SDK 업로드로 교체하고, 반환 URL만 DB에 저장.
- 배포 환경(Vercel 등)은 서버 파일시스템이 임시라 로컬 저장이 유지되지 않습니다 → 스토리지 필수.

---

## 4. 데이터베이스 (가족 공유를 위한 배포)

- **현재:** 로컬 PostgreSQL (`postgresql://ascentai@localhost:5432/podong`). 이 컴퓨터에서만.
- **가족이 함께 쓰려면** 호스팅 Postgres로 이전:
  1. **Neon**(https://neon.tech, 무료 티어) 또는 **Supabase**에서 Postgres 생성.
  2. 연결 문자열을 `.env` 의 `DATABASE_URL` 에 붙여넣기.
  3. `npm run db:push` (스키마 반영) → 필요하면 `npm run db:seed` (샘플). 실제 사용 시엔 시드 생략.

---

## 5. 배포 (선택)

- 추천: **Vercel** (Next.js 제작사, 무료 티어).
  1. GitHub 저장소에 push → Vercel에서 import.
  2. 환경변수(`DATABASE_URL`, `AUTH_*`) 등록.
  3. 사진은 4번의 오브젝트 스토리지로 전환 필요.
- 가족만 쓰게 하려면 로그인(1번)으로 접근 제한하거나, Vercel 비밀번호 보호를 사용.

---

## 실행 방법 요약

```bash
# 최초 1회 (이미 완료됨)
brew services start postgresql@16   # DB 켜기
npm install
npm run db:push                     # 스키마 반영
npm run db:seed                     # 샘플 데이터

# 매번 개발 시작
npm run dev                         # http://localhost:3000

# 기타
npm run db:studio                   # DB 내용 GUI로 보기
npm run db:reset                    # DB 초기화 + 샘플 재생성
npm run build && npm start          # 프로덕션 모드 확인
```

궁금하거나 특정 기능을 켜고 싶으시면 말씀해 주세요. 해당 부분만 마저 구현해 드릴게요! 💛
