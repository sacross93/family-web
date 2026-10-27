import { describe, it, expect } from "vitest";
import { exifDay, takenDayFromExif, isHeifLike, takenLabel } from "@/lib/photo-date";
import { parseDateInput } from "@/lib/date";

const TODAY = new Date(2026, 9, 27); // 2026-10-27

describe("exifDay — EXIF 글자에서 날짜만, 시간대 없이", () => {
  it("찍은 시각은 버리고 그 날짜만", () => {
    expect(exifDay("2019:10:27 14:30:00", TODAY)).toBe("2019-10-27");
  });

  it("자정 직후도 그 날이다 — 시간대를 거치면 전날이 되는 값", () => {
    expect(exifDay("2024:03:02 00:30:00", TODAY)).toBe("2024-03-02");
    expect(exifDay("2024:03:02 23:59:59", TODAY)).toBe("2024-03-02");
  });

  it("하이픈으로 적힌 것·시각 없는 것도 받는다", () => {
    expect(exifDay("2024-03-02 10:00:00", TODAY)).toBe("2024-03-02");
    expect(exifDay("2024:03:02", TODAY)).toBe("2024-03-02");
  });

  it("시계를 안 맞춘 카메라의 0000:00:00 은 날짜가 아니다", () => {
    expect(exifDay("0000:00:00 00:00:00", TODAY)).toBeNull();
    expect(exifDay("    :  :     :  :  ", TODAY)).toBeNull();
  });

  it("달력에 없는 날은 버린다", () => {
    expect(exifDay("2023:02:29 10:00:00", TODAY)).toBeNull();
    expect(exifDay("2024:02:29 10:00:00", TODAY)).toBe("2024-02-29");
    expect(exifDay("2024:13:01 10:00:00", TODAY)).toBeNull();
    expect(exifDay("2024:00:10 10:00:00", TODAY)).toBeNull();
  });

  it("내일보다 뒤는 시계가 틀린 것 — 하루 여유만 둔다", () => {
    expect(exifDay("2026:10:28 10:00:00", TODAY)).toBe("2026-10-28");
    expect(exifDay("2026:10:29 10:00:00", TODAY)).toBeNull();
    expect(exifDay("2031:01:01 10:00:00", TODAY)).toBeNull();
  });

  it("1900년 전·글자가 아닌 것·빈 것", () => {
    expect(exifDay("1899:12:31 10:00:00", TODAY)).toBeNull();
    expect(exifDay(undefined, TODAY)).toBeNull();
    expect(exifDay(new Date(2020, 0, 1), TODAY)).toBeNull();
    expect(exifDay("", TODAY)).toBeNull();
  });
});

describe("takenDayFromExif — 찍은 순간 먼저, 없으면 기록한 순간", () => {
  it("DateTimeOriginal 이 있으면 그것", () => {
    expect(
      takenDayFromExif({ DateTimeOriginal: "2019:10:27 14:30:00", CreateDate: "2020:01:01 00:00:00" }, TODAY),
    ).toBe("2019-10-27");
  });

  it("DateTimeOriginal 이 없거나 못 믿을 값이면 CreateDate", () => {
    expect(takenDayFromExif({ CreateDate: "2021:10:25 10:00:00" }, TODAY)).toBe("2021-10-25");
    expect(
      takenDayFromExif({ DateTimeOriginal: "0000:00:00 00:00:00", CreateDate: "2021:10:25 10:00:00" }, TODAY),
    ).toBe("2021-10-25");
  });

  it("수정한 날만 있으면 찍은 날을 모르는 것이다", () => {
    expect(takenDayFromExif({ ModifyDate: "2020:10:27 10:00:00" }, TODAY)).toBeNull();
  });

  it("EXIF 가 없으면(exifr 가 undefined) null", () => {
    expect(takenDayFromExif(undefined, TODAY)).toBeNull();
    expect(takenDayFromExif({}, TODAY)).toBeNull();
  });

  it("서버가 받으면 그 날의 서버 로컬 자정 — 기념일·할일과 같은 규칙", () => {
    const day = takenDayFromExif({ DateTimeOriginal: "2024:03:02 00:30:00" }, TODAY)!;
    const stored = parseDateInput(day)!;
    expect([stored.getFullYear(), stored.getMonth(), stored.getDate(), stored.getHours()]).toEqual([2024, 2, 2, 0]);
  });
});

describe("isHeifLike — 앞부분만으로 못 찾으면 더 읽을 파일", () => {
  const head = (brand: string) => {
    const b = new Uint8Array(16);
    b.set([0, 0, 0, 0x18], 0);
    b.set([..."ftyp"].map((c) => c.charCodeAt(0)), 4);
    b.set([...brand].map((c) => c.charCodeAt(0)), 8);
    return b;
  };
  it("heic·mif1·avif 는 그렇다", () => {
    expect(isHeifLike(head("heic"))).toBe(true);
    expect(isHeifLike(head("mif1"))).toBe(true);
    expect(isHeifLike(head("avif"))).toBe(true);
  });
  it("JPEG·mp4·짧은 것은 아니다", () => {
    expect(isHeifLike(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false);
    expect(isHeifLike(head("isom"))).toBe(false);
    expect(isHeifLike(new Uint8Array(4))).toBe(false);
  });
});

describe("takenLabel", () => {
  it("2024년 3월 2일 찍음", () => {
    expect(takenLabel(new Date(2024, 2, 2))).toBe("2024년 3월 2일 찍음");
  });
});
