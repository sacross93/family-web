# 포동(Podong) 디자인 시스템 · 일관성 가이드

우리 가족 공간 **포동**의 모든 화면은 이 문서를 따릅니다.
새 화면·기능을 만들 때 **여기 정의된 토큰과 컴포넌트만 사용**하세요.
새로운 색·간격·그림자를 즉흥적으로 만들지 않습니다. 일관성이 곧 완성도입니다.

> 컨셉 한 줄: **"우리 집 냉장고 문 / 코르크보드"** — 온 가족이 사진과 메모를 붙여두는
> 밝고 다정한 파스텔 보드. 심플·모던을 바탕으로, 포인트만 경쾌하게.

---

## 1. 디자인 원칙

1. **밝고 다정하게.** 오프화이트 배경 + 파스텔 포인트. 무겁거나 차갑지 않게.
2. **심플이 기본, 경쾌함은 포인트.** 여백을 넉넉히. 색은 '분류'에 쓰고, 화면당 강조는 하나만.
3. **둥글게.** 카드·버튼·입력창 모두 크게 둥근 모서리. 각진 요소 지양.
4. **색으로 분류한다.** 6가지 파스텔이 카테고리/앨범/일정 색이 됩니다. 의미 없이 색을 남발하지 않기.
5. **한 화면, 한 주인공.** 시그니처(테이프 붙은 사진·핀 꽂힌 메모)는 절제해서 한 곳에만.

---

## 2. 색상 (Color)

토큰의 실제 정의: [`app/globals.css`](app/globals.css) → 매핑: [`lib/colors.ts`](lib/colors.ts)

### 중립색

| 용도 | 토큰 / 클래스 | HEX |
|---|---|---|
| 앱 배경 (은은한 도트) | `bg-paper` | `#FBFAF7` |
| 카드·표면 | `bg-surface` | `#FFFFFF` |
| 가라앉은 영역 (아이콘 타일 등) | `bg-sunken` | `#F3F1EC` |
| 본문 텍스트 | `text-ink` | `#3A3A44` |
| 보조 텍스트 | `text-ink-soft` | `#6E6E7A` |
| 흐린 텍스트·플레이스홀더 | `text-ink-faint` | `#A6A6B2` |
| 실선 | `border-line` | `#ECE9E3` |
| 진한 실선 | `border-line-strong` | `#E0DCD4` |

### 브랜드 / 주요 액션

주요 버튼·링크·활성 상태는 **소프트 그레이프** 하나로 통일합니다.

`bg-primary` `#7A6CF0` · hover `bg-primary-hover` `#6A5CE8` · 소프트 `bg-primary-soft` · 글자 `text-primary-ink`

### 파스텔 카테고리 (6색)

앨범·일정·태그·구성원을 **색으로 구분**할 때 사용. 각 색은 3단으로 제공됩니다.

| 키 | soft (배경) | ink (글자) | dot (진한 점) |
|---|---|---|---|
| `lavender` 라벤더 | `bg-lavender-soft` | `text-lavender-ink` | `bg-lavender` |
| `peach` 피치 | `bg-peach-soft` | `text-peach-ink` | `bg-peach` |
| `mint` 민트 | `bg-mint-soft` | `text-mint-ink` | `bg-mint` |
| `sky` 스카이 | `bg-sky-soft` | `text-sky-ink` | `bg-sky` |
| `butter` 버터 | `bg-butter-soft` | `text-butter-ink` | `bg-butter` |
| `rose` 로즈 | `bg-rose-soft` | `text-rose-ink` | `bg-rose` |

**항상 `lib/colors.ts`의 `palette(key)` 헬퍼로 접근**하세요. 문자열로 클래스를 조합하지 않습니다
(`bg-${key}-soft` ❌ — Tailwind가 스캔 못 함). 상태색: `text-success`, `text-danger`, `bg-danger-soft`.

---

## 3. 타이포그래피 (Typography)

- **본문·UI: Pretendard** (`font-sans`, 기본). 깔끔한 한글.
- **디스플레이·숫자: Fredoka** (`font-display`). 큰 제목과 **숫자(날짜·D-day·개수)**에 경쾌함을.
  - 한글은 자동으로 Pretendard로 폴백됩니다 → 큰 제목에 `font-display`를 써도 안전.
  - 숫자만 강조하려면 `.font-num` 유틸.

| 역할 | 클래스 |
|---|---|
| 페이지 제목 | `font-display text-[28px] font-bold` (→ `PageHeader`가 처리) |
| 섹션 제목 | `text-base font-bold text-ink` (→ `CardTitle`) |
| 본문 | 기본 (`text-[15px]`~`text-base`) `text-ink` |
| 보조 설명 | `text-sm text-ink-soft` |
| 캡션·메타 | `text-xs text-ink-faint` |

기본 자간은 `-0.01em`(globals.css). 한글 가독성을 위해 굵기는 400/500/600/700을 주로 사용.

---

## 4. 간격 · 모서리 · 그림자

- **간격**: Tailwind 4배수(4px) 스케일. 카드 내부 패딩 `p-5`, 섹션 간 `gap-4`~`gap-6`, 페이지 상단 `py-6 lg:py-10`.
- **모서리**: 태그/버튼 = `rounded-full`. 입력창 = `rounded-2xl`. 카드 = `rounded-3xl`. 작은 타일 = `rounded-xl`.
- **그림자**: `shadow-sm`(기본 카드) · `shadow-md`(강조) · `shadow-lg`(모달/드로어) · `shadow-pop`(호버 부양). 새 그림자 만들지 않기.
- **호버 상호작용**: 클릭 가능한 카드는 `hover:-translate-y-1 hover:shadow-pop` (→ `Card interactive`).

---

## 5. 컴포넌트 (Component)

모든 화면은 아래 공용 컴포넌트로 조립합니다. **import는 배럴에서**:

```tsx
import {
  Button, Card, CardTitle, Tag, ColorDot, PageHeader, EmptyState,
  Field, Label, Input, Textarea, Select, Checkbox, ColorPicker,
  Avatar, IconButton, Modal, Spinner, LoadingBlock, Segmented,
} from "@/components/ui";
```

| 컴포넌트 | 용도 | 핵심 props |
|---|---|---|
| `Button` | 액션 | `variant`: primary·soft·ghost·outline·danger / `size`: sm·md·lg / `href`(링크) |
| `IconButton` | 아이콘 전용 버튼 | `variant`: ghost·soft·danger·surface / `size`: sm·md |
| `Card` | 콘텐츠 카드 | `interactive`(호버 부양) / `flush`(패딩 제거) |
| `CardTitle` | 카드/섹션 제목 | — |
| `Tag` | 색상 태그·뱃지 | `color`(팔레트 키) / `dot` |
| `ColorDot` | 색 점 | `color` |
| `PageHeader` | 페이지 상단 (이모지+제목+설명+액션) | `emoji` `title` `description` / children=우측 액션 |
| `EmptyState` | 빈 상태 | `emoji` `title` `description` `action` |
| `Field`/`Label`/`Input`/`Textarea`/`Select` | 폼 | 표준 input 속성 |
| `Checkbox` | 원형 체크 | `checked` `onChange` `color` |
| `ColorPicker` | 파스텔 색 선택 | `value` `onChange` |
| `Avatar` | 구성원 아바타 | `emoji` `color` `name` `size` |
| `Modal` | 다이얼로그 | `open` `onClose` `title` `emoji` `footer` `size` |
| `Segmented` | 뷰/필터 전환 | `value` `options` `onChange` |
| `Spinner`/`LoadingBlock` | 로딩 | — |

아이콘은 **`lucide-react`** (UI 크롬용, 얇고 심플) + **이모지**(카테고리·감정 표현). 혼용 규칙:
lucide는 기능 아이콘(닫기·추가·수정·삭제), 이모지는 콘텐츠 성격(🌴 여행, 🎂 생일).

---

## 6. 레이아웃 패턴

- **앱 셸** (`components/app-shell.tsx`)
  - 데스크톱: 좌측 사이드바 264px.
  - 폰: **상단바 + 하단 탭바**. 상단바는 지금 페이지의 이모지·제목을 말하고(브랜드는 홈에서만),
    메뉴는 아래 탭바에 있다 — 엄지가 닿는 자리다. 탭은 `getNav()` 앞 `TAB_COUNT`개 + `더보기`,
    `더보기`가 전체 메뉴 드로어를 연다. **탭 목록을 따로 만들지 않는다**(`lib/nav.ts` 한 곳).
- **아래쪽 가장자리**: `--bottom-bar`(globals.css) 한 곳에서 온다. 탭바 높이 + iOS 안전영역.
  떠 있는 버튼과 본문 아래 여백이 **모두 이 값을 읽는다**. 페이지에서 `pb-*`를 손으로 맞추지 않는다.
- **떠 있는 버튼은 하나**(`물어보기`). 둘이 되면 목록 한가운데를 가린다 —
  관리자용 `꾸미기`는 상단바·사이드바 안으로 들어가 있다.
- **콘텐츠 폭**: `max-w-6xl` 중앙 정렬. 페이지는 항상 `PageHeader`로 시작.
  상단바가 이미 제목을 띄운 페이지에서는 `PageHeader`가 폰에서 제목을 접고 액션만 남긴다
  (`components/shell-context.tsx`의 `titleInTopBar`). 같은 제목을 위아래로 두 번 쓰지 않는다.
- **그리드**: 카드 목록은 `grid gap-4 sm:grid-cols-2 lg:grid-cols-3` 류. 모바일 1열 필수.
- **추가 액션**: 페이지 우상단 `Button`(primary, `+ 항목 추가`). 목록 비면 `EmptyState`의 `action`.

---

## 7. 데이터 · 상호작용 패턴 (개발 규칙)

일관된 구조로 병렬 작업이 안전하도록 아래 패턴을 **반드시** 따릅니다.

```
app/<feature>/page.tsx            # 서버 컴포넌트: prisma로 초기 데이터 read → 클라이언트에 전달
app/<feature>/<feature>-client.tsx# "use client": 상태 보유(초기값=서버 props), UI + 상호작용
app/api/<feature>/route.ts        # GET(목록) · POST(생성)
app/api/<feature>/[id]/route.ts   # PATCH(수정) · DELETE(삭제)
```

- **읽기**: 서버 컴포넌트에서 `import { prisma } from "@/lib/prisma"` 직접 사용.
- **쓰기**: 클라이언트가 `fetch("/api/...")` 호출. 낙관적으로 로컬 상태를 먼저 갱신하고,
  실패 시 되돌립니다(간단히는 성공 후 `router.refresh()`도 가능).
- **응답**: API는 `NextResponse.json(data)` 반환. 날짜는 ISO 문자열로 직렬화됨 →
  클라이언트에서 `new Date()`로 파싱.
- **색상 필드**는 팔레트 키 문자열(`"mint"` 등)로 저장/전달.

날짜 표기는 `lib/date.ts` 헬퍼 사용: `kDate`, `kDateShort`, `kTime`, `dday`, `ageFrom` 등.

---

## 8. 보이스 & 톤 (Voice & Tone)

가족에게 말하듯 **따뜻하고 담백하게**. 사용자가 조작하는 것을 그 이름으로 부릅니다.

- 버튼은 결과를 말한다: "저장" → 토스트도 "저장했어요". "제출"❌ "저장"⭕
- 빈 화면은 초대다: "아직 사진이 없어요. 첫 추억을 올려볼까요? 📸"
- 오류는 사과하지 않고 방법을 알려준다: "사진을 못 올렸어요. 잠시 후 다시 시도해 주세요."
- 문장은 짧게, 존댓말, 이모지는 양념처럼 한두 개.
- 라벨 예시: `+ 앨범 만들기`, `+ 할일 추가`, `오늘 할일`, `다가오는 일정`, `D-3`.

---

## 9. 접근성 (Accessibility) — 품질 하한선

- 모든 인터랙티브 요소에 보이는 **포커스 링**(globals.css 기본 제공).
- 아이콘 전용 버튼엔 `aria-label`.
- 색만으로 정보 전달 금지 — 색 + 텍스트/아이콘 병행(태그엔 라벨 필수).
- 본문 대비 확보(`text-ink` on `surface`). 모바일 탭 타깃 ≥ 40px(h-10/h-11).
- `prefers-reduced-motion` 존중(globals.css에서 애니메이션 억제).

---

## 10. Do / Don't

✅ **Do**
- 공용 컴포넌트와 팔레트 토큰만 사용
- 색은 분류에, 강조는 화면당 하나
- 넉넉한 여백, 크게 둥근 모서리
- 빈 상태·로딩·에러를 항상 다정하게 처리

🚫 **Don't**
- 임의의 HEX/그림자/폰트 추가
- `bg-${key}-soft`처럼 동적 클래스 조합 (Tailwind가 못 잡음)
- 한 화면에 강조색 여러 개로 소란스럽게
- 각진 박스, 딱딱한 회색 UI, 번역투 문구
