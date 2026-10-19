import { describe, expect, it } from "vitest";
import { canEditAnniversary, withCanEdit } from "./anniversary";

const admin = { uid: "a", username: "a", name: null, isAdmin: true };
const mom = { uid: "m", username: "m", name: null, isAdmin: false };
const dad = { uid: "d", username: "d", name: null, isAdmin: false };

describe("canEditAnniversary — 만든 사람이나 관리자", () => {
  it("만든 사람은 고친다", () => expect(canEditAnniversary(mom, "m")).toBe(true));
  it("다른 가족은 못 고친다", () => expect(canEditAnniversary(dad, "m")).toBe(false));
  it("관리자는 남이 만든 것도 고친다", () => expect(canEditAnniversary(admin, "m")).toBe(true));
  // 이 표가 생기기 전의 기념일·시드 — 만든 사람을 모른다.
  it("만든 사람을 모르면 관리자만", () => {
    expect(canEditAnniversary(mom, null)).toBe(false);
    expect(canEditAnniversary(mom, undefined)).toBe(false);
    expect(canEditAnniversary(admin, null)).toBe(true);
  });
  it("로그인이 없으면 아무도", () => expect(canEditAnniversary(null, "m")).toBe(false));
});

describe("withCanEdit", () => {
  it("owner 를 떼고 canEdit 만 붙인다(uid 를 내보내지 않는다)", () => {
    const out = withCanEdit({ id: "x", owner: { userId: "m" } }, mom);
    expect(out).toEqual({ id: "x", canEdit: true });
    expect("owner" in out).toBe(false);
  });
});
