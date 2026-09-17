import { describe, it, expect, beforeAll } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/agent/crypto";

beforeAll(() => { process.env.AUTH_SECRET = "test-secret-for-agent-crypto"; });

describe("secret 암호화", () => {
  it("암호화 후 복호화하면 원본", () => {
    const v = "sk-refresh-abc.def.ghi";
    expect(decryptSecret(encryptSecret(v))).toBe(v);
  });
  it("암호문에 평문이 남지 않는다", () => {
    expect(encryptSecret("비밀값")).not.toContain("비밀값");
  });
  it("같은 값도 매번 다른 암호문(IV 랜덤)", () => {
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });
  it("변조된 암호문은 예외", () => {
    const blob = encryptSecret("x");
    const bad = blob.slice(0, -2) + (blob.endsWith("a") ? "bb" : "aa");
    expect(() => decryptSecret(bad)).toThrow();
  });
  it("AUTH_SECRET 이 없으면 예외", () => {
    const keep = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    expect(() => encryptSecret("x")).toThrow();
    process.env.AUTH_SECRET = keep;
  });
});
