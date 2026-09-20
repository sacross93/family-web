import { describe, it, expect } from "vitest";
import { buildCatalog } from "@/lib/agent/catalog";
import type { AgentResource } from "@/lib/agent/registry";

function res(key: string, label: string, entries: { title: string; hint?: string }[]): AgentResource {
  return { key, label, listPath: `/${key}`, catalog: async () => entries };
}

/** 쿼리가 터지는 리소스. 에러 본문에 스키마가 섞여 있다고 가정한다. */
function boom(label: string): AgentResource {
  return {
    key: `x-${label}`,
    label,
    listPath: `/x-${label}`,
    catalog: async () => {
      throw new Error(`relation "Shopping" does not exist`);
    },
  };
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
    // 살리되 감추지 않는다 — 어느 리소스가 확인 안 됐는지 남긴다.
    expect(out).toContain("불러오지 못했어요");
    expect(out).toContain("고장");
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
  const FAILING = ["장보기", "기념일", "가계부"].map(boom);

  it("리소스가 많아도 소리 없이 사라지는 리소스가 없다", async () => {
    const out = await buildCatalog(crowded, 4000);

    expect(out.length).toBeLessThanOrEqual(4000);
    // 예산을 나눠 쓰므로 15종이 모두 목차에 남는다.
    expect(LABELS.filter((l) => !out.includes(`${l}(`))).toEqual([]);
  });

  it("어떤 줄도 항목 중간에서 잘리지 않는다", async () => {
    const out = await buildCatalog(crowded, 4000);

    let checked = 0;
    for (const line of out.split("\n")) {
      expect(line.endsWith("…"), line).toBe(false);
      const m = line.match(/^리소스(\d+)\(/);
      if (!m) continue; // 생략·실패 알림 줄은 항목 줄이 아니다
      checked++;
      const all = partsOf(Number(m[1]));
      const shown = shownItems(line);
      for (const item of shown) expect(all, item).toContain(item);
      // 보인 개수 + 접힌 개수 = 전체 개수
      const folded = Number(line.match(/외 (\d+)개$/)?.[1] ?? 0);
      expect(shown.length + folded, line).toBe(30);
    }
    expect(checked).toBe(15); // 항목 줄을 실제로 다 봤다
  });

  it("예산이 빠듯하면 항목 대신 이름과 개수만 남긴다", async () => {
    const long = Array.from({ length: 20 }, (_, i) => ({ title: `아주아주 긴 제목이 들어간 항목 ${i}` }));
    const out = await buildCatalog([res("todo", "할일", long)], 30);

    expect(out.length).toBeLessThanOrEqual(30);
    expect(out).toContain("할일(20)"); // 항목은 못 보여줘도 존재와 개수는 알린다
    expect(out).toContain("목록 생략");
    expect(out).not.toMatch(/외 \d+종 생략/); // 줄째로 버린 건 아니다
  });

  it("실패 표시가 붙어도 상한을 넘지 않는다", async () => {
    const out = await buildCatalog([...crowded, ...FAILING], 400);

    expect(out.length).toBeLessThanOrEqual(400);
    // 알림은 마지막 줄이고, 자리가 모자라 이름이 접힌 형태여야 한다(전체 나열도 개수형도 아니다).
    const last = out.split("\n").at(-1)!;
    expect(last).toMatch(/^일부를 불러오지 못했어요: .+ 외 \d+종$/);
    expect(last).not.toContain("기념일"); // 접혔으므로 뒤 이름은 개수로만 남는다
    // 성공한 15종도 (항목은 접히더라도) 전부 남는다.
    expect(LABELS.filter((l) => !out.includes(`${l}(`))).toEqual([]);
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

describe("buildCatalog 실패 처리", () => {
  it("전부 실패하면 '아무것도 없습니다'가 아니라 실패를 알린다", async () => {
    const out = await buildCatalog([boom("앨범"), boom("장보기")], 4000);

    expect(out).not.toContain("아무것도 없습니다"); // 없는 게 아니라 못 불러온 것이다
    expect(out).toContain("불러오지 못했어요");
    expect(out).toContain("앨범");
    expect(out).toContain("장보기");
  });

  it("실패 원인(에러 메시지)은 절대 담지 않는다", async () => {
    const out = await buildCatalog([boom("장보기"), res("todo", "할일", [{ title: "우유" }])], 4000);

    expect(out).not.toContain("relation"); // 쿼리·스키마가 LLM 에게 새면 안 된다
    expect(out).not.toContain("does not exist");
    expect(out).toContain("장보기");
  });

  it("실패한 리소스 이름이 길면 개수로 접는다", async () => {
    const long = ["가".repeat(30), "나".repeat(30), "다".repeat(30)].map(boom);

    const folded = await buildCatalog(long, 60);
    expect(folded.length).toBeLessThanOrEqual(60);
    expect(folded).toMatch(/외 \d+종$/); // 이름 일부 + 나머지 개수

    const counted = await buildCatalog(long, 25);
    expect(counted.length).toBeLessThanOrEqual(25);
    expect(counted).toMatch(/\(3종\)$/); // 이름이 아예 안 들어가면 개수만
  });
});

describe("buildCatalog 극단적인 상한", () => {
  // 운영자가 AGENT_CATALOG_MAX_CHARS 에 작은 수를 넣으면 바로 발현하는 경계.
  it("알림 문구가 안 들어가는 상한에서도 실패를 감추지 않는다", async () => {
    const out = await buildCatalog([boom("장보기"), res("todo", "할일", [{ title: "우유 사기" }])], 15);

    expect(out.length).toBeLessThanOrEqual(15);
    expect(out).not.toBe("할일(1): 우유 사기"); // 완전한 목록처럼 보이면 안 된다
    expect(out).toContain("확인 안 됨"); // 자리가 없으면 최소한의 표시라도
  });

  it("전부 실패 + 아주 작은 상한에서도 흔적이 남는다", async () => {
    const out = await buildCatalog([boom("앨범"), boom("장보기")], 18);

    expect(out.length).toBeLessThanOrEqual(18);
    expect(out).toContain("확인 안 됨");
  });

  it("빈 사이트 안내 문구도 상한을 넘지 않는다", async () => {
    const out = await buildCatalog([], 10);

    expect(out.length).toBeLessThanOrEqual(10);
    expect(out).not.toContain("아무것도 없습니다"); // 긴 문구는 들어갈 자리가 없다
  });

  it("상한이 숫자가 아니면 설정값으로 돌아간다", async () => {
    const out = await buildCatalog([res("todo", "할일", [{ title: "우유 사기" }])], Number.NaN);

    expect(out).toContain("할일(1)"); // 내용을 통째로 잃지 않는다
    expect(out.length).toBeLessThanOrEqual(4000);
  });
});

describe("목차는 본문을 싣지 않는다", () => {
  /** 글이 본체인 리소스들은 body 를 담는다. 목차는 그걸 무시해야 한다. */
  const withBodies = [
    {
      key: "babyEntry",
      label: "아기 기록",
      listPath: "/baby",
      catalog: async () => [
        { id: "e1", title: "오늘 태동을 느꼈어요", hint: "일상 · 9/18", body: "아주 긴 본문이 여기 있습니다. ".repeat(50) },
      ],
    },
    {
      key: "todo",
      label: "할일",
      listPath: "/todos",
      catalog: async () => [{ id: "t1", title: "우유 사기" }],
    },
  ];

  it("본문이 목차 줄에 들어가지 않는다 — 들어가면 한 종류가 다른 종류를 밀어낸다", async () => {
    const text = await buildCatalog(withBodies as never);
    expect(text).toContain("오늘 태동을 느꼈어요");
    expect(text).toContain("일상 · 9/18");
    expect(text).not.toContain("아주 긴 본문이 여기 있습니다.");
  });

  it("본문이 길어도 다른 리소스가 밀려나지 않는다", async () => {
    const text = await buildCatalog(withBodies as never);
    expect(text).toContain("우유 사기");
  });
});
