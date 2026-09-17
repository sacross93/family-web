import { describe, it, expect } from "vitest";
import { findResource, resolvePath, detailPath, type AgentResource } from "@/lib/agent/registry";

const FAKE: AgentResource[] = [
  { key: "plan", label: "계획", listPath: "/plans", detailPattern: "/plans/:id", catalog: async () => [] },
  { key: "todo", label: "할일", listPath: "/todos", catalog: async () => [] },
];

describe("findResource", () => {
  it("키로 찾는다", () => expect(findResource("plan", FAKE)?.label).toBe("계획"));
  it("없으면 undefined", () => expect(findResource("nope", FAKE)).toBeUndefined());
});

describe("resolvePath", () => {
  it("상세 경로에서 리소스와 id를 뽑는다", () => {
    expect(resolvePath("/plans/abc123", FAKE)).toEqual({ key: "plan", id: "abc123" });
  });
  it("목록 경로는 id 없이 해석한다", () => {
    expect(resolvePath("/todos", FAKE)).toEqual({ key: "todo", id: undefined });
  });
  it("끝 슬래시와 쿼리를 무시한다", () => {
    expect(resolvePath("/plans/abc123/?x=1", FAKE)).toEqual({ key: "plan", id: "abc123" });
  });
  it("등록되지 않은 경로는 null", () => {
    expect(resolvePath("/admin", FAKE)).toBeNull();
    expect(resolvePath("/plans/a/b", FAKE)).toBeNull();
  });
  it("상세 패턴이 없는 리소스의 하위 경로는 null", () => {
    expect(resolvePath("/todos/xyz", FAKE)).toBeNull();
  });
});

describe("detailPath", () => {
  it("패턴에 id를 끼운다", () => expect(detailPath(FAKE[0], "zz")).toBe("/plans/zz"));
  it("패턴이 없으면 목록 경로", () => expect(detailPath(FAKE[1], "zz")).toBe("/todos"));
});
