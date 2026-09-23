// 계획 준비 체크리스트의 추천 항목 — **계획 종류에 맞춰** 고른다.
//
// 예전엔 모든 계획이 같은 목록을 받아서 "이번 주말 계획" 에도 항공권 예약·환전·유심·
// 여권이 떴다(2026-09-23 리뷰). 여행에서만 뜻이 있는 항목은 `travelOnly` 로 표시해 두고
// 여행일 때만 낸다. 여행 계획이 받는 목록과 순서는 예전과 같다.

export type ChecklistKind = "prep" | "packing";

interface Suggestion {
  text: string;
  travelOnly?: boolean;
}

const PREP: Suggestion[] = [
  { text: "항공권 예약", travelOnly: true },
  { text: "숙소 예약", travelOnly: true },
  { text: "여행자보험 가입", travelOnly: true },
  { text: "환전 / 트래블카드", travelOnly: true },
  { text: "유심 / 로밍", travelOnly: true },
  { text: "렌터카 예약", travelOnly: true },
  { text: "온라인 체크인", travelOnly: true },
  { text: "맛집 / 장소 찾기" },
  { text: "반려동물 맡기기" },
  { text: "택배 / 우편물 정지" },
];

const PACKING: Suggestion[] = [
  { text: "여권 / 신분증", travelOnly: true },
  { text: "지갑 / 카드" },
  { text: "현금" },
  { text: "휴대폰 충전기" },
  { text: "보조배터리" },
  { text: "멀티 어댑터", travelOnly: true },
  { text: "세면도구" },
  { text: "상비약" },
  { text: "선크림" },
  { text: "옷 / 속옷" },
  { text: "우산 / 우비" },
  { text: "카메라" },
  { text: "이어폰" },
  { text: "물티슈 / 마스크" },
];

const isTravel = (type: string) => type === "여행";

/** 이 계획 종류에 맞는 추천 항목(순서 유지). */
export function suggestionsFor(type: string, kind: ChecklistKind): string[] {
  const list = kind === "prep" ? PREP : PACKING;
  return list.filter((s) => isTravel(type) || !s.travelOnly).map((s) => s.text);
}

/** 준비 칸의 제목. 여행이 아니면 "여행 전" 이 맞지 않는다. */
export function prepTitle(type: string): string {
  return isTravel(type) ? "여행 전 준비" : "미리 할 일";
}

/**
 * "해외 여행인가요? 시차를 설정…" 안내를 띄울지.
 * 여행이 아닌 계획에는 띄우지 않는다. 시차가 이미 있으면 히어로가 "현지 시차" 를 말하므로
 * 안내도 필요 없다. (시차 설정은 `…` 메뉴에 늘 있다 — 어느 계획이든 바꿀 수 있다.)
 */
export function wantsTzNudge(plan: { type: string; tzOffsetMin: number }): boolean {
  return isTravel(plan.type) && plan.tzOffsetMin === 0;
}

/**
 * 목록이 비었을 때 먼저 펼쳐 두는 추천 수. 나머지는 "추천 N개 더 보기" 뒤로 간다.
 * 스물네 개가 한꺼번에 펼쳐져 있으면 정작 여정(일정 목록)이 화면 몇 장 아래로 밀렸다.
 */
export const FIRST_SUGGESTIONS = 6;
