import { describe, it, expect } from "vitest";
import type { JourneyMark, MarkKind } from "@/lib/journey-core";
import { upcomingMarks, interleaveMarks, marksSpeech, type TimelineRow } from "./journey-marks";

const mk = (date: string, kind: MarkKind, label: string = kind): JourneyMark => ({ date, kind, label });

// 준비 단계 한 주기: 지난 생리 · 가임기(10/13~19, 배란 10/18) · 생리 예정 11/01~04 · 병원 10/25
const marks: JourneyMark[] = [
  mk("2026-10-04", "period"),
  mk("2026-10-05", "period"),
  mk("2026-11-01", "periodPredicted"),
  mk("2026-11-02", "periodPredicted"),
  mk("2026-11-03", "periodPredicted"),
  mk("2026-11-04", "periodPredicted"),
  ...["13", "14", "15", "16", "17", "19"].map((d) => mk(`2026-10-${d}`, "fertile")),
  mk("2026-10-18", "ovulation"),
  mk("2026-10-25", "hospital", "병원 · 초음파"),
];

describe("upcomingMarks — 폰 목록에 끼울 하루짜리 표시", () => {
  it("오늘부터 병원·배란·생리 예정 첫날만, 날짜순", () => {
    expect(upcomingMarks(marks, "2026-10-16").map((m) => `${m.date} ${m.kind}`)).toEqual([
      "2026-10-18 ovulation",
      "2026-10-25 hospital",
      "2026-11-01 periodPredicted",
    ]);
  });

  it("가임기·지난 생리는 날마다 줄이 생기므로 넣지 않는다", () => {
    const kinds = upcomingMarks(marks, "2026-10-01").map((m) => m.kind);
    expect(kinds).not.toContain("fertile");
    expect(kinds).not.toContain("period");
  });

  it("예정 첫날이 오늘이면 오늘 줄이 된다(그 뒤 날은 안 붙는다)", () => {
    const out = upcomingMarks(marks, "2026-11-01");
    expect(out).toEqual([mk("2026-11-01", "periodPredicted")]);
  });

  it("출산 예정일은 들어간다", () => {
    expect(upcomingMarks([mk("2027-05-01", "due")], "2026-10-16")).toHaveLength(1);
  });

  it("until 이 있으면 그날까지만(그날 포함)", () => {
    expect(upcomingMarks(marks, "2026-10-16", "2026-10-25").map((m) => m.date)).toEqual([
      "2026-10-18",
      "2026-10-25",
    ]);
  });

  it("날짜순이 아닌 입력도 날짜순으로 낸다", () => {
    const shuffled = [mk("2026-12-01", "hospital"), mk("2027-05-01", "due"), mk("2026-10-20", "hospital")];
    expect(upcomingMarks(shuffled, "2026-10-16").map((m) => m.date)).toEqual([
      "2026-10-20",
      "2026-12-01",
      "2027-05-01",
    ]);
  });
});

describe("interleaveMarks — 일정 사이에 날짜순으로", () => {
  type Ev = { id: string; day: string };
  const ev = (id: string, day: string): Ev => ({ id, day });
  const dayOf = (e: Ev) => e.day;
  const show = (rows: TimelineRow<Ev>[]) =>
    rows.map((r) => (r.type === "mark" ? `M${r.mark.date.slice(5)}` : `E${r.item.id}`));

  it("같은 날이면 표시가 먼저, 남은 표시는 끝에", () => {
    const items = [ev("a", "2026-10-17"), ev("b", "2026-10-25"), ev("c", "2026-10-30")];
    const ms = upcomingMarks(marks, "2026-10-16");
    expect(show(interleaveMarks(items, dayOf, ms))).toEqual(["Ea", "M10-18", "M10-25", "Eb", "Ec", "M11-01"]);
  });

  it("일정이 없으면 표시만", () => {
    expect(show(interleaveMarks([], dayOf, [mk("2026-10-25", "hospital")]))).toEqual(["M10-25"]);
  });

  it("둘 다 없으면 빈 목록 — 빈 화면이 뜨는 조건", () => {
    expect(interleaveMarks([], dayOf, [])).toEqual([]);
  });
});

describe("marksSpeech — 칸 이름에 붙일 글", () => {
  it("없으면 빈 글, 있으면 쉼표로 이어 붙인다(같은 글은 한 번)", () => {
    expect(marksSpeech([])).toBe("");
    expect(marksSpeech([mk("2026-10-18", "ovulation", "배란 예정 (추정)"), mk("2026-10-18", "hospital", "병원 · 진료")])).toBe(
      ", 배란 예정 (추정), 병원 · 진료"
    );
    expect(marksSpeech([mk("2026-10-25", "hospital", "병원 · 진료"), mk("2026-10-25", "hospital", "병원 · 진료")])).toBe(
      ", 병원 · 진료"
    );
  });
});
