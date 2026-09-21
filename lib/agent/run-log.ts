// 한 턴이 끝난 뒤 **무슨 일이 있었는지** 한 줄 남긴다(`AgentRun`).
//
// 표는 처음부터 있었지만 쓰는 코드가 한 줄도 없었다. 그래서 "포동이가 왜 그랬지" 를
// 물어볼 데가 없었다 — 대화 기록(`AgentChat`)에는 **모델이 한 말**만 남고, 어떤 도구가
// 몇 번 실패했는지·얼마나 걸렸는지는 흘러가 버린다.
//
// ⚠️ **무엇을 남기지 않는지가 이 파일의 핵심이다.**
//   - `ToolResult.data` 를 넣지 않는다. `read_url` 로 가져온 **바깥 글**과 가족의 사진·일기
//     본문이 로그 표에 눌러앉는다. 대화에는 이미 있고, 여기에 또 둘 이유가 없다.
//   - 공급자 오류 **본문**을 넣지 않는다. 사용자 본인의 ChatGPT 세션 사정이 섞여 있다.
//     남기는 것은 라우트가 화면에 띄운 **번역된 한 문장**뿐이다.
//   - 도구의 `error` 문구도 넣지 않는다. 우리가 만든 한국어지만 그 안에 API 가 돌려준
//     항목 이름이 섞여 들어올 수 있다("'발리' 앨범을 찾지 못했어요").
//
// 남기는 것은 **이름·성패·label·걸린 시간**뿐이다. 그걸로 "read_url 이 세 번 다 실패했다"
// 까지는 안다. 그 이상이 필요하면 대화 기록을 본다.

import { prisma } from "@/lib/prisma";
import { agentConfig } from "./config";

/** 도구 한 번. `label` 은 화면에 떴던 그 문구다(예: "계획 · 발리"). */
export interface RunStep {
  name: string;
  ok: boolean;
  label?: string;
  ms: number;
}

export type RunOutcome = "ok" | "error" | "aborted";

export interface RunRecord {
  prompt: string;
  steps: RunStep[];
  outcome: RunOutcome;
  /** 화면에 띄운 한 문장. 공급자 원문이 아니다. */
  error?: string;
  toolMode: string;
  ms: number;
}

/** 질문이 길어도 로그 한 줄이 화면을 넘지 않게. 대화 기록에 원문이 그대로 있다. */
const PROMPT_MAX = 200;
/** 한 턴에 도구를 아무리 많이 불러도 이만큼만. 상한 없는 JSON 이 행 하나를 크게 만든다. */
const STEPS_MAX = 40;

function clip(value: string, max: number): string {
  const line = value.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

/**
 * 저장할 모양으로 다듬는다. **순수 함수** — 프리즈마 없이 시험한다.
 *
 * 여기서 거르는 것이 이 기능의 전부라서, 이 함수가 시험의 과녁이다.
 */
export function shapeRun(record: RunRecord): {
  prompt: string;
  steps: string;
  outcome: string;
  error: string | null;
  toolMode: string;
  ms: number;
} {
  const steps = record.steps.slice(0, STEPS_MAX).map((s) => ({
    name: s.name,
    ok: s.ok,
    ...(s.label ? { label: clip(s.label, 60) } : {}),
    ms: Math.max(0, Math.round(s.ms)),
  }));
  return {
    prompt: clip(record.prompt, PROMPT_MAX),
    steps: JSON.stringify(steps),
    outcome: record.outcome,
    error: record.error ? clip(record.error, 200) : null,
    toolMode: record.toolMode,
    ms: Math.max(0, Math.round(record.ms)),
  };
}

/**
 * 한 줄 남기고, 오래된 것을 치운다.
 *
 * **절대 던지지 않는다.** 로그를 못 남긴 것 때문에 가족의 대화가 실패하면 본말이 뒤집힌다.
 * 남기기가 실패하면 서버 콘솔에만 적고 넘어간다.
 */
export async function recordRun(record: RunRecord): Promise<void> {
  try {
    await prisma.agentRun.create({ data: shapeRun(record) });
  } catch (error) {
    console.error("[agent] 실행 기록을 남기지 못했습니다", error);
    return;
  }
  // 무료 티어 데이터베이스다. 로그가 끝없이 자라면 언젠가 그것 때문에 사이트가 선다.
  // 지우기가 실패해도 조용히 넘어간다 — 다음 턴에 또 시도한다.
  try {
    const days = agentConfig().runLogDays;
    const before = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    await prisma.agentRun.deleteMany({ where: { createdAt: { lt: before } } });
  } catch {
    // 지우지 못한 것은 다음 기회에.
  }
}
