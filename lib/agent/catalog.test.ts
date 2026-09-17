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

/** 줄에 실제로 보이는 항목들(접힘 표시 제외). 중간에서 잘렸는지 확인하는 데 쓴다. */
function shownItems(line: string): string[] {
  const body = line.slice(line.indexOf(": ") + 2).replace(/ 외 \d+개$/, "");
  return body ? body.split(" · ") : [];
}

describe("buildCatalog 예산 배분", () => {
  // 리소스 15종 × 30개 — 실제 사이트가 조금만 커져도 나오는 규모.
  const LABELS = Array.from({ length: 15 }, (_, n) => `리소스${n}`);
  const partsOf = (n: number) =>
    Array.from({ length: 30 }, (_, i) => `리소스${n}-항목${i} 사진 ${i}장`);
  const crowded = LABELS.map((label, n) =>
    res(
      `k${n}`,
      label,
      Array.from({ length: 30 }, (_, i) => ({ title: `리소스${n}-항목${i}`, hint: `사진 ${i}장` }))
    )
  );

  it("리소스가 많아도 소리 없이 사라지는 리소스가 없다", async () => {
    const out = await buildCatalog(crowded, 4000);

    expect(out.length).toBeLessThanOrEqual(4000);
    // 예산을 나눠 쓰므로 15종이 모두 목차에 남는다.
    expect(LABELS.filter((l) => !out.includes(`${l}(`))).toEqual([]);
  });

  it("어떤 줄도 항목 중간에서 잘리지 않는다", async () => {
    const out = await buildCatalog(crowded, 4000);

    for (const line of out.split("\n")) {
      expect(line.endsWith("…"), line).toBe(false);
      const n = Number(line.match(/^리소스(\d+)\(/)![1]);
      const all = partsOf(n);
      const shown = shownItems(line);
      for (const item of shown) expect(all, item).toContain(item);
      // 보인 개수 + 접힌 개수 = 전체 개수
      const folded = Number(line.match(/외 (\d+)개$/)?.[1] ?? 0);
      expect(shown.length + folded, line).toBe(30);
    }
  });

  it("예산이 빠듯하면 항목 대신 이름과 개수만 남긴다", async () => {
    const long = Array.from({ length: 20 }, (_, i) => ({ title: `아주아주 긴 제목이 들어간 항목 ${i}` }));
    const out = await buildCatalog([res("todo", "할일", long)], 30);

    expect(out.length).toBeLessThanOrEqual(30);
    expect(out).toContain("할일(20)"); // 항목은 못 보여줘도 존재와 개수는 알린다
    expect(out).toContain("목록 생략");
    expect(out).not.toMatch(/외 \d+종 생략/); // 줄째로 버린 건 아니다
  });

  it("줄을 통째로 버릴 때는 '외 N종 생략'으로 알린다", async () => {
    const two = [{ title: "항목1" }, { title: "항목2" }];
    const out = await buildCatalog(
      [res("a", "가", two), res("b", "나", two), res("c", "라벨".repeat(10), two)],
      60
    );

    expect(out.length).toBeLessThanOrEqual(60);
    expect(out).toContain("가(2)");
    expect(out).toContain("나(2)");
    expect(out).not.toContain("라벨라벨"); // 들어갈 자리가 없던 리소스
    expect(out).toMatch(/외 1종 생략/); // 대신 사라졌다는 사실이 남는다
  });
});
