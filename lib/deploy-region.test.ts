import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Vercel 함수가 **DB 옆(싱가포르)** 에서 도는가.
 *
 * 새 프로젝트의 기본 함수 지역은 미국 동부 `iad1` 이다. 그대로 두었더니 화면마다 서울 → 미국을
 * 건너고, DB 조회 하나마다 미국 ↔ 싱가포르를 또 건넜다 — 운영 `/login` 이 0.57~0.81초,
 * 같은 빌드를 로컬 DB 옆에서 돌리면 0.004~0.008초(2026-09-23 실측, DEPLOY.md "함수 지역").
 * 이 값은 파일 한 줄이라 지우거나 바꿔도 아무 데서도 안 깨지고 **그냥 느려지기만** 한다.
 * 그래서 글로 붙잡는다. DB 를 옮기면 여기와 `vercel.json` 을 같이 고칠 것.
 */

const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
  regions?: unknown;
};

describe("Vercel 함수 지역", () => {
  it("Neon DB 와 같은 싱가포르(sin1) 한 곳이다", () => {
    // 무료(Hobby) 플랜은 지역 하나만 된다 — 둘 이상이면 빌드 전에 배포가 실패한다.
    expect(vercel.regions).toEqual(["sin1"]);
  });
});
