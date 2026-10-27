import { describe, it, expect } from "vitest";
import { compareShopping, sortShopping } from "@/lib/shopping";

const item = (id: string, done: boolean, sortOrder: number, createdAt: Date | string) => ({
  id,
  done,
  sortOrder,
  createdAt,
});

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("compareShopping — 서버 orderBy 와 같은 순서", () => {
  it("안 산 것이 산 것보다 먼저", () => {
    const t = new Date("2026-10-27T09:00:00Z");
    expect(compareShopping(item("a", false, 0, t), item("b", true, 0, t))).toBeLessThan(0);
    expect(compareShopping(item("a", true, 0, t), item("b", false, 0, t))).toBeGreaterThan(0);
  });

  it("같은 칸이면 sortOrder 작은 것이 먼저 — createdAt 보다 앞선다", () => {
    const older = new Date("2026-10-01T00:00:00Z");
    const newer = new Date("2026-10-27T00:00:00Z");
    expect(compareShopping(item("a", false, 0, older), item("b", false, 1, newer))).toBeLessThan(0);
  });

  it("sortOrder 도 같으면 새로 담은 것이 먼저", () => {
    const older = new Date("2026-10-01T00:00:00Z");
    const newer = new Date("2026-10-27T00:00:00Z");
    expect(compareShopping(item("a", false, 0, newer), item("b", false, 0, older))).toBeLessThan(0);
  });

  it("Date 와 ISO 문자열이 섞여도 같은 시각은 같은 시각이다", () => {
    const d = new Date("2026-10-27T09:00:00.000Z");
    expect(compareShopping(item("a", false, 0, d), item("b", false, 0, d.toISOString()))).toBe(0);
  });
});

describe("sortShopping", () => {
  it("서버 렌더(Date)와 다시 읽은 것(문자열)이 섞인 목록을 서버 순서대로 세운다", () => {
    const list = [
      item("산-옛것", true, 0, "2026-10-01T00:00:00.000Z"),
      item("살-옛것", false, 0, new Date("2026-10-01T00:00:00.000Z")),
      item("살-뒤로뺀것", false, 5, "2026-10-27T12:00:00.000Z"),
      item("산-새것", true, 0, new Date("2026-10-20T00:00:00.000Z")),
      // 방금 담은 것 — 예전 화면은 맨 아래에 붙였다. 서버는 맨 위에 둔다.
      item("살-방금", false, 0, "2026-10-27T09:00:00.000Z"),
    ];
    expect(ids(sortShopping(list))).toEqual(["살-방금", "살-옛것", "살-뒤로뺀것", "산-새것", "산-옛것"]);
  });

  it("받은 배열은 건드리지 않고 새 배열을 돌려준다", () => {
    const list = [
      item("b", true, 0, "2026-10-01T00:00:00.000Z"),
      item("a", false, 0, "2026-10-01T00:00:00.000Z"),
    ];
    const sorted = sortShopping(list);
    expect(sorted).not.toBe(list);
    expect(ids(list)).toEqual(["b", "a"]);
    expect(ids(sorted)).toEqual(["a", "b"]);
  });
});
