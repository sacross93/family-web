import { describe, it, expect, beforeAll } from "vitest";
import { encryptSecret, decryptSecret, sealPending, openPending } from "@/lib/agent/crypto";

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
  // 고정 벡터: 연결 쿠키용 열쇠를 더하면서 내부를 나눴다(2026-10-16). 그 전 코드로 만든 암호문이
  // 그대로 열려야 한다 — 안 열리면 운영 DB 의 토큰이 죽는다(DEPLOY.md 6절 ⚠️2).
  it("예전 코드로 잠근 토큰이 그대로 열린다 (KEY_DOMAIN 불변)", () => {
    const blob = "pdZvKKu6-gMycRYU:Fgh7KIlrpwVa68Yi0PaSKg:JTUWqk7OHlx4iZwITi-7Y6LN78AhicuHxQ32";
    expect(decryptSecret(blob)).toBe("옛 열쇠로 잠근 토큰");
  });
  it("AUTH_SECRET 이 없으면 예외", () => {
    const keep = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    expect(() => encryptSecret("x")).toThrow();
    process.env.AUTH_SECRET = keep;
  });
});

// 로그인 도중(PKCE verifier·state)을 쿠키에 봉해 두는 열쇠는 **토큰 열쇠와 다르다.**
// 같은 열쇠를 쓰면 쿠키로 받은 덩어리를 토큰 자리에 끼워 넣어도 열린다 — 용도가 섞인다.
describe("로그인 도중 봉인 (sealPending/openPending)", () => {
  it("봉한 것을 열면 원본", () => {
    const v = JSON.stringify({ verifier: "V-1", state: "S-1", exp: 1 });
    expect(openPending(sealPending(v))).toBe(v);
  });

  it("봉한 덩어리에 평문이 남지 않는다", () => {
    const plain = "verifier-비밀";
    const blob = sealPending(plain);
    const bytes = Buffer.concat(blob.split(":").map((p) => Buffer.from(p, "base64url")));
    expect(bytes.includes(Buffer.from(plain, "utf8"))).toBe(false);
  });

  it("변조하면 열리지 않는다", () => {
    const [iv, tag, ct] = sealPending("값").split(":");
    const flipped = Buffer.from(ct, "base64url");
    flipped[0] ^= 0xff;
    expect(() => openPending([iv, tag, flipped.toString("base64url")].join(":"))).toThrow();
    expect(() => openPending("아무말")).toThrow();
    expect(() => openPending("")).toThrow();
  });

  it("토큰 열쇠로 잠근 것은 못 연다 — 반대도 마찬가지", () => {
    // 먼저 각자 제 열쇠로는 열리는지 본다. 이게 없으면 함수가 아예 없어도(TypeError)
    // 아래 두 줄이 "던졌다" 로 통과한다 — 실제로 구현 전에 이 시험이 초록이었다.
    expect(openPending(sealPending("도중"))).toBe("도중");
    expect(decryptSecret(encryptSecret("토큰"))).toBe("토큰");
    expect(() => openPending(encryptSecret("토큰"))).toThrow();
    expect(() => decryptSecret(sealPending("도중"))).toThrow();
  });
});
