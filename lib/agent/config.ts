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
  /** 모델 쪽 내장 웹검색을 켤지. 끄면 우리 도구만 쓴다. */
  webSearch: boolean;
  /** 실행 기록(`AgentRun`)을 며칠 보관할지. 무료 티어라 끝없이 쌓이면 안 된다. */
  runLogDays: number;
  /** 목록 하나가 실어 보낼 **본문** 총량. 제목·보조정보는 여기 안 걸린다. */
  listMaxChars: number;
  /** 도구 결과 하나가 대화에 들어갈 수 있는 최대 글자(마지막 안전장치). */
  toolResultMaxChars: number;
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
    // 기본값 켬. 우리 fetch 가 막히는 사이트(쿠팡 등)를 모델이 대신 읽어 준다(실측).
    // 끄려면 AGENT_WEB_SEARCH="false".
    webSearch: process.env.AGENT_WEB_SEARCH !== "false",
    // 30일. "지난주에 이상했는데" 를 되짚기엔 넉넉하고, 가족 둘이 쓰는 사이트에서
    // 무료 데이터베이스를 채울 만한 양이 아니다.
    runLogDays: num("AGENT_RUN_LOG_DAYS", 30),
    // 바깥 웹 한 쪽에 6,000자를 주면서 **우리 게시판 목록은 무제한**이었다. 실측: 8,000자짜리
    // 글 다섯 개를 심으니 list_resource 하나가 647자 → 39,117자가 됐다(상한은 30개니 더 간다).
    listMaxChars: num("AGENT_LIST_MAX_CHARS", 8000),
    // 위의 것들을 다 통과해도 결국 넘치는 것이 있을 수 있다(상세가 큰 리소스·앞으로 생길 도구).
    // 루프가 마지막으로 한 번 더 막는다. 넉넉히 두되 무한은 아니게.
    toolResultMaxChars: num("AGENT_TOOL_RESULT_MAX_CHARS", 12000),
  };
}
