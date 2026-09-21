import { describe, it, expect } from "vitest";
import { shapeRun } from "@/lib/agent/run-log";
import type { RunRecord } from "@/lib/agent/run-log";

/**
 * 이 표에서 중요한 것은 **무엇이 안 들어가는가**다. 그래서 시험도 거기에 건다.
 *
 * `shapeRun` 은 순수 함수라 프리즈마 없이 돈다 — 저장 직전의 모양이 전부 여기서 정해진다.
 */
const base: RunRecord = {
  prompt: "할일 뭐 있어?",
  steps: [{ name: "list_resource", ok: true, label: "할일 목록", ms: 120 }],
  outcome: "ok",
  toolMode: "native",
  ms: 3400,
};

describe("실행 기록에 남는 것", () => {
  it("이름·성패·label·시간만 남는다", () => {
    const row = shapeRun(base);
    expect(JSON.parse(row.steps)).toEqual([
      { name: "list_resource", ok: true, label: "할일 목록", ms: 120 },
    ]);
    expect(row.outcome).toBe("ok");
    expect(row.toolMode).toBe("native");
    expect(row.ms).toBe(3400);
    expect(row.error).toBeNull();
  });

  it("도구가 아무리 많아도 상한을 넘지 않는다 — 행 하나가 커지면 안 된다", () => {
    const many = Array.from({ length: 200 }, () => ({ name: "read_url", ok: false, ms: 1 }));
    expect(JSON.parse(shapeRun({ ...base, steps: many }).steps).length).toBeLessThanOrEqual(40);
  });

  it("긴 질문은 자른다 — 원문은 대화 기록에 그대로 있다", () => {
    const row = shapeRun({ ...base, prompt: "가".repeat(500) });
    expect(row.prompt.length).toBeLessThanOrEqual(201); // 200 + 말줄임표
    expect(row.prompt.endsWith("…")).toBe(true);
  });

  it("줄바꿈이 낀 질문도 한 줄이 된다 — 로그가 화면에서 깨지지 않게", () => {
    expect(shapeRun({ ...base, prompt: "첫 줄\n\n둘째 줄" }).prompt).toBe("첫 줄 둘째 줄");
  });

  it("label 도 길면 자른다", () => {
    const row = shapeRun({ ...base, steps: [{ name: "open_page", ok: true, label: "나".repeat(300), ms: 5 }] });
    const [step] = JSON.parse(row.steps) as { label: string }[];
    expect(step.label.length).toBeLessThanOrEqual(61);
  });

  it("label 이 없으면 그 칸을 아예 만들지 않는다", () => {
    const [step] = JSON.parse(shapeRun({ ...base, steps: [{ name: "read_url", ok: false, ms: 9 }] }).steps) as Record<string, unknown>[];
    expect(step).not.toHaveProperty("label");
  });

  it("화면에 띄운 한 문장만 error 로 남는다", () => {
    const row = shapeRun({ ...base, outcome: "error", error: "오늘 사용량을 다 썼어요. 잠시 뒤에 다시 해볼까요?" });
    expect(row.outcome).toBe("error");
    expect(row.error).toBe("오늘 사용량을 다 썼어요. 잠시 뒤에 다시 해볼까요?");
  });

  it("음수 시간은 0 으로 — 시계가 뒤로 가도 표가 이상해지지 않게", () => {
    const row = shapeRun({ ...base, ms: -5, steps: [{ name: "x", ok: true, ms: -1 }] });
    expect(row.ms).toBe(0);
    expect((JSON.parse(row.steps) as { ms: number }[])[0].ms).toBe(0);
  });

  it("도구 결과 본문이 섞여 들어올 자리가 없다", () => {
    // `RunStep` 에 data 를 넣으려 해도 shapeRun 이 이름·성패·label·ms 만 다시 세운다.
    // 타입으로는 막히지만, 자바스크립트에서 넘어오는 값까지 막히는지를 본다.
    const sneaky = { name: "read_url", ok: true, ms: 1, data: "바깥에서 가져온 긴 글…", error: "'발리' 앨범" };
    const [step] = JSON.parse(shapeRun({ ...base, steps: [sneaky] }).steps) as Record<string, unknown>[];
    expect(Object.keys(step).sort()).toEqual(["ms", "name", "ok"]);
  });
});
