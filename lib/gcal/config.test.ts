import { describe, it, expect } from "vitest";
import { gcalConfig } from "@/lib/gcal/config";

// 진짜 키는 읽지 않는다 — 시험마다 env 를 **직접** 넘긴다(process.env 를 건드리지 않는다).
const PEM_BODY = "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCfakefakefake";
const PEM = `-----BEGIN PRIVATE KEY-----\n${PEM_BODY}\n-----END PRIVATE KEY-----\n`;
const EMAIL = "sync@podong-test.iam.gserviceaccount.com";
const CAL = "family@example.com";

/** Next 가 ProcessEnv 에 NODE_ENV 를 필수로 더해 두어, 시험용 env 는 형만 맞춘다 */
const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

/** 키 파일을 JSON 으로 — 실제 키 파일처럼 private_key 안의 개행은 `\n` 이스케이프로 들어간다. */
function keyJson(over: Record<string, unknown> = {}) {
  return JSON.stringify({ type: "service_account", client_email: EMAIL, private_key: PEM, ...over });
}

describe("gcalConfig", () => {
  it("둘 다 없으면 missing", () => {
    expect(gcalConfig(env({}))).toEqual({ enabled: false, reason: "missing" });
  });

  it("하나만 있어도 missing — 캘린더 ID 없음 / 키 없음 / 빈 글자", () => {
    expect(gcalConfig(env({ GOOGLE_SERVICE_ACCOUNT_JSON: keyJson() }))).toEqual({ enabled: false, reason: "missing" });
    expect(gcalConfig(env({ GOOGLE_CALENDAR_ID: CAL }))).toEqual({ enabled: false, reason: "missing" });
    expect(gcalConfig(env({ GOOGLE_SERVICE_ACCOUNT_JSON: "  ", GOOGLE_CALENDAR_ID: CAL }))).toEqual({
      enabled: false,
      reason: "missing",
    });
  });

  it("JSON 이 아니면 bad_key", () => {
    expect(gcalConfig(env({ GOOGLE_SERVICE_ACCOUNT_JSON: "{not json", GOOGLE_CALENDAR_ID: CAL }))).toEqual({
      enabled: false,
      reason: "bad_key",
    });
    // JSON 이긴 한데 객체가 아님
    expect(gcalConfig(env({ GOOGLE_SERVICE_ACCOUNT_JSON: '"just a string"', GOOGLE_CALENDAR_ID: CAL }))).toEqual({
      enabled: false,
      reason: "bad_key",
    });
  });

  it("private_key 가 없으면 bad_key", () => {
    const raw = JSON.stringify({ type: "service_account", client_email: EMAIL });
    expect(gcalConfig(env({ GOOGLE_SERVICE_ACCOUNT_JSON: raw, GOOGLE_CALENDAR_ID: CAL }))).toEqual({
      enabled: false,
      reason: "bad_key",
    });
  });

  it("client_email 이 없으면 bad_key", () => {
    const raw = JSON.stringify({ type: "service_account", private_key: PEM });
    expect(gcalConfig(env({ GOOGLE_SERVICE_ACCOUNT_JSON: raw, GOOGLE_CALENDAR_ID: CAL }))).toEqual({
      enabled: false,
      reason: "bad_key",
    });
  });

  it("PEM 이 아니면 bad_key (PKCS#1 'RSA PRIVATE KEY' 도 아니다 — jose 의 importPKCS8 은 PKCS#8 만 받는다)", () => {
    for (const bad of ["not a pem", `-----BEGIN RSA PRIVATE KEY-----\n${PEM_BODY}\n-----END RSA PRIVATE KEY-----\n`]) {
      expect(gcalConfig(env({ GOOGLE_SERVICE_ACCOUNT_JSON: keyJson({ private_key: bad }), GOOGLE_CALENDAR_ID: CAL }))).toEqual({
        enabled: false,
        reason: "bad_key",
      });
    }
  });

  it("정상이면 enabled — 키 파일 그대로(Vercel): private_key 의 개행이 실제 개행", () => {
    const c = gcalConfig(env({ GOOGLE_SERVICE_ACCOUNT_JSON: keyJson(), GOOGLE_CALENDAR_ID: ` ${CAL} ` }));
    expect(c).toEqual({ enabled: true, calendarId: CAL, clientEmail: EMAIL, privateKey: PEM });
    if (!c.enabled) throw new Error("unreachable");
    expect(c.privateKey).toContain("\n");
    expect(c.privateKey).not.toContain("\\n");
  });

  it("`\\n` 이 글자로 한 번 더 이스케이프된 값(일부 도구)도 실제 개행으로 받는다", () => {
    // JSON.parse 뒤에도 private_key 안에 백슬래시+n 두 글자가 남는 모양
    const doubled = keyJson({ private_key: PEM.replace(/\n/g, "\\n") });
    expect(doubled).toContain("\\\\n"); // 시험이 정말 두 겹 이스케이프를 만들었는지(카나리아)
    const c = gcalConfig(env({ GOOGLE_SERVICE_ACCOUNT_JSON: doubled, GOOGLE_CALENDAR_ID: CAL }));
    expect(c).toEqual({ enabled: true, calendarId: CAL, clientEmail: EMAIL, privateKey: PEM });
  });

  it("env 를 안 넘기면 process.env 를 읽는다(매번 — 캐시 없음)", () => {
    const before = { k: process.env.GOOGLE_SERVICE_ACCOUNT_JSON, c: process.env.GOOGLE_CALENDAR_ID };
    try {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      delete process.env.GOOGLE_CALENDAR_ID;
      expect(gcalConfig()).toEqual({ enabled: false, reason: "missing" });
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = keyJson();
      process.env.GOOGLE_CALENDAR_ID = CAL;
      expect(gcalConfig().enabled).toBe(true);
    } finally {
      if (before.k === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      else process.env.GOOGLE_SERVICE_ACCOUNT_JSON = before.k;
      if (before.c === undefined) delete process.env.GOOGLE_CALENDAR_ID;
      else process.env.GOOGLE_CALENDAR_ID = before.c;
    }
  });
});
