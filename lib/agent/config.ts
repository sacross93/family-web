// 에이전트 설정. 숫자·모델명을 코드에 박지 않기 위한 단일 창구.
export type ToolMode = "native" | "json" | "auto";

export interface AgentConfig {
  enabled: boolean;
  model: string;
  toolMode: ToolMode;
  maxSteps: number;
  history: number;
  catalogMaxChars: number;
  fetchMaxChars: number;
}

/** 양수 정수만 허용. 아니면 기본값. */
function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

const TOOL_MODES: ToolMode[] = ["native", "json", "auto"];

/** 매번 읽는다(테스트에서 환경변수를 바꿀 수 있도록 상수로 굳히지 않는다). */
export function agentConfig(): AgentConfig {
  const mode = process.env.AGENT_TOOL_MODE as ToolMode | undefined;
  return {
    enabled: process.env.AGENT_ENABLED === "true",
    model: process.env.AGENT_MODEL || "gpt-5.6-terra",
    toolMode: mode && TOOL_MODES.includes(mode) ? mode : "auto",
    maxSteps: num("AGENT_MAX_STEPS", 6),
    history: num("AGENT_HISTORY", 10),
    catalogMaxChars: num("AGENT_CATALOG_MAX_CHARS", 4000),
    // 3,000 은 한 문단짜리 소개글에나 맞다. 실측한 기사·백과 항목이 6,000~43,000자였고,
    // 6,000 이면 대부분의 기사 한 편이 통째로 들어간다. 넘치면 얼마나 잘렸는지 숫자로 알린다.
    fetchMaxChars: num("AGENT_FETCH_MAX_CHARS", 6000),
  };
}
