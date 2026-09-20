import { describe, it, expect } from "vitest";
import { uploadKind, safeBasename } from "@/lib/uploads";

describe("uploadKind — 우리가 저장한 것만 지운다", () => {
  it("로컬 업로드", () => {
    expect(uploadKind("/uploads/abc.png")).toBe("local");
  });

  it("Vercel Blob", () => {
    expect(uploadKind("https://xyz123.public.blob.vercel-storage.com/uploads/abc.png")).toBe("blob");
  });

  it("가족이 붙여넣은 바깥 주소는 건드리지 않는다", () => {
    // 사진은 주소를 붙여넣어 담을 수도 있다. 남의 사이트 것을 지우려 들면 안 된다.
    expect(uploadKind("https://images.example.com/photo.jpg")).toBe("external");
    expect(uploadKind("https://cdn.jsdelivr.net/a.png")).toBe("external");
    expect(uploadKind(null)).toBe("external");
    expect(uploadKind("")).toBe("external");
  });

  it("호스트 이름을 흉내 낸 주소에 속지 않는다", () => {
    // endsWith 를 도메인 경계 없이 쓰면 이런 게 통과한다.
    expect(uploadKind("https://evil-blob.vercel-storage.com/x.png")).toBe("external");
    expect(uploadKind("https://public.blob.vercel-storage.com.evil.com/x.png")).toBe("external");
  });

  it("주소가 아닌 값", () => {
    expect(uploadKind("uploads/abc.png")).toBe("external"); // 앞 슬래시가 없으면 우리 규칙이 아니다
    expect(uploadKind("그냥 글자")).toBe("external");
  });
});

describe("safeBasename — 경로를 벗어나지 않는다", () => {
  it("파일 이름만 뽑는다", () => {
    expect(safeBasename("/uploads/abc.png")).toBe("abc.png");
    expect(safeBasename("https://x.public.blob.vercel-storage.com/uploads/a-b.webp")).toBe("a-b.webp");
  });

  it("쿼리는 떼어낸다", () => {
    expect(safeBasename("/uploads/abc.png?v=2")).toBe("abc.png");
  });

  it("위로 올라가려는 것은 막는다", () => {
    expect(safeBasename("/uploads/../../.env")).toBe(".env"); // basename 이 이미 잘라낸다
    expect(safeBasename("/uploads/..")).toBeNull();
    expect(safeBasename("/uploads/")).toBeNull();
  });
});
