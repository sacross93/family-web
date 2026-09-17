import { describe, it, expect } from "vitest";
import { RESOURCES } from "@/lib/agent/resources";
import { resolvePath } from "@/lib/agent/registry";

/** LLM 에게 절대 묻지 않는 내부 식별자들. 문맥은 toBody 가 DB 에서 채운다. */
const INTERNAL_IDS = ["albumId", "planId", "babyId", "authorId", "memberId", "addedById"];

describe("RESOURCES 계약", () => {
  it("key 가 중복되지 않는다", () => {
    const keys = RESOURCES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("모든 리소스가 key·label·listPath·catalog 를 갖는다", () => {
    for (const r of RESOURCES) {
      expect(r.key, `${r.key}.key`).toBeTruthy();
      expect(r.label, `${r.key}.label`).toBeTruthy();
      expect(r.listPath.startsWith("/"), `${r.key}.listPath`).toBe(true);
      expect(typeof r.catalog, `${r.key}.catalog`).toBe("function");
    }
  });

  it("추가 가능한 리소스는 되돌리기 경로를 갖는다", () => {
    for (const r of RESOURCES) {
      if (!r.create) continue;
      expect(r.create.undoApi, `${r.key}.undoApi`).toBeTypeOf("function");
      expect(r.create.undoApi!("X"), `${r.key}.undoApi`).toBe(`${r.create.api}/X`);
    }
  });

  it("추가 스키마의 required 는 properties 안에 있다", () => {
    for (const r of RESOURCES) {
      for (const req of r.create?.schema.required ?? []) {
        expect(Object.keys(r.create!.schema.properties), `${r.key}.${req}`).toContain(req);
      }
    }
  });

  it("detailPattern 이 있으면 listPath 로 시작한다", () => {
    for (const r of RESOURCES) {
      if (r.detailPattern) expect(r.detailPattern.startsWith(r.listPath)).toBe(true);
    }
  });

  it("실제 경로가 해석된다", () => {
    expect(resolvePath("/albums/abc", RESOURCES)?.key).toBe("album");
    expect(resolvePath("/plans/xyz", RESOURCES)?.key).toBe("plan");
    expect(resolvePath("/admin", RESOURCES)).toBeNull();
  });

  it("목록 경로가 겹치면 부모 리소스로 해석된다", () => {
    // 자식(photo·planItem·babyEntry …)이 부모보다 앞에 오면 이 테스트가 깨진다.
    expect(resolvePath("/albums", RESOURCES)?.key).toBe("album");
    expect(resolvePath("/plans", RESOURCES)?.key).toBe("plan");
    expect(resolvePath("/baby", RESOURCES)?.key).toBe("baby");
  });

  it("추가 스키마가 내부 식별자를 묻지 않는다", () => {
    for (const r of RESOURCES) {
      for (const prop of Object.keys(r.create?.schema.properties ?? {})) {
        expect(INTERNAL_IDS, `${r.key}.${prop}`).not.toContain(prop);
      }
    }
  });
});
