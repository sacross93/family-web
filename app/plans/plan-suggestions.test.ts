import { describe, it, expect } from "vitest";
import { suggestionsFor, prepTitle, wantsTzNudge, FIRST_SUGGESTIONS } from "./plan-suggestions";

describe("계획 종류에 맞는 추천", () => {
  it("주말 계획에는 여행용 항목이 안 뜬다", () => {
    const prep = suggestionsFor("주말", "prep");
    const packing = suggestionsFor("주말", "packing");
    for (const t of ["항공권 예약", "숙소 예약", "여행자보험 가입", "환전 / 트래블카드", "유심 / 로밍", "렌터카 예약", "온라인 체크인"]) {
      expect(prep, t).not.toContain(t);
    }
    for (const t of ["여권 / 신분증", "멀티 어댑터"]) {
      expect(packing, t).not.toContain(t);
    }
    // 여행과 상관없는 것은 남는다 — 목록이 통째로 비면 추천이 없는 것과 같다.
    expect(prep).toContain("맛집 / 장소 찾기");
    expect(packing).toContain("보조배터리");
  });

  it("여행 계획은 예전 목록을 그대로(순서까지) 받는다", () => {
    expect(suggestionsFor("여행", "prep")).toEqual([
      "항공권 예약", "숙소 예약", "여행자보험 가입", "환전 / 트래블카드", "유심 / 로밍",
      "렌터카 예약", "온라인 체크인", "맛집 / 장소 찾기", "반려동물 맡기기", "택배 / 우편물 정지",
    ]);
    const packing = suggestionsFor("여행", "packing");
    expect(packing).toHaveLength(14);
    expect(packing[0]).toBe("여권 / 신분증");
    expect(packing).toContain("멀티 어댑터");
  });

  it("이벤트·기타도 여행이 아니다", () => {
    expect(suggestionsFor("이벤트", "prep")).not.toContain("항공권 예약");
    expect(suggestionsFor("기타", "packing")).not.toContain("여권 / 신분증");
  });
});

describe("준비 칸 제목과 시차 안내", () => {
  it("여행이면 '여행 전 준비', 아니면 '미리 할 일'", () => {
    expect(prepTitle("여행")).toBe("여행 전 준비");
    expect(prepTitle("주말")).toBe("미리 할 일");
  });

  it("시차 안내는 시차가 없는 여행에만", () => {
    expect(wantsTzNudge({ type: "여행", tzOffsetMin: 0 })).toBe(true);
    expect(wantsTzNudge({ type: "주말", tzOffsetMin: 0 })).toBe(false);
    expect(wantsTzNudge({ type: "여행", tzOffsetMin: -60 })).toBe(false);
  });

  it("처음 펼치는 추천은 몇 개뿐이다 — 여행 준비물 전부보다 적다", () => {
    expect(FIRST_SUGGESTIONS).toBeGreaterThan(0);
    expect(FIRST_SUGGESTIONS).toBeLessThan(suggestionsFor("여행", "packing").length);
  });
});
