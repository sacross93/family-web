import { describe, it, expect } from "vitest";
import { buildCatalog } from "@/lib/agent/catalog";
import type { AgentResource } from "@/lib/agent/registry";

function res(key: string, label: string, entries: { title: string; hint?: string }[]): AgentResource {
  return { key, label, listPath: `/${key}`, catalog: async () => entries };
}

describe("buildCatalog", () => {
  it("리소스별로 한 줄씩 만든다", async () => {
    const out = await buildCatalog([
      res("album", "앨범", [{ title: "발리 여행", hint: "사진 12" }, { title: "제주" }]),
    ], 4000);
    expect(out).toContain("앨범(2)");
    expect(out).toContain("발리 여행 사진 12");
    expect(out).toContain("제주");
  });

  it("빈 리소스는 줄을 만들지 않는다", async () => {
    const out = await buildCatalog([res("todo", "할일", [])], 4000);
    expect(out).not.toContain("할일");
  });

  it("상한을 넘으면 뒷부분을 접고 '외 N개'로 표시한다", async () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ title: `항목${i}` }));
    const out = await buildCatalog([res("todo", "할일", many)], 120);
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out).toMatch(/외 \d+개/);
  });

  it("리소스 하나가 실패해도 나머지는 살린다", async () => {
    const broken: AgentResource = {
      key: "x", label: "고장", listPath: "/x",
      catalog: async () => { throw new Error("boom"); },
    };
    const out = await buildCatalog([broken, res("todo", "할일", [{ title: "우유 사기" }])], 4000);
    expect(out).toContain("우유 사기");
    expect(out).not.toContain("boom");
  });

  it("전부 비었으면 안내 문구를 반환한다", async () => {
    expect(await buildCatalog([], 4000)).toContain("아직 아무것도 없습니다");
  });
});
