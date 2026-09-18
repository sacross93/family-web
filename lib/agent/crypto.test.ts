import { describe, it, expect, beforeAll } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/agent/crypto";

beforeAll(() => { process.env.AUTH_SECRET = "test-secret-for-agent-crypto"; });

describe("secret 암호화", () => {
  it("암호화 후 복호화하면 원본", () => {
    const v = "sk-refresh-abc.def.ghi";
    expect(decryptSecret(encryptSecret(v))).toBe(v);
  });
  it("암호문에 평문이 남지 않는다", () => {
    const plain = "비밀값";
    const blob = encryptSecret(plain);
    expect(blob).not.toContain(plain);
    // base64url 문자열만 훑으면 단순 인코딩(암호화 없음)이어도 통과해 버립니다.
    // 디코드한 바이트열에 평문의 UTF-8 바이트가 없는지까지 봅니다.
    const bytes = Buffer.concat(blob.split(":").map((p) => Buffer.from(p, "base64url")));
    expect(bytes.includes(Buffer.from(plain, "utf8"))).toBe(false);
  });
  it("같은 값도 매번 다른 암호문(IV 랜덤)", () => {
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });
  // 마지막 글자를 바꾸는 방식은 우연히 같은 바이트가 나올 수 있어(1/256) 깜빡입니다.
  // 바이트를 확실히 뒤집어 GCM 인증이 반드시 실패하게 합니다.
  function flipFirstByte(part: string): string {
    const bytes = Buffer.from(part, "base64url");
    bytes[0] ^= 0xff;
    return bytes.toString("base64url");
  }

  it("변조된 암호문은 예외", () => {
    const [iv, tag, ct] = encryptSecret("sk-refresh-abc.def.ghi").split(":");
    expect(() => decryptSecret([iv, tag, flipFirstByte(ct)].join(":"))).toThrow();
  });

  it("변조된 인증 태그는 예외", () => {
    const [iv, tag, ct] = encryptSecret("sk-refresh-abc.def.ghi").split(":");
    expect(() => decryptSecret([iv, flipFirstByte(tag), ct].join(":"))).toThrow();
  });
  it("AUTH_SECRET 이 없으면 예외", () => {
    const keep = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    expect(() => encryptSecret("x")).toThrow();
    process.env.AUTH_SECRET = keep;
  });
});
