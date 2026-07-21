// 파스텔 팔레트 매핑 — 색상 '키'를 Tailwind 클래스로.
// ⚠️ Tailwind v4 는 소스에서 '완전한 클래스 문자열'만 스캔합니다.
//    따라서 `bg-${key}-soft` 같은 동적 조합 금지 → 아래처럼 전부 리터럴로.

export type PaletteKey =
  | "lavender"
  | "peach"
  | "mint"
  | "sky"
  | "butter"
  | "rose";

export interface PaletteEntry {
  label: string;
  /** 소프트 배경 + 잉크 글자 (태그/뱃지 기본) */
  chip: string;
  soft: string; // 소프트 배경만
  ink: string; // 잉크 글자만
  dot: string; // 진한 점 색 (배경)
  border: string;
  ring: string;
  /** 좌측 강조 바 등 */
  accentBar: string;
  /** 부드러운 카드 헤더용 그라디언트 */
  gradient: string;
}

export const PALETTE: Record<PaletteKey, PaletteEntry> = {
  lavender: {
    label: "라벤더",
    chip: "bg-lavender-soft text-lavender-ink",
    soft: "bg-lavender-soft",
    ink: "text-lavender-ink",
    dot: "bg-lavender",
    border: "border-lavender",
    ring: "ring-lavender",
    accentBar: "bg-lavender",
    gradient: "from-lavender-soft to-lavender/40",
  },
  peach: {
    label: "피치",
    chip: "bg-peach-soft text-peach-ink",
    soft: "bg-peach-soft",
    ink: "text-peach-ink",
    dot: "bg-peach",
    border: "border-peach",
    ring: "ring-peach",
    accentBar: "bg-peach",
    gradient: "from-peach-soft to-peach/40",
  },
  mint: {
    label: "민트",
    chip: "bg-mint-soft text-mint-ink",
    soft: "bg-mint-soft",
    ink: "text-mint-ink",
    dot: "bg-mint",
    border: "border-mint",
    ring: "ring-mint",
    accentBar: "bg-mint",
    gradient: "from-mint-soft to-mint/40",
  },
  sky: {
    label: "스카이",
    chip: "bg-sky-soft text-sky-ink",
    soft: "bg-sky-soft",
    ink: "text-sky-ink",
    dot: "bg-sky",
    border: "border-sky",
    ring: "ring-sky",
    accentBar: "bg-sky",
    gradient: "from-sky-soft to-sky/40",
  },
  butter: {
    label: "버터",
    chip: "bg-butter-soft text-butter-ink",
    soft: "bg-butter-soft",
    ink: "text-butter-ink",
    dot: "bg-butter",
    border: "border-butter",
    ring: "ring-butter",
    accentBar: "bg-butter",
    gradient: "from-butter-soft to-butter/40",
  },
  rose: {
    label: "로즈",
    chip: "bg-rose-soft text-rose-ink",
    soft: "bg-rose-soft",
    ink: "text-rose-ink",
    dot: "bg-rose",
    border: "border-rose",
    ring: "ring-rose",
    accentBar: "bg-rose",
    gradient: "from-rose-soft to-rose/40",
  },
};

export const PALETTE_KEYS = Object.keys(PALETTE) as PaletteKey[];

/** 안전 접근: 알 수 없는 키는 lavender 로 폴백 */
export function palette(key?: string | null): PaletteEntry {
  if (key && key in PALETTE) return PALETTE[key as PaletteKey];
  return PALETTE.lavender;
}
