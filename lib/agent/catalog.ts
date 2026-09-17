import { agentConfig } from "./config";
import { RESOURCES } from "./resources";
import type { AgentResource } from "./registry";

/** 항목 구분자 */
const SEP = " · ";

interface Row {
  /** "앨범(12): " */
  prefix: string;
  /** 줄에 늘어놓을 항목들 */
  parts: string[];
}

/**
 * 1층 — 사이트 목차. 매 요청마다 새로 만든다(캐시·무효화 없음).
 *
 * - 리소스 하나가 실패해도 전체를 버리지 않는다.
 * - 예산은 리소스 수로 나눠 배분한다. 앞 줄이 아낀 만큼 뒤 줄이 더 쓴다.
 * - 넘치면 항목을 접고(`외 N개`), 그래도 안 되면 줄을 통째로 버리되
 *   버린 종류 수를 남긴다(`…외 N종 생략`). 문장 중간에서 자르지 않는다.
 */
export async function buildCatalog(
  resources: AgentResource[] = RESOURCES,
  maxChars: number = agentConfig().catalogMaxChars
): Promise<string> {
  const settled = await Promise.allSettled(
    resources.map(async (r) => ({ r, entries: await r.catalog() }))
  );

  const rows: Row[] = [];
  for (const s of settled) {
    if (s.status !== "fulfilled" || s.value.entries.length === 0) continue;
    const { r, entries } = s.value;
    rows.push({
      prefix: `${r.label}(${entries.length}): `,
      parts: entries.map((e) => (e.hint ? `${e.title} ${e.hint}` : e.title)),
    });
  }

  if (rows.length === 0) return "사이트에 아직 아무것도 없습니다.";
  return layout(rows, Math.max(1, Math.floor(maxChars)));
}

/**
 * 줄을 예산 안에 배치한다.
 * 남은 예산을 남은 리소스 수로 계속 다시 나누므로, 짧은 줄이 남긴 여유는 뒤 줄이 쓴다.
 */
function layout(rows: Row[], maxChars: number): string {
  const lines: string[] = [];
  let used = 0; // 줄바꿈까지 포함한 현재 길이
  let dropped = 0;

  for (let i = 0; i < rows.length; i++) {
    const nl = lines.length ? 1 : 0; // 이 줄 앞에 붙을 줄바꿈
    const share = Math.floor((maxChars - used - nl) / (rows.length - i));
    const line = share > 0 ? fold(rows[i].prefix, rows[i].parts, share) : null;
    if (!line) {
      dropped++; // 이름조차 못 담는 줄은 버린다(대신 아래에서 개수를 남긴다)
      continue;
    }
    lines.push(line);
    used += nl + line.length;
  }

  if (dropped === 0) return lines.join("\n");

  // 버린 게 있으면 "더 있는데 안 보인다"는 사실을 반드시 남긴다. 자리가 없으면 줄을 더 비운다.
  let notice = omitNotice(dropped);
  while (lines.length > 0 && used + 1 + notice.length > maxChars) {
    const removed = lines.pop()!;
    used -= removed.length + (lines.length ? 1 : 0);
    notice = omitNotice(++dropped);
  }
  if (lines.length === 0) return notice.length <= maxChars ? notice : "…";
  return [...lines, notice].join("\n");
}

/**
 * 한 줄을 예산 안에서 접는다. 결과는 언제나 `budget` 이하이고 항목은 중간에서 잘리지 않는다.
 * 리소스 이름조차 못 담으면 null — 그 줄은 버려지고 생략 표시로 대신한다.
 */
function fold(prefix: string, parts: string[], budget: number): string | null {
  const kept: string[] = [];
  let len = prefix.length;
  for (const p of parts) {
    const cost = (kept.length ? SEP.length : 0) + p.length;
    const tail = more(parts.length - kept.length - 1).length; // 이 항목까지 넣고 멈출 때의 꼬리
    if (len + cost + tail > budget) break;
    kept.push(p);
    len += cost;
  }

  const rest = parts.length - kept.length;
  // 항목을 하나도 못 담아도 "이런 리소스가 이만큼 있다"는 사실은 남긴다.
  if (kept.length === 0) {
    const bare = `${prefix}목록 생략`;
    return bare.length <= budget ? bare : null;
  }
  return prefix + kept.join(SEP) + more(rest);
}

/** " 외 3개" — 접힌 항목 수. 없으면 빈 문자열. */
function more(rest: number): string {
  return rest > 0 ? ` 외 ${rest}개` : "";
}

/** 줄째로 빠진 리소스 수. 에이전트가 "더 있는데 안 보인다"를 알게 한다. */
function omitNotice(kinds: number): string {
  return `…외 ${kinds}종 생략`;
}
