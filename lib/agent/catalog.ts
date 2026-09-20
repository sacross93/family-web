import { agentConfig } from "./config";
import { RESOURCES } from "./resources";
import type { AgentResource } from "./registry";

/** 항목 구분자 */
const SEP = " · ";
/** 불러오지 못한 리소스 알림 머리말 — 일부만 실패 / 전부 실패 */
const FAIL_SOME = "일부를 불러오지 못했어요";
const FAIL_ALL = "지금은 목록을 불러오지 못했어요";
/** 문구도 못 실을 만큼 상한이 작을 때의 최소 표시. 실패를 감추느니 내용을 버린다. */
const FAIL_MARK = "…확인 안 됨";
/** 정말 비어 있을 때. 상한이 문구보다 짧으면 짧은 쪽을 쓴다. */
const EMPTY = "사이트에 아직 아무것도 없습니다.";
const EMPTY_SHORT = "비었어요";

interface Row {
  /** "앨범(12): " */
  prefix: string;
  /** 줄에 늘어놓을 항목들 */
  parts: string[];
}

interface FoldOptions {
  /** 접힌 수의 단위. 항목은 "개", 리소스 종류는 "종". */
  unit?: string;
  /** 항목이 하나도 못 들어갈 때 대신 쓸 문구 */
  bare?: string;
}

/**
 * 1층 — 사이트 목차. 매 요청마다 새로 만든다(캐시·무효화 없음).
 *
 * 가장 위험한 실패는 **"모르는 것"이 "없는 것"처럼 보이는 것**이다. 그래서
 * 길이가 모자라 빠진 것도, 쿼리가 실패해 빠진 것도 반드시 흔적을 남긴다.
 * - 예산은 리소스 수로 나눠 배분한다. 앞 줄이 아낀 만큼 뒤 줄이 더 쓴다.
 * - 넘치면 항목을 접고(`외 N개`), 그래도 안 되면 줄을 통째로 버리되 `…외 N종 생략`.
 * - 리소스 하나가 실패해도 나머지는 살리고, 마지막 줄에 실패한 리소스 이름을 남긴다.
 *   이 알림은 내용보다 우선한다 — 자리가 없으면 내용 줄을 버려서라도 `…확인 안 됨` 을 남긴다.
 * - 문장 중간에서 자르지 않는다. 결과 길이는 언제나 maxChars 이하.
 */
export async function buildCatalog(
  resources: AgentResource[] = RESOURCES,
  maxChars: number = agentConfig().catalogMaxChars
): Promise<string> {
  const settled = await Promise.allSettled(resources.map(async (r) => r.catalog()));

  const rows: Row[] = [];
  const failed: string[] = [];
  settled.forEach((s, i) => {
    const r = resources[i];
    // 실패 "원인"은 절대 담지 않는다. 이 문자열은 LLM 에게 그대로 전달되고
    // DB 에러 본문에는 쿼리·스키마가 들어 있을 수 있다. 이름과 개수까지만.
    if (s.status === "rejected") {
      failed.push(r.label);
      return;
    }
    if (s.value.length === 0) return;
    rows.push({
      prefix: `${r.label}(${s.value.length}): `,
      // body 는 일부러 뺀다 — 목차는 "무엇이 있나" 를 보는 자리지 읽는 자리가 아니다.
      // 본문은 list_resource 가 준다(registry.ts 의 CatalogEntry.body 주석).
      parts: s.value.map((e) => (e.hint ? `${e.title} ${e.hint}` : e.title)),
    });
  });

  // 숫자가 아닌 상한이 오면(직접 호출자의 실수) 설정값으로 돌아간다.
  // NaN 이면 모든 크기 비교가 false 가 되어 접기가 멈추지 않는다.
  const cap = Number.isFinite(maxChars)
    ? Math.max(1, Math.floor(maxChars))
    : agentConfig().catalogMaxChars;

  // 전부 실패한 것과 정말 비어 있는 것은 다르다. 후자일 때만 "없다"고 말한다.
  if (rows.length === 0 && failed.length === 0) {
    if (EMPTY.length <= cap) return EMPTY;
    return EMPTY_SHORT.length <= cap ? EMPTY_SHORT : ""; // 안내 문구도 상한을 넘지 않는다
  }

  const alert = failed.length > 0 ? failNotice(failed, cap, rows.length) : null;
  // 실패를 알릴 자리조차 없으면(상한이 한 줌일 때) 완전한 목록인 척하지 않는다.
  if (failed.length > 0 && !alert) return "…";
  return layout(rows, alert, cap);
}

/**
 * 줄을 예산 안에 배치한다.
 * 남은 예산을 남은 리소스 수로 계속 다시 나누므로, 짧은 줄이 남긴 여유는 뒤 줄이 쓴다.
 * 실패 알림은 내용보다 먼저 자리를 잡는다(내용이 예산을 다 먹어 실패 사실이 사라지면 안 된다).
 */
function layout(rows: Row[], alert: string | null, maxChars: number): string {
  const cap = maxChars - (alert ? alert.length + (rows.length ? 1 : 0) : 0);

  const lines: string[] = [];
  let used = 0; // 줄바꿈까지 포함한 현재 길이
  let dropped = 0;

  for (let i = 0; i < rows.length; i++) {
    const nl = lines.length ? 1 : 0; // 이 줄 앞에 붙을 줄바꿈
    const share = Math.floor((cap - used - nl) / (rows.length - i));
    const line = share > 0 ? fold(rows[i].prefix, rows[i].parts, share) : null;
    if (!line) {
      dropped++; // 이름조차 못 담는 줄은 버린다(대신 아래에서 개수를 남긴다)
      continue;
    }
    lines.push(line);
    used += nl + line.length;
  }

  if (dropped > 0) {
    // 버린 게 있으면 "더 있는데 안 보인다"는 사실을 남긴다. 자리가 없으면 줄을 더 비운다.
    let notice = omitNotice(dropped);
    while (lines.length > 0 && used + 1 + notice.length > cap) {
      const removed = lines.pop()!;
      used -= removed.length + (lines.length ? 1 : 0);
      notice = omitNotice(++dropped);
    }
    const nl = lines.length ? 1 : 0;
    if (used + nl + notice.length <= cap) {
      lines.push(notice);
      used += nl + notice.length;
    }
  }

  if (alert) lines.push(alert);
  return lines.length > 0 ? lines.join("\n") : "…";
}

/**
 * 한 줄을 예산 안에서 접는다. 결과는 언제나 `budget` 이하이고 항목은 중간에서 잘리지 않는다.
 * 대체 문구조차 못 담으면 null — 그 줄은 버려지고 생략 표시로 대신한다.
 */
function fold(prefix: string, parts: string[], budget: number, opts: FoldOptions = {}): string | null {
  const unit = opts.unit ?? "개";
  const kept: string[] = [];
  let len = prefix.length;
  for (const p of parts) {
    const cost = (kept.length ? SEP.length : 0) + p.length;
    const tail = more(parts.length - kept.length - 1, unit).length; // 여기서 멈출 때의 꼬리
    if (len + cost + tail > budget) break;
    kept.push(p);
    len += cost;
  }

  const rest = parts.length - kept.length;
  // 항목을 하나도 못 담아도 "이런 리소스가 이만큼 있다"는 사실은 남긴다.
  if (kept.length === 0) {
    const bare = opts.bare ?? `${prefix}목록 생략`;
    return bare.length <= budget ? bare : null;
  }
  return prefix + kept.join(SEP) + more(rest, unit);
}

/** " 외 3개" — 접힌 수. 없으면 빈 문자열. */
function more(rest: number, unit: string): string {
  return rest > 0 ? ` 외 ${rest}${unit}` : "";
}

/** 줄째로 빠진 리소스 수. 에이전트가 "더 있는데 안 보인다"를 알게 한다. */
function omitNotice(kinds: number): string {
  return `…외 ${kinds}종 생략`;
}

/**
 * 불러오지 못한 리소스 알림. 에이전트가 "없다"가 아니라 "확인이 안 된다"고 답하게 하는 줄이다.
 * 자리에 따라 이름 전부 → 이름 일부+개수 → 개수만 → 최소 표시 순으로 줄인다.
 * 상한보다 길어지진 않으므로, 상한이 최소 표시보다도 작을 때만 null 이다.
 */
function failNotice(labels: string[], maxChars: number, rowCount: number): string | null {
  const head = rowCount > 0 ? FAIL_SOME : FAIL_ALL;
  const brief = `${head}(${labels.length}종)`;
  // 줄 하나 몫을 쓰되, 개수만이라도 남길 자리는 확보한다.
  const budget = Math.max(Math.floor(maxChars / (rowCount + 1)), Math.min(maxChars, brief.length));
  const named = fold(`${head}: `, labels, budget, { unit: "종", bare: brief });
  if (named) return named;
  // 문구가 통째로 안 들어가면 표시만이라도 남긴다(내용 줄을 밀어내서라도).
  return FAIL_MARK.length <= maxChars ? FAIL_MARK : null;
}
