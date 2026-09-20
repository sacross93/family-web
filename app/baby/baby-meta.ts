import type { PaletteKey } from "@/lib/colors";

export type EntryKind = "diary" | "checkup" | "letter";
export const ENTRY_KINDS: EntryKind[] = ["diary", "checkup", "letter"];

export const KIND_META: Record<
  EntryKind,
  { label: string; emoji: string; color: PaletteKey; placeholder: string }
> = {
  diary: {
    label: "일상",
    emoji: "📝",
    color: "mint",
    // 교환일기다 — **둘 다 쓴다.** "남편은 무엇을 해줬나요?" 라고 물으면
    // 남편이 자기 이름으로 쓸 때 말이 어긋난다. 누가 열어도 맞는 말로 둔다.
    placeholder: "오늘 어땠어요? 몸 상태도, 떠오른 생각도 좋아요.",
  },
  checkup: {
    label: "검진",
    emoji: "🩺",
    color: "sky",
    placeholder: "병원에서 들은 이야기, 초음파 사진을 남겨요",
  },
  letter: {
    label: "편지",
    emoji: "💌",
    color: "rose",
    placeholder: "아기에게 한마디 💌",
  },
};

export function kindMeta(kind: string) {
  return KIND_META[kind as EntryKind] ?? KIND_META.diary;
}

/** 일상 기록의 컨디션 이모지 후보 */
export const MOODS = ["😊", "🙂", "😐", "😪", "🤢", "😢", "🤯", "🥰"];

/** 체크리스트 '기본 항목 넣기' — 일반적·비의료 문구만 (모두 편집·삭제 가능) */
export const DEFAULT_CHECKLIST = [
  "산모수첩 챙기기",
  "다닐 병원 정하기",
  "태명 정하기 🌱",
  "가족에게 알리기",
  "출산 준비물 목록 만들기",
  "아기 이름 후보 적어보기",
];

/** 마지막으로 고른 작성자 기억 (localStorage) */
export const AUTHOR_STORAGE_KEY = "podong_baby_author";
