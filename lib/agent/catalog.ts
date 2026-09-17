import { agentConfig } from "./config";
import { RESOURCES } from "./resources";
import type { AgentResource } from "./registry";

/**
 * 1층 — 사이트 목차. 매 요청마다 새로 만든다(캐시·무효화 없음).
 * 리소스 하나가 실패해도 전체를 버리지 않는다.
 */
export async function buildCatalog(
  resources: AgentResource[] = RESOURCES,
  maxChars: number = agentConfig().catalogMaxChars
): Promise<string> {
  const settled = await Promise.allSettled(
    resources.map(async (r) => ({ r, entries: await r.catalog() }))
  );

  const lines: string[] = [];
  for (const s of settled) {
    if (s.status !== "fulfilled" || s.value.entries.length === 0) continue;
    const { r, entries } = s.value;
    const parts = entries.map((e) => (e.hint ? `${e.title} ${e.hint}` : e.title));
    lines.push(fold(`${r.label}(${entries.length}): `, parts, maxChars));
  }

  if (lines.length === 0) return "사이트에 아직 아무것도 없습니다.";

  let out = lines.join("\n");
  if (out.length > maxChars) out = out.slice(0, maxChars - 1).trimEnd() + "…";
  return out;
}

/** 한 줄이 상한을 넘지 않게 접는다. */
function fold(prefix: string, parts: string[], maxChars: number): string {
  const budget = Math.max(40, Math.floor(maxChars / 2));
  const kept: string[] = [];
  let len = prefix.length;
  for (const p of parts) {
    if (len + p.length + 3 > budget) break;
    kept.push(p);
    len += p.length + 3;
  }
  const rest = parts.length - kept.length;
  return prefix + kept.join(" · ") + (rest > 0 ? ` 외 ${rest}개` : "");
}
