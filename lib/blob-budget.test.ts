import { describe, it, expect } from "vitest";
import {
  BLOCK_RATIO,
  HOBBY_LIMIT_BYTES,
  STORAGE_FULL,
  WARN_RATIO,
  blockAt,
  budgetState,
  decideGrant,
  parseDeclaredSize,
  remainingBeforeBlock,
  resolveLimit,
  warnAt,
} from "@/lib/blob-budget";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-kinds";

/**
 * 이 파일이 지키는 것: **Blob Hobby 한도(1GB)를 넘기 전에 멈춘다.** 넘으면 저장소 전체가 한 달쯤 멈추고
 * 이미 올린 사진까지 403 이 된다. 브라우저가 알려 주는 크기는 믿지 않는다.
 */
const L = HOBBY_LIMIT_BYTES;

describe("한도와 문턱", () => {
  it("1GB 는 십진(10억) — 이진보다 작아 안전한 쪽", () => {
    expect(L).toBe(1_000_000_000);
    expect(blockAt(L)).toBe(900_000_000);
    expect(warnAt(L)).toBe(750_000_000);
    expect(BLOCK_RATIO).toBeGreaterThan(WARN_RATIO);
  });

  it("환경변수로 줄일 수 있다 — 이상한 값이면 Hobby 한도", () => {
    expect(resolveLimit("1000")).toBe(1000);
    expect(resolveLimit(undefined)).toBe(L);
    expect(resolveLimit("")).toBe(L);
    expect(resolveLimit("abc")).toBe(L);
    expect(resolveLimit("-5")).toBe(L);
    expect(resolveLimit("0")).toBe(L);
  });

  it("상태 — 75% 부터 조심, 90% 부터 막힘", () => {
    expect(budgetState(0, L)).toBe("ok");
    expect(budgetState(749_999_999, L)).toBe("ok");
    expect(budgetState(750_000_000, L)).toBe("warn");
    expect(budgetState(899_999_999, L)).toBe("warn");
    expect(budgetState(900_000_000, L)).toBe("blocked");
    expect(budgetState(2 * L, L)).toBe("blocked");
  });

  it("남은 양은 음수가 되지 않는다", () => {
    expect(remainingBeforeBlock(100, L)).toBe(900_000_000 - 100);
    expect(remainingBeforeBlock(950_000_000, L)).toBe(0);
  });
});

describe("올려도 되나 — decideGrant", () => {
  it("넉넉하면 허락하고 한 장 상한을 준다", () => {
    expect(decideGrant(0, 5_000_000, L)).toEqual({ ok: true, maximumSizeInBytes: MAX_UPLOAD_BYTES });
  });

  it("남은 양이 한 장 상한보다 적으면 남은 양까지만 — 크기를 속여도 선을 못 넘는다", () => {
    const bytes = blockAt(L) - 10_000_000; // 10MB 남음
    expect(decideGrant(bytes, 3_000_000, L)).toEqual({ ok: true, maximumSizeInBytes: 10_000_000 });
    expect(decideGrant(bytes, 0, L)).toEqual({ ok: true, maximumSizeInBytes: 10_000_000 });
  });

  it("이번 것을 더하면 선을 넘으면 거절", () => {
    const bytes = blockAt(L) - 10_000_000;
    expect(decideGrant(bytes, 10_000_001, L)).toEqual({ ok: false, code: STORAGE_FULL });
    // 딱 선까지는 된다
    expect(decideGrant(bytes, 10_000_000, L).ok).toBe(true);
  });

  it("이미 막혔으면 크기를 몰라도(0) 거절", () => {
    expect(decideGrant(blockAt(L), 0, L)).toEqual({ ok: false, code: STORAGE_FULL });
    expect(decideGrant(blockAt(L) + 1, 0, L).ok).toBe(false);
  });
});

describe("브라우저가 알려 준 크기 — parseDeclaredSize", () => {
  it("정상", () => {
    expect(parseDeclaredSize(JSON.stringify({ size: 12345 }))).toBe(12345);
    expect(parseDeclaredSize(JSON.stringify({ size: 12.7 }))).toBe(12);
  });

  it("없거나 이상하면 0 — 그래도 표의 maximumSizeInBytes 가 막는다", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "not json",
      "null",
      "[]",
      "{}",
      JSON.stringify({ size: "1000" }),
      JSON.stringify({ size: -5 }),
      JSON.stringify({ size: 0 }),
      JSON.stringify({ size: null }),
      JSON.stringify({ size: { valueOf: 1 } }),
      '{"size":1e400}', // JSON 이 Infinity 로 읽는다
    ]) {
      expect(parseDeclaredSize(bad), String(bad)).toBe(0);
    }
  });

  it("터무니없이 큰 값은 한 장 상한으로 자른다 — 기억한 사용량을 거짓으로 부풀리지 못하게", () => {
    expect(parseDeclaredSize(JSON.stringify({ size: 1e15 }))).toBe(MAX_UPLOAD_BYTES);
  });
});
