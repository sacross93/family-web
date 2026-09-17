import { describe, it, expect, afterEach } from "vitest";
import { agentConfig } from "@/lib/agent/config";

const KEYS = ["AGENT_ENABLED","AGENT_MODEL","AGENT_TOOL_MODE","AGENT_MAX_STEPS","AGENT_HISTORY","AGENT_CATALOG_MAX_CHARS","AGENT_FETCH_MAX_CHARS"];
afterEach(() => KEYS.forEach((k) => delete process.env[k]));

describe("agentConfig", () => {
  it("환경변수가 없으면 기본값을 쓴다", () => {
    const c = agentConfig();
    expect(c.enabled).toBe(false);
    expect(c.model).toBe("gpt-5.6-terra");
    expect(c.toolMode).toBe("auto");
    expect(c.maxSteps).toBe(6);
    expect(c.history).toBe(10);
    expect(c.catalogMaxChars).toBe(4000);
    expect(c.fetchMaxChars).toBe(3000);
  });

  it("환경변수로 덮어쓴다", () => {
    process.env.AGENT_ENABLED = "true";
    process.env.AGENT_MODEL = "gpt-5.5";
    process.env.AGENT_MAX_STEPS = "3";
    const c = agentConfig();
    expect(c.enabled).toBe(true);
    expect(c.model).toBe("gpt-5.5");
    expect(c.maxSteps).toBe(3);
  });

  it("잘못된 값은 기본값으로 되돌린다", () => {
    process.env.AGENT_MAX_STEPS = "0";
    process.env.AGENT_HISTORY = "abc";
    process.env.AGENT_TOOL_MODE = "telepathy";
    const c = agentConfig();
    expect(c.maxSteps).toBe(6);
    expect(c.history).toBe(10);
    expect(c.toolMode).toBe("auto");
  });
});
