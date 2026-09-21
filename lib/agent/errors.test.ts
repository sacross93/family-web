import { describe, it, expect } from "vitest";
import { GENERIC_ERROR, humanError } from "@/lib/agent/errors";

/**
 * 문구가 틀리면 **가족이 고칠 수 없는 일을 고치려고 애쓴다.** 그래서 문장 자체를 시험한다.
 */
describe("공급자 오류를 사람 말로", () => {
  it("401 은 새로고침하라고 하지 않는다 — 새로고침으로는 절대 안 고쳐진다", () => {
    // 여기서 401 은 우리 사이트 로그인이 아니라 **포동이의 ChatGPT 연결**이다.
    // (우리 세션이 풀리면 proxy.ts 가 로그인 화면으로 보내 이 자리까지 오지 않는다.)
    const msg = humanError(401);
    expect(msg).not.toContain("새로고침");
    expect(msg).toContain("연결");
  });

  it("403 도 같은 말을 한다 — 토큰이 죽은 것은 마찬가지다", () => {
    expect(humanError(403)).toBe(humanError(401));
  });

  it("429 는 기다리면 풀린다고 말한다", () => {
    expect(humanError(429)).toContain("사용량");
  });

  it("모르는 것은 얼버무리지 않고 기본 문장으로", () => {
    expect(humanError(500)).toBe(GENERIC_ERROR);
    expect(humanError(undefined)).toBe(GENERIC_ERROR);
  });

  it("상태코드 숫자가 화면 문장에 새지 않는다", () => {
    for (const s of [401, 403, 429, 500, 502, undefined]) {
      expect(humanError(s)).not.toMatch(/\d{3}/);
    }
  });
});
