# 🏡 포동 (Podong) — 우리 가족 공간

사진, 계획, 캘린더, 할일을 함께 나누는 우리 가족만의 웹사이트.
경쾌한 파스텔 디자인, 심플하고 다정하게.

## 기능

- **홈** — 오늘 할일·다가오는 일정·기념일·최근 사진·게시판·장보기를 한눈에
- **사진첩** — 테마별 앨범(예: 발리 여행)으로 추억을 화보처럼
- **계획** — 여행·주말 일정을 날짜별 타임라인으로
- **캘린더** — 가족 일정 월간 달력 (구글 캘린더 연동 밑작업)
- **할일** — 그날그날 TODO, 담당·마감·알림 (구글 캘린더 저장 밑작업)
- **기념일** — 생일·기념일 D-day
- **게시판** — 냉장고 포스트잇 같은 가족 한마디
- **장보기** — 함께 채우는 공유 장바구니
- **로그인** — 아이디/비밀번호로 접속(전 페이지 보호). 계정은 DB에서 관리
- **꾸미기** — 사진을 페이지·게시글·계획 아무 곳에나 붙이고 크기·회전·앞뒤 조절(스티커)
- **마크다운 글쓰기** — 게시글·계획 메모를 제목·굵게·목록·체크박스·인용·사진으로 (옵시디언식 에디터)

## 스택

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Prisma 6 · PostgreSQL · Pretendard + Fredoka

## 처음 설치하기 (클론 후)

### 미리 필요한 것
- **Node.js 20 이상** (`node -v`)
- **PostgreSQL 14 이상** — 로컬 설치 또는 [Neon](https://neon.tech) 등 호스팅 DB
- **Git**

> macOS(Homebrew)에서 Postgres 설치·실행 예:
> `brew install postgresql@16 && brew services start postgresql@16`

### 단계

```bash
# 1) 클론 & 의존성 설치
git clone https://github.com/sacross93/family-web.git
cd family-web
npm install

# 2) 데이터베이스 생성 (예: podong)
createdb podong          # 또는:  psql -c "CREATE DATABASE podong;"

# 3) 환경 변수 설정
cp .env.example .env
#  .env 를 열어 아래 두 개를 채우세요:
#   - DATABASE_URL  : 내 Postgres 접속 문자열 (예: postgresql://postgres:postgres@localhost:5432/podong?schema=public)
#   - AUTH_SECRET   : 아래 명령으로 생성해 붙여넣기
openssl rand -base64 32

# 4) 스키마 생성 + 샘플 데이터(+ 로그인 계정)
npm run db:push
npm run db:seed

# 5) 실행
npm run dev        # → http://localhost:3000
npm run dev:lan    # 같은 네트워크의 다른 기기에서도 접속 (0.0.0.0)
```

### 로그인
샘플 계정: 아이디 **`wlsdud022`** / 비밀번호 **`wlsdud022`** (관리자).
- 다른 계정 추가: `npm run user:add -- 아이디 비번 이름 [--admin]`
- 계정 관리·보안·모든 IP 접속·배포·구글 연동은 **[REQUIREMENTS.md](REQUIREMENTS.md)** 참고.

> ⚠️ `.env` 는 비밀 정보라 git 에 올라가지 않습니다. 클론한 사람은 각자 `.env` 를 새로 만들어야 해요.

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` / `npm start` | 프로덕션 빌드/실행 |
| `npm run db:push` | Prisma 스키마를 DB에 반영 |
| `npm run db:seed` | 샘플 데이터 시드 |
| `npm run db:reset` | DB 초기화 후 재시드 |
| `npm run db:studio` | DB를 GUI로 보기 |
| `npm run dev:lan` / `start:lan` | 모든 IP(0.0.0.0)에서 접속 허용 |
| `npm run user:add -- 아이디 비번 이름 [--admin]` | 로그인 계정 추가 |

## 문서

- **[DESIGN.md](DESIGN.md)** — 디자인 시스템 & 일관성 가이드 (새 화면 만들 때 필독)
- **[REQUIREMENTS.md](REQUIREMENTS.md)** — 구글 로그인·캘린더·알림·배포를 켜기 위한 준비물

## 폴더 구조

```
app/                 # 페이지 & API 라우트 (App Router)
  <기능>/page.tsx        # 서버 컴포넌트 (prisma로 읽기)
  <기능>/<기능>-client.tsx # 클라이언트 (상호작용)
  api/<자원>/route.ts     # REST API (GET/POST/PATCH/DELETE)
components/ui/       # 공용 디자인 컴포넌트 (Button, Card, Modal ...)
components/app-shell.tsx # 사이드바/모바일 네비
lib/                 # colors, date, types, prisma, nav, google-calendar, notifications, auth
prisma/              # schema.prisma, seed.ts
public/samples/      # 오프라인 파스텔 샘플 이미지
public/uploads/      # 업로드된 사진 (git 제외)
```
