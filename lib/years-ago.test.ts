import { describe, it, expect } from "vitest";
import {
  matchYearsAgo,
  pickYearsAgo,
  yearsAgoTitle,
  yearsAgoWindow,
  yearsAgoWindows,
} from "@/lib/years-ago";

const day = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h);
const TODAY = day(2026, 10, 27);

describe("matchYearsAgo", () => {
  it("지난해의 같은 월·일은 「오늘」", () => {
    expect(matchYearsAgo(day(2019, 10, 27), TODAY)).toEqual({ yearsAgo: 7, exact: true });
    expect(matchYearsAgo(day(2025, 10, 27), TODAY)).toEqual({ yearsAgo: 1, exact: true });
  });

  it("앨범 날짜처럼 그날 오전 9시(UTC 자정)여도 같은 날이다", () => {
    expect(matchYearsAgo(day(2020, 10, 27, 9), TODAY)).toEqual({ yearsAgo: 6, exact: true });
  });

  it("올해의 오늘·며칠 전은 아니다", () => {
    expect(matchYearsAgo(day(2026, 10, 27), TODAY)).toBeNull();
    expect(matchYearsAgo(day(2026, 10, 25), TODAY)).toBeNull();
  });

  it("앞뒤 3일은 「이맘때」, 4일은 아니다", () => {
    expect(matchYearsAgo(day(2024, 10, 24), TODAY)).toEqual({ yearsAgo: 2, exact: false });
    expect(matchYearsAgo(day(2024, 10, 30, 23), TODAY)).toEqual({ yearsAgo: 2, exact: false });
    expect(matchYearsAgo(day(2024, 10, 23, 23), TODAY)).toBeNull();
    expect(matchYearsAgo(day(2024, 10, 31), TODAY)).toBeNull();
  });

  it("연초의 「이맘때」 는 지난해 연말까지 걸친다", () => {
    const jan2 = day(2027, 1, 2);
    expect(matchYearsAgo(day(2025, 12, 31), jan2)).toEqual({ yearsAgo: 1, exact: false });
    expect(matchYearsAgo(day(2025, 12, 30), jan2)).toEqual({ yearsAgo: 1, exact: false });
    expect(matchYearsAgo(day(2025, 12, 29), jan2)).toBeNull();
    // 사흘 전(올해 직전 연말)은 1년 전이 아니다.
    expect(matchYearsAgo(day(2026, 12, 31), jan2)).toBeNull();
  });

  it("연말의 「이맘때」 는 이듬해 연초까지 걸친다", () => {
    const dec30 = day(2026, 12, 30);
    expect(matchYearsAgo(day(2025, 1, 1), dec30)).toEqual({ yearsAgo: 2, exact: false });
    expect(matchYearsAgo(day(2026, 1, 2), dec30)).toEqual({ yearsAgo: 1, exact: false });
  });

  it("2월 29일 — 윤년끼리는 「오늘」, 평년에는 「이맘때」", () => {
    const leapDay = day(2028, 2, 29);
    expect(matchYearsAgo(day(2024, 2, 29), leapDay)).toEqual({ yearsAgo: 4, exact: true });
    // 2027년(평년)의 2월 29일 = 3월 1일 가운데 창
    expect(matchYearsAgo(day(2027, 2, 28), leapDay)).toEqual({ yearsAgo: 1, exact: false });
    expect(matchYearsAgo(day(2027, 3, 4), leapDay)).toEqual({ yearsAgo: 1, exact: false });
    // 평년의 2월 28일에 윤년 2월 29일 사진은 「이맘때」
    expect(matchYearsAgo(day(2024, 2, 29), day(2027, 2, 28))).toEqual({ yearsAgo: 3, exact: false });
  });
});

describe("yearsAgoWindows", () => {
  it("가까운 해부터, 가장 오래된 해 한 해 앞까지", () => {
    const ws = yearsAgoWindows(TODAY, 2023);
    expect(ws.map((w) => w.yearsAgo)).toEqual([1, 2, 3, 4]);
    expect(ws[0].start).toEqual(day(2025, 10, 24));
    expect(ws[0].end).toEqual(day(2025, 10, 31));
  });

  it("창 안에 드는 것이 matchYearsAgo 와 같다 — 쿼리와 판정이 어긋나지 않게", () => {
    for (const today of [TODAY, day(2027, 1, 2), day(2026, 12, 30), day(2028, 2, 29), day(2027, 3, 1)]) {
      // 가장 오래된 사진의 해 = oldest. 그 해 1월 1일부터 오늘까지 반나절씩 훑는다.
      const oldest = today.getFullYear() - 6;
      const ws = yearsAgoWindows(today, oldest);
      for (let t = day(oldest, 1, 1).getTime(); t < today.getTime(); t += 86_400_000 / 2) {
        const d = new Date(t);
        const inWindow = ws.some((w) => d >= w.start && d < w.end);
        expect(!!matchYearsAgo(d, today), `${today.toDateString()} / ${d.toString()}`).toBe(inWindow);
      }
    }
  });

  it("올해의 창은 만들지 않는다", () => {
    expect(yearsAgoWindows(TODAY, 2026)).toEqual([yearsAgoWindow(TODAY, 1)]);
  });
});

describe("pickYearsAgo", () => {
  const photo = (id: string, d: Date | null) => ({ id, d });
  const pick = (items: { id: string; d: Date | null }[], today = TODAY) =>
    pickYearsAgo(items, (p) => p.d, today);

  it("아무것도 안 걸리면 null — 카드를 통째로 숨긴다", () => {
    expect(pick([photo("a", day(2026, 1, 1)), photo("b", null)])).toBeNull();
    expect(pick([])).toBeNull();
  });

  it("「오늘」 이 「이맘때」 보다 먼저 — 더 먼 해여도", () => {
    const p = pick([photo("near", day(2025, 10, 26)), photo("exact", day(2020, 10, 27))]);
    expect(p).toMatchObject({ yearsAgo: 6, exact: true });
    expect(p!.items.map((x) => x.id)).toEqual(["exact"]);
  });

  it("같은 종류면 가까운 해, 그 해의 것만 날짜 순으로", () => {
    const p = pick([
      photo("2019", day(2019, 10, 27)),
      photo("2024-b", day(2024, 10, 27, 15)),
      photo("2024-a", day(2024, 10, 27, 9)),
    ]);
    expect(p).toMatchObject({ yearsAgo: 2, exact: true });
    expect(p!.items.map((x) => x.id)).toEqual(["2024-a", "2024-b"]);
  });

  it("「오늘」 이 없으면 「이맘때」", () => {
    const p = pick([photo("a", day(2023, 10, 29)), photo("b", day(2021, 10, 25))]);
    expect(p).toMatchObject({ yearsAgo: 3, exact: false });
    expect(yearsAgoTitle(p!)).toBe("3년 전 이맘때");
  });

  it("제목", () => {
    expect(yearsAgoTitle({ yearsAgo: 7, exact: true })).toBe("7년 전 오늘");
  });
});
