// 리소스 단일 진실 원천. 목차·도구·경로 해석·추가·되돌리기가 모두 여기서 파생된다.
// 실제 리소스 정의는 resources.ts 에 있다.

/** LLM 에게 넘길 인자 스키마(JSON Schema 축약형) */
export interface JsonSchema {
  type: "object";
  properties: Record<string, { type: string; description: string; enum?: string[] }>;
  required?: string[];
}

/** LLM 에게 노출하는 도구 하나의 정의. 도구(tools.ts)와 어댑터(llm/*)가 공유한다. */
export interface ToolSchema {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface CatalogEntry {
  id?: string;
  title: string;
  /** "2026-07 · 사진 12" 같은 보조 정보 */
  hint?: string;
  /**
   * 항목의 **본문**. 글이 본체인 것들(아기 기록·게시판 글·일정 메모)이 여기에 담는다.
   *
   * ⚠️ **시스템 목차(`catalog.ts`)는 이 값을 쓰지 않는다.** 목차는 16종이 4,000자 안에 다
   * 들어가야 하는 자리라, 본문을 넣으면 한 종류가 다른 종류를 밀어낸다.
   * 이 값은 `list_resource` 로 한 종류를 펼쳐 볼 때만 나간다 — "훑어보기"와 "읽기"를 가른다.
   */
  body?: string;
}

export interface CreateSpec {
  /** 기존 API 라우트. 검증을 중복 구현하지 않기 위해 이 라우트를 그대로 호출한다. */
  api: string;
  describe: string;
  schema: JsonSchema;
  /** 도구 인자 → API 본문. 문맥(babyId 등)은 여기서 채운다. */
  toBody(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** 되돌리기용 DELETE 경로. 없으면 되돌릴 수 없는 추가로 표시된다. */
  undoApi?: (id: string) => string;
}

export interface AgentResource {
  key: string;
  label: string;
  listPath: string;
  /** "/plans/:id" — 경로 해석이 역방향으로 동작해야 하므로 함수가 아니라 패턴이다. */
  detailPattern?: string;
  catalog(): Promise<CatalogEntry[]>;
  /** 항목이 하나뿐인 리소스(아기)는 detailPattern 이 없어 경로에 id 가 없다 — 그때는 인자 없이 불린다. */
  detail?(id?: string): Promise<unknown>;
  create?: CreateSpec;
}

export function findResource(key: string, resources: AgentResource[]): AgentResource | undefined {
  return resources.find((r) => r.key === key);
}

export function detailPath(resource: AgentResource, id: string): string {
  return resource.detailPattern ? resource.detailPattern.replace(":id", id) : resource.listPath;
}

/** 경로 → {key, id}. 등록되지 않은 경로는 null (임의 경로 탐색 차단). */
export function resolvePath(
  path: string,
  resources: AgentResource[]
): { key: string; id?: string } | null {
  const clean = path.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  for (const r of resources) {
    if (clean === r.listPath) return { key: r.key, id: undefined };
    if (!r.detailPattern) continue;
    const prefix = r.detailPattern.replace("/:id", "");
    if (clean.startsWith(prefix + "/")) {
      const rest = clean.slice(prefix.length + 1);
      if (rest && !rest.includes("/")) return { key: r.key, id: rest };
    }
  }
  return null;
}
