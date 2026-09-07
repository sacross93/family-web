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

   ```bash
   openssl rand -base64 32   # 나온 값을 AUTH_SECRET 에 붙여넣기
   ```
   > DATABASE_URL 예: `postgresql://...-pooler.../neondb?sslmode=require&pgbouncer=true`
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

## 문제 해결

- **DB 연결 에러**: `DATABASE_URL`에 `?sslmode=require` 있는지 확인. Pooled면 `&pgbouncer=true`도.
- **`prisma db push` 실패**: Pooled 말고 **Direct** 문자열로 실행.
- **사진 업로드 실패**: Blob 스토리지 Connect 후 **Redeploy** 했는지 확인.
- **로그인 후 바로 튕김**: `AUTH_SECRET`이 설정됐는지 확인.

## 다음 단계 (선택)
- **구글 로그인/캘린더 연동**: 배포된 `vercel.app` 주소로 redirect URI 등록 → [REQUIREMENTS.md](REQUIREMENTS.md) "구글 로그인" 절
- **예쁜 주소**: Vercel 프로젝트 → Settings → Domains 에서 커스텀 도메인 연결
