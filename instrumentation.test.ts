import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { register } from "./instrumentation";

// 시간대를 건드리는 테스트라 앞뒤로 원래 값을 되돌려 둔다.
const saved = { TZ: process.env.TZ, RUNTIME: process.env.NEXT_RUNTIME, SITE: process.env.SITE_TZ };

function restore(key: "TZ" | "NEXT_RUNTIME" | "SITE_TZ", value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe("서버 시간대", () => {
  beforeEach(() => {
    delete process.env.SITE_TZ;
  });

  afterEach(() => {
    restore("TZ", saved.TZ);
    restore("NEXT_RUNTIME", saved.RUNTIME);
    restore("SITE_TZ", saved.SITE);
  });

  it("node 런타임에서 한국 시간으로 맞춘다", () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.TZ = "UTC";
    register();
    expect(process.env.TZ).toBe("Asia/Seoul");
  });

  it("UTC 로 떠 있어도 한국 시각을 읽는다 — 홈 인사말과 '오늘 할일'의 하루 경계가 여기 달렸다", () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.TZ = "UTC";
    // 한국시간 2026-09-20 오전 2시 = UTC 2026-09-19 17시. 시간대가 안 맞으면
    // 날짜도 하루 전, 시각도 오후로 읽혀 "오늘 할일" 이 어제 것을 보여 준다.
    const instant = new Date("2026-09-19T17:00:00Z");
    expect(instant.getHours(), "고치기 전에는 UTC 로 읽힌다").toBe(17);
    expect(instant.getDate()).toBe(19);

    register();
    expect(instant.getHours(), "고친 뒤에는 한국 시각").toBe(2);
    expect(instant.getDate(), "날짜도 한국 기준").toBe(20);
  });

  it("edge 런타임(미들웨어)에서는 건드리지 않는다", () => {
    process.env.NEXT_RUNTIME = "edge";
    process.env.TZ = "UTC";
    register();
    expect(process.env.TZ).toBe("UTC");
  });

  it("SITE_TZ 로 바꿀 수 있다", () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.SITE_TZ = "America/New_York";
    register();
    expect(process.env.TZ).toBe("America/New_York");
  });
});
