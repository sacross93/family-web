// 화면을 **써 본다** — 보는 것으로는 못 찾는 것들이 있다.
//
// 세 번 연속 그랬다:
//   - 아기: 기록은 써지는데 **고치기가 안 됐다**. `…` 가 떠 있던 버튼에 덮여
//     누르면 AI 채팅이 열렸다.
//   - 계획: 아래로 내려간 채 `…` 를 누르면 **아무 일도 안 일어났다**.
//     메뉴가 열리자마자 스크롤 이벤트에 스스로 닫혔다(폰의 관성 스크롤에서도 같다).
//   - 장보기: 체크가 되는지 "담은 것" 글자만 보고 넘어갔는데, 그건 이미 있던 글자라
//     검사가 공허하게 통과했다.
// 스크린샷은 이런 것을 하나도 안 알려 준다.
//
// 쓰기:  npm run dev  (다른 터미널)
//        node scripts/ui-flows.mjs [기준URL] [아이디] [비밀번호]
//
// **`npm run dev` 여야 한다. `npm start`(운영 빌드)로 돌리면 사진 검사가 거짓이 된다.**
// 로컬에서 올린 사진은 `public/uploads/` 에 쓰이는데, 운영 빌드는 빌드 시점의 목록만
// 내주므로 **방금 올린 파일이 404 가 난다.** 그래도 `<img>` 태그는 DOM 에 있어서
// "올린 사진이 보인다" 류의 검사는 통과해 버린다 — 실제로 오래 그랬고,
// 매번 찍히던 "콘솔 오류: 404" 가 그 흔적이었다(운영은 Blob 절대주소라 무관하다).
//
// **로컬에서만 돌릴 것.** 실제로 만들고 지운다. 만든 것은 각 흐름 끝에서 되돌린다.
// playwright 찾는 방법은 ui-audit.mjs 와 같다.

import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync, statSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { homedir, tmpdir } from "node:os";

const BASE = process.argv[2] || "http://localhost:3000";
const USER = process.argv[3] || process.env.AUDIT_USER;
const PASS = process.argv[4] || process.env.AUDIT_PASS;
const MARK = "포동UI점검";
// 사진 올리기 시험용 8×8 PNG. 파일을 안 남기려고 그때그때 만든다.
const IMG = join(tmpdir(), "podong-ui-flows.png");
/**
 * 폰 카메라 원본만 한 **투명 PNG**. 앨범·스티커는 이걸 바이트 그대로 저장해야 하고,
 * 글 속 사진은 줄이되 투명을 지켜야 한다. 왼쪽 위 TRANSPARENT×TRANSPARENT 칸이 완전히 투명하다.
 * 잡음이라 ~16MB — proxy 의 본문 상한(기본 10MB, 넘으면 **조용히 잘린다**)도 같이 밟는다.
 */
const BIG_IMG = join(tmpdir(), "podong-ui-flows-big.png");
const BIG_W = 2400;
const BIG_H = 1800;
const TRANSPARENT = 600;

if (!USER || !PASS) {
  console.error("사용법: node scripts/ui-flows.mjs [기준URL] <아이디> <비밀번호>");
  process.exit(1);
}
if (!/localhost|127\.0\.0\.1/.test(BASE)) {
  console.error("이 스크립트는 실제로 만들고 지웁니다. 로컬에서만 돌려 주세요.");
  process.exit(1);
}

function findPlaywright() {
  for (const root of [join(process.cwd(), "node_modules"), join(homedir(), ".npm/_npx")]) {
    if (!existsSync(root)) continue;
    const direct = join(root, "playwright/index.mjs");
    if (existsSync(direct)) return direct;
    for (const d of readdirSync(root)) {
      const p = join(root, d, "node_modules/playwright/index.mjs");
      if (existsSync(p)) return p;
    }
  }
  return null;
}

function findChromium() {
  for (const dir of [join(homedir(), "Library/Caches/ms-playwright"), join(homedir(), ".cache/ms-playwright")]) {
    if (!existsSync(dir)) continue;
    for (const s of readdirSync(dir).filter((d) => d.startsWith("chromium")).sort().reverse()) {
      for (const rel of [
        "chrome-headless-shell-mac-arm64/chrome-headless-shell",
        "chrome-headless-shell-linux/chrome-headless-shell",
        "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
        "chrome-linux/chrome",
      ]) {
        const p = join(dir, s, rel);
        if (existsSync(p)) return p;
      }
    }
  }
  return undefined;
}

const pw = findPlaywright();
if (!pw) {
  console.error("playwright 를 못 찾았어요. `npx playwright install chromium` 뒤에 다시.");
  process.exit(1);
}
const { chromium } = await import(pw);

/**
 * 잡음으로 채운 PNG 한 장을 만든다(의존성 없이).
 *
 * 잡음이라야 압축이 안 먹혀 **진짜 큰 파일**이 된다 — 단색 2400×1800 은 몇 KB 라
 * "줄었다" 를 증명하지 못한다. PNG 는 IHDR·IDAT(zlib)·IEND 세 덩어리면 된다.
 */
function makeNoisePng(path, width, height, transparent = 0) {
  const crc32 = (buf) => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: truecolor + alpha
  // 잡음은 불투명(알파 255), 왼쪽 위 칸만 완전히 투명(0,0,0,0).
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const at = row + 1 + x * 4;
      if (x < transparent && y < transparent) continue; // Buffer.alloc 이 이미 0
      raw[at] = (Math.random() * 256) | 0;
      raw[at + 1] = (Math.random() * 256) | 0;
      raw[at + 2] = (Math.random() * 256) | 0;
      raw[at + 3] = 255;
    }
  }
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ])
  );
}
makeNoisePng(BIG_IMG, BIG_W, BIG_H, TRANSPARENT);
const window_bigSize = statSync(BIG_IMG).size;
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const BIG_SHA = sha256(BIG_IMG);

// 사진 올리기 시험용 8×8 PNG 를 임시로 만든다.
writeFileSync(
  IMG,
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAJUlEQVR42mNkYPhfz0AEYBxVSF+FjAxkKmRkGFVIX4WMDGQqBAA3+wH7ZxbqrQAAAABJRU5ErkJggg==",
    "base64"
  )
);

const browser = await chromium.launch({ executablePath: findChromium() });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message.slice(0, 110)));
page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 110)));
page.on("dialog", (d) => d.accept());

let failed = 0;
let total = 0;
const step = async (name, fn) => {
  total++;
  try {
    await fn();
    console.log("  ✓", name);
  } catch (e) {
    failed++;
    console.log("  ✗", name, "—", String(e).split("\n")[0].slice(0, 130));
  }
};

/** 그 카드의 `…` 를 연다. 카드가 어느 레이아웃에 있든 글로 찾는다. */
const openMenu = async (root, text) => {
  const idx = await page.evaluate(
    ([sel, t]) => [...document.querySelectorAll(sel)].findIndex((n) => (n.textContent || "").includes(t)),
    [root, text]
  );
  if (idx < 0) throw new Error("카드를 못 찾겠다");
  await page.locator(root).nth(idx).getByRole("button", { name: "더보기" }).click();
  await page.waitForTimeout(350);
};
const menuItem = (label) => page.locator(`[data-item-menu] button:has-text("${label}")`);
const text = () => page.evaluate(() => document.body.innerText);

// 올린 파일이 실제로 지워지는지 — DB 행만 지우고 파일을 남기면 무료 용량을 계속 먹고,
// 주소를 아는 사람은 "지운" 사진을 그대로 볼 수 있다.
const uploadDir = join(process.cwd(), "public", "uploads");
const uploadNames = () =>
  existsSync(uploadDir) ? readdirSync(uploadDir).filter((f) => !f.startsWith(".")) : [];
const fileCount = () => uploadNames().length;
/** 조건이 맞을 때까지 기다린다 — 큰 사진은 올리는 데 몇 초가 걸린다(고정 대기는 거짓 실패·거짓 통과를 낳는다). */
const until = async (what, fn, ms = 60000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`기다려도 안 된다 — ${what}`);
    await page.waitForTimeout(300);
  }
};
/** 이 묶음 안에서 새로 생긴 업로드 파일 하나. 둘 이상이면 무엇을 쟀는지 모르니 실패. */
const newUpload = (before) => {
  const fresh = uploadNames().filter((f) => !before.includes(f));
  if (fresh.length !== 1) throw new Error(`새 파일이 ${fresh.length}개 — 하나여야 잴 수 있다`);
  return fresh[0];
};
/** 저장된 파일이 원본과 바이트 하나까지 같은가. */
const assertByteIdentical = (name) => {
  const path = join(uploadDir, name);
  const got = sha256(path);
  if (got !== BIG_SHA) {
    throw new Error(
      `원본이 아니다 — ${name} ${(statSync(path).size / 1024) | 0}KB (원본 ${(window_bigSize / 1024) | 0}KB), sha256 다름`
    );
  }
};

await page.goto(BASE + "/login");
await page.getByRole("textbox", { name: "아이디" }).fill(USER);
await page.getByRole("textbox", { name: "비밀번호" }).fill(PASS);
await page.getByRole("button", { name: "로그인" }).click();
await page.waitForURL(BASE + "/");

// ── 장보기 ──────────────────────────────────────────────
// ── 지난 번에 흘린 것 치우기 ─────────────────────────────
//
// 한 단계가 실패하면 그 흐름이 만든 것이 남는다. 그러면 **다음 판이 엉뚱하게 실패한다** —
// "지웠는데 서버엔 남아 있다" 는 사실 지난 판의 찌꺼기였다. 한 번 그랬다.
// 시작할 때 MARK 가 붙은 것을 전부 걷어내면 몇 번을 돌려도 같은 결과가 나온다.
{
  const swept = await page.evaluate(async (mark) => {
    // `baby-entries` 는 여기 못 넣는다 — 그 컬렉션에는 **GET 이 없다**(POST 만 있다).
    // 넣었더니 405 가 콘솔 오류로 찍혔고, 목록을 못 받으니 치우지도 못했다.
    // 대신 아기 기록은 만들 때 **id 를 받아 두었다가** 그 흐름 끝에서 직접 지운다(아래).
    const paths = ["anniversaries", "todos", "shopping", "plans", "albums", "board"];
    let n = 0;
    for (const path of paths) {
      const list = await fetch(`/api/${path}`).then((r) => (r.ok ? r.json() : [])).catch(() => []);
      for (const it of Array.isArray(list) ? list : []) {
        const label = `${it.title ?? ""}${it.name ?? ""}${it.text ?? ""}${it.content ?? ""}`;
        if (!label.includes(mark)) continue;
        await fetch(`/api/${path}/${it.id}`, { method: "DELETE" }).catch(() => {});
        n++;
      }
    }
    // 태명에 MARK 가 붙은 임신 = 지난 판의 찌꺼기. 남으면 로컬이 임신 단계로 굳어
    // 다음 판의 단계 흐름이 조용히 건너뛰어진다. 지우기(keep:false)로 치운다.
    const b = await fetch("/api/baby").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (b?.active?.nickname?.includes(mark)) {
      await fetch(`/api/pregnancy/${b.active.id}/end`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keep: false }),
      }).catch(() => {});
      n++;
    }
    return n;
  }, MARK);
  if (swept > 0) console.log(`(지난 판의 찌꺼기 ${swept}개를 치웠어요)`);
}

console.log("장보기");
await page.goto(BASE + "/shopping", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const NAME = MARK + "두부";

// 어느 칸에 있는지 체크 상태로 본다 — "담은 것" 글자는 이미 있을 수 있어 공허하다.
const whereIs = (n) =>
  page.evaluate((x) => {
    const row = [...document.querySelectorAll("li")].find((li) => (li.textContent || "").includes(x));
    if (!row) return "없음";
    return row.querySelector('[role="checkbox"]')?.getAttribute("aria-checked") === "true" ? "담은 것" : "살 것";
  }, n);

await step("이름만 적고 엔터로 담기", async () => {
  const i = page.getByPlaceholder(/무엇을 살까요/);
  await i.fill(NAME);
  await i.press("Enter");
  await page.waitForTimeout(800);
  if ((await whereIs(NAME)) !== "살 것") throw new Error("담은 게 안 보인다");
  if ((await i.inputValue()) !== "") throw new Error("담은 뒤 입력칸이 안 비워졌다");
});

await step("이름을 눌러도 체크된다 — 마트에서 동그라미를 겨누지 않게", async () => {
  // 줄 전체가 체크 버튼이다. 동그라미(24px)가 아니라 **글자**를 눌러 본다 —
  // 한 손으로 쓰는 화면에서 실제로 손가락이 닿는 자리가 거기다.
  const label = page.getByText(NAME, { exact: true }).first();
  const box = await label.boundingBox();
  if (!box) throw new Error("이름이 안 보인다");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(900);
  if ((await whereIs(NAME)) !== "담은 것") throw new Error("이름을 눌렀는데 체크가 안 됐다");
});

await step("완료 비우기 — 새로고침해도 안 되살아난다", async () => {
  await page.getByRole("button", { name: /완료 .*비우기/ }).click();
  await page.waitForTimeout(1000);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  if ((await whereIs(NAME)) !== "없음") throw new Error("서버엔 안 지워졌다");
});

await step("다른 사람이 담은 것·지운 것이 새로고침 없이 보인다 — 홈 화면 앱엔 새로고침 버튼이 없다", async () => {
  // 화면의 React 상태는 이 요청을 모른다 — 다른 가족의 폰이나 포동이(서버에서 담는다)가 담은 것과 같다.
  // 예전 화면은 처음 받은 목록만 들고 있어서, 다시 열기 전에는 영영 안 보였다.
  const OTHER = MARK + "다른집두부";
  const id = await page.evaluate(async (n) => {
    const r = await fetch("/api/shopping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n }),
    });
    if (!r.ok) throw new Error(`담기 ${r.status}`);
    return (await r.json()).id;
  }, OTHER);
  try {
    // 5초마다 다시 읽는다 — 12초면 두 번은 돈다. 새로고침은 하지 않는다(그게 시험하는 것이다).
    await until("다른 사람이 담은 것이 새로고침 없이 '살 것' 에 뜬다", async () => (await whereIs(OTHER)) === "살 것", 12000);
  } finally {
    // 실패해도 남기지 않는다(남으면 다음 판의 쓸기가 치우긴 한다).
    await page.evaluate((i) => fetch(`/api/shopping/${i}`, { method: "DELETE" }), id);
  }
  await until("다른 사람이 지운 것이 새로고침 없이 사라진다", async () => (await whereIs(OTHER)) === "없음", 12000);
});

// ── 게시판 ──────────────────────────────────────────────
console.log("게시판");
await page.goto(BASE + "/board", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const NOTES = "[class*='columns'] > *";

await step("접힌 작성칸을 펼쳐 마크다운으로 쓰기", async () => {
  await page.getByRole("button", { name: /한마디 남기기/ }).click();
  await page.waitForTimeout(500);
  await page.locator("textarea").first().fill(`**${MARK}** 오늘 저녁은\n- 김치찌개\n- 계란말이`);
  await page.getByRole("button", { name: /붙이기/ }).click();
  await page.waitForTimeout(1200);
  const r = await page.evaluate((m) => {
    const el = [...document.querySelectorAll("strong")].find((e) => e.textContent.includes(m));
    return { 굵게: !!el, 목록: !!el?.closest("div")?.querySelector("li") };
  }, MARK);
  if (!r.굵게) throw new Error("**굵게** 가 글자 그대로 나온다");
  if (!r.목록) throw new Error("- 목록이 글머리로 안 바뀐다");
});

await step("붙인 뒤 작성칸이 다시 접힌다", async () => {
  if (await page.locator("textarea").first().isVisible()) throw new Error("펼친 채로 남아 있다");
});

await step("맨 위에 고정", async () => {
  await openMenu(NOTES, MARK);
  await menuItem("맨 위에 고정").click();
  await page.waitForTimeout(1000);
  const first = await page.evaluate(
    ([sel, m]) => ((document.querySelectorAll(sel)[0] || {}).textContent || "").includes(m),
    [NOTES, MARK]
  );
  if (!first) throw new Error("맨 위로 안 간다");
});

await step("고치기", async () => {
  await openMenu(NOTES, MARK);
  await menuItem("수정").click();
  await page.waitForTimeout(700);
  await page.locator("textarea").first().fill(`**${MARK}** 저녁 바꿈 — 된장찌개`);
  await page.getByRole("button", { name: /저장/ }).last().click();
  await page.waitForTimeout(1100);
  if (!(await text()).includes("된장찌개")) throw new Error("고친 게 안 보인다");
});

await step("글 안에 넣은 사진이 같이 지워진다 — 다른 글이 쓰면 남는다", async () => {
  const base = fileCount();
  // 사진이 든 쪽지 하나
  await page.getByRole("button", { name: /한마디 남기기/ }).click();
  await page.waitForTimeout(600);
  await page.locator("textarea").first().fill(MARK + "사진A");
  await page.locator('input[type="file"]').first().setInputFiles(IMG);
  await page.waitForTimeout(2500);
  const url = (await page.locator("textarea").first().inputValue()).match(/!\[\]\(([^)]+)\)/)?.[1];
  if (!url) throw new Error("사진이 본문에 안 들어갔다");
  await page.getByRole("button", { name: /붙이기/ }).click();
  await page.waitForTimeout(1500);
  if (fileCount() !== base + 1) throw new Error("파일이 안 생겼다");

  // 같은 사진을 쓰는 쪽지 하나 더
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: /한마디 남기기/ }).click();
  await page.waitForTimeout(600);
  await page.locator("textarea").first().fill(`${MARK}사진B ![](${url})`);
  await page.getByRole("button", { name: /붙이기/ }).click();
  await page.waitForTimeout(1500);

  // 한쪽만 지우면 사진은 남아야 한다
  await openMenu(NOTES, MARK + "사진A");
  await menuItem("삭제").click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "지우기", exact: true }).click();
  await page.waitForTimeout(1800);
  if (fileCount() !== base + 1) throw new Error("다른 글이 쓰는 사진을 지워 버렸다");

  // 마지막까지 지우면 사진도 지워진다
  await page.reload({ waitUntil: "networkidle" });
  await openMenu(NOTES, MARK + "사진B");
  await menuItem("삭제").click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "지우기", exact: true }).click();
  await page.waitForTimeout(1800);
  if (fileCount() !== base) throw new Error("아무도 안 쓰는데 사진이 남았다");
});

await step("글 속 사진은 줄이되 투명은 지킨다 — PNG 로, 빈 곳은 알파 0", async () => {
  // 글 속 사진은 긴 변 2000px 로 줄인다. 예전엔 무조건 JPEG 로 다시 눌러 투명한 곳이 검게 칠해졌다.
  const before = uploadNames();
  let postId = null;
  try {
    await page.getByRole("button", { name: /한마디 남기기/ }).click();
    await page.waitForTimeout(600);
    const ta = page.locator("textarea").first();
    await ta.fill(MARK + "투명");
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "사진", exact: true }).click(),
    ]);
    await chooser.setFiles(BIG_IMG);
    const url = await until("본문에 사진이 들어간다", async () =>
      (await ta.inputValue()).match(/!\[\]\(([^)]+)\)/)?.[1]
    );
    const name = newUpload(before);
    if (!url.endsWith("/" + name)) throw new Error(`본문 주소가 새 파일이 아니다: ${url}`);
    const head = readFileSync(join(uploadDir, name)).subarray(0, 8).toString("hex");
    if (head !== "89504e470d0a1a0a") throw new Error(`PNG 가 아니다 — ${name} 머리 ${head}`);
    // 줄이는 갈래가 **실제로 돌았는지**(원본이 그대로 돌아온 게 아닌지)와, 투명한 칸이 투명한지를
    // 브라우저에서 그려서 본다. 원본 (150,150) = 투명 칸 한가운데, (1800,1200) = 잡음(불투명).
    const px = await page.evaluate(async ([u, W]) => {
      const img = new Image();
      img.src = u;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const k = img.naturalWidth / W;
      const a = (x, y) => ctx.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data[3];
      return { w: img.naturalWidth, clear: a(150, 150), solid: a(1800, 1200) };
    }, [url, BIG_W]);
    if (px.w !== 2000) throw new Error(`줄이지 않았다 — 가로 ${px.w}px (2000 이어야). 투명 검사가 공허해진다`);
    if (px.solid !== 255) throw new Error(`잡음 칸이 불투명이 아니다(알파 ${px.solid}) — 엉뚱한 걸 쟀다`);
    if (px.clear !== 0) throw new Error(`투명한 칸이 칠해졌다 — 알파 ${px.clear}`);
    console.log(`      ${BIG_W}px → ${px.w}px PNG · 투명 칸 알파 ${px.clear} · 잡음 칸 알파 ${px.solid}`);

    await page.getByRole("button", { name: /붙이기/ }).click();
    await page.waitForTimeout(1200);
    postId = await page.evaluate(async (m) => {
      const list = await fetch("/api/board").then((r) => r.json());
      return list.find((p) => (p.content || "").includes(m + "투명"))?.id ?? null;
    }, MARK);
    if (!postId) throw new Error("쪽지가 안 붙었다");
  } finally {
    if (postId) await page.evaluate((id) => fetch(`/api/board/${id}`, { method: "DELETE" }), postId);
    else {
      // 쪽지에 못 붙은 사진은 아무도 안 치운다(주인이 없다) — 로컬 파일이니 직접 지운다.
      for (const f of uploadNames().filter((n) => !before.includes(n))) unlinkSync(join(uploadDir, f));
    }
    await page.reload({ waitUntil: "networkidle" });
  }
  if (fileCount() !== before.length) throw new Error(`쪽지를 지웠는데 사진이 남았다 — ${before.length} → ${fileCount()}`);
});

await step("지우기 전에 한 번 묻는다 — 취소하면 그대로 있다", async () => {
  // 가족이 쓴 말은 다시 만들 수 없다. 잘못 눌러 사라지면 안 된다.
  await openMenu(NOTES, MARK);
  await menuItem("삭제").click();
  await page.waitForTimeout(700);
  if (!(await text()).includes("지울까요?")) throw new Error("묻지 않고 바로 지운다");
  await page.getByRole("button", { name: "그대로 두기" }).click();
  await page.waitForTimeout(900);
  if (!(await text()).includes(MARK)) throw new Error("취소했는데 지워졌다");
});

await step("지우기 — 새로고침해도 안 되살아난다", async () => {
  await openMenu(NOTES, MARK);
  await menuItem("삭제").click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "지우기", exact: true }).click();
  await page.waitForTimeout(1100);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  if ((await text()).includes(MARK)) throw new Error("서버엔 안 지워졌다");
});

// ── 계획 ────────────────────────────────────────────────
console.log("계획");
await page.goto(BASE + "/plans", { waitUntil: "networkidle" });
await page.waitForTimeout(400);

await step("계획 만들고 상세로 들어가기", async () => {
  await page.getByRole("button", { name: /새 계획/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByLabel("제목").or(page.getByPlaceholder(/제목|예:/)).first().fill(MARK);
  await page.getByRole("button", { name: /^만들기$|^추가$|^저장$/ }).last().click();
  await page.waitForTimeout(1200);
  await page.getByText(MARK).first().click();
  await page.waitForTimeout(1200);
  if (!page.url().includes("/plans/")) throw new Error("상세로 안 간다");
});

await step("추천 칩으로 준비물 담기", async () => {
  const chip = page.getByRole("button", { name: /^\+ / }).first();
  const label = (await chip.textContent()).replace("+ ", "").trim();
  await chip.click();
  await page.waitForTimeout(900);
  if (!(await page.getByRole("checkbox", { name: label }).count())) throw new Error(`"${label}" 이 안 담겼다`);
});

await step("체크하면 '챙긴 것' 으로 접히고 펼치면 보인다", async () => {
  const i = page.getByPlaceholder("직접 추가…").first();
  await i.fill(MARK + "젖병");
  await i.press("Enter");
  await page.waitForTimeout(900);
  await page.getByRole("checkbox", { name: MARK + "젖병" }).click();
  await page.waitForTimeout(900);
  if (!(await text()).includes("챙긴 것")) throw new Error("안 접힌다");
  await page.getByRole("button", { name: /챙긴 것/ }).first().click();
  await page.waitForTimeout(400);
  if (!(await page.getByRole("checkbox", { name: MARK + "젖병" }).isVisible())) throw new Error("펼쳐도 안 보인다");
});

await step("여정 추가", async () => {
  await page.getByRole("button", { name: /일정 추가/ }).first().click();
  await page.waitForTimeout(700);
  await page.getByPlaceholder(/성산일출봉 등반|내용/).first().fill(MARK + "출발");
  await page.getByRole("button", { name: /^추가$|^저장$/ }).last().click();
  await page.waitForTimeout(1100);
  if (!(await text()).includes(MARK + "출발")) throw new Error("여정이 안 보인다");
});

await step("아래로 내려간 채로 히어로의 … 열기", async () => {
  // 관성 스크롤 중에 눌러도 열려야 한다 — 열자마자 스스로 닫히면 아무 일도 안 일어난다.
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "더보기" }).first().click();
  await page.waitForTimeout(500);
  const items = await page.evaluate(() => [...document.querySelectorAll("[data-item-menu] button")].map((b) => b.textContent.trim()));
  if (!items.includes("계획 삭제")) throw new Error("메뉴가 안 열린다: " + JSON.stringify(items));
});

await step("계획 지우기 — 확인을 거친다", async () => {
  await menuItem("계획 삭제").click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "지우기", exact: true }).click();
  await page.waitForTimeout(1500);
  if ((await text()).includes(MARK)) throw new Error("지웠는데 남아 있다");
});


console.log("앨범");
const filesBefore = fileCount();
await page.goto(BASE + "/albums", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await step("앨범 만들기", async () => {
  await page.getByRole("button", { name: /새 앨범|첫 앨범/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByPlaceholder(/앨범 이름|예:/).first().fill(MARK + "앨범");
  await page.getByRole("button", { name: /^만들기$|^추가$|^저장$/ }).last().click();
  await page.waitForTimeout(1300);
  if (!(await text()).includes(MARK + "앨범")) throw new Error("만든 앨범이 안 보인다");
});
await step("앨범 열기", async () => {
  await page.getByText(MARK + "앨범").first().click();
  await page.waitForTimeout(1300);
  if (!page.url().includes("/albums/")) throw new Error("상세로 안 간다: " + page.url());
});
await step("저장 공간이 차면 '저장 공간이 거의 찼어요' 가 뜬다 — 흔한 실패 문구가 아니라", async () => {
  // 서버의 문지기(lib/upload-guard.ts)가 507 STORAGE_FULL 을 주는 상황을 흉내 낸다 — 진짜로 채우지 않는다.
  // 화면이 그 코드를 알아보고 관리자에게 알리라고 말하는지(배선)를 본다.
  // **따로 연 탭에서** 한다: 가로채기를 건 탭은 풀어도 그 뒤 큰 사진 새로고침이 networkidle 에 30초를 넘겼다.
  const before = uploadNames();
  const tab = await ctx.newPage();
  let hit = 0;
  await tab.route(/\/api\/upload(\/token)?$/, (route) => {
    if (route.request().method() !== "POST") return route.continue();
    hit++;
    return route.fulfill({
      status: 507,
      contentType: "application/json",
      body: JSON.stringify({ error: "사진 저장 공간이 거의 찼어요.", code: "STORAGE_FULL" }),
    });
  });
  try {
    await tab.goto(page.url(), { waitUntil: "networkidle" });
    await tab.getByRole("button", { name: /사진 추가/ }).first().click();
    await tab.waitForTimeout(700);
    const dlg = tab.locator('[role="dialog"]').filter({ hasText: "여기로 사진을 끌어다 놓으세요" });
    await dlg.locator('input[type="file"]').setInputFiles([IMG, IMG]);
    await until("저장 공간 문구", async () => (await dlg.innerText()).includes("저장 공간이 거의 찼어요"), 15000);
    if ((await dlg.innerText()).includes("사진을 못 올렸어요")) throw new Error("흔한 실패 문구가 같이 떴다");
    if (hit !== 1) throw new Error(`찬 뒤에도 계속 올렸다 — 요청 ${hit}번(첫 장에서 멈춰야)`);
    if (uploadNames().length !== before.length) throw new Error("거절됐는데 파일이 생겼다");
  } finally {
    await tab.close();
  }
});
await step("앨범 사진은 원본 그대로 저장된다 — 투명 PNG 도 바이트 그대로", async () => {
  // 가족이 고른 방향: 사진첩은 **원본으로 저장**(줄이지도, 다시 누르지도 않는다).
  // 예전에는 올리기 전에 2000px JPEG 로 다시 눌러서, 투명 PNG 의 빈 곳이 검게 칠해졌다.
  const before = uploadNames();
  await page.getByRole("button", { name: /사진 추가/ }).first().click();
  await page.waitForTimeout(700);
  const dlg = page.locator('[role="dialog"]').filter({ hasText: "여기로 사진을 끌어다 놓으세요" });
  await dlg.locator('input[type="file"]').setInputFiles(BIG_IMG);
  // 앨범에 적히기까지(올리기 → /api/photos) 기다린다.
  await until("1장 추가됨", async () => (await dlg.innerText()).includes("1장 추가됨"));
  const name = newUpload(before);
  assertByteIdentical(name);
  console.log(`      ${BIG_W}×${BIG_H} ${(window_bigSize / 1024 / 1024).toFixed(1)}MB → 저장 ${name} (sha256 같음)`);

  // 화면에는 줄인 것이 간다 — 격자의 그 사진이 최적화 주소로 뜨고 실제로 그려지는가.
  //
  // ⚠️ 새로고침 **전에** 방금 붙은 격자 사진이 다 받아지기를 기다린다. 최적화 도중에 새로고침으로 요청을 끊으면
  // 개발 서버의 최적화가 **그 주소만 영영 대답하지 않는다**(실측: 같은 사진의 w=384 는 바로 오는데 끊긴 w=256 은
  // curl 로 2분을 기다려도 안 왔다 — 진행 중 요청을 묶어 두는 자리가 안 풀린다). 그러면 새로고침이 30초를 넘긴다.
  const decoded = (n) =>
    page.evaluate(async (name) => {
      const img = [...document.querySelectorAll("img")].find((i) =>
        (i.getAttribute("src") || "").includes(encodeURIComponent("/uploads/" + name))
      );
      if (!img) return false;
      img.scrollIntoView({ block: "center" }); // loading="lazy" — 화면에 들어와야 받는다
      await img.decode().catch(() => {});
      return img.naturalWidth > 0;
    }, n);
  await page.keyboard.press("Escape");
  await until("붙은 사진이 그려진다", () => decoded(name), 60000);
  await page.reload({ waitUntil: "networkidle" });
  const shot = await page.evaluate(async (n) => {
    const img = [...document.querySelectorAll("img")].find((i) =>
      (i.getAttribute("src") || "").includes(encodeURIComponent("/uploads/" + n))
    );
    if (!img) return null;
    img.scrollIntoView({ block: "center" });
    await img.decode().catch(() => {});
    return {
      src: img.getAttribute("src"),
      srcset: img.getAttribute("srcset") || "",
      current: img.currentSrc,
      w: img.naturalWidth,
    };
  }, name);
  if (!shot) throw new Error("격자에 그 사진이 최적화 주소로 안 뜬다(원본을 그대로 받는다)");
  if (!shot.src.startsWith("/_next/image?")) throw new Error("최적화 주소가 아니다: " + shot.src.slice(0, 80));
  if (!/ \d+w(,|$)/.test(shot.srcset)) throw new Error("srcset 에 w 표시가 없다");
  if (!shot.current.includes("/_next/image")) throw new Error("원본으로 떨어졌다(최적화 실패) — " + shot.current.slice(0, 80));
  if (!shot.w) throw new Error("그려지지 않았다 — naturalWidth 0");
  console.log(`      격자: ${shot.current.match(/w=\d+/)?.[0]} 로 받아 그림(가로 ${shot.w}px)`);
});
await step("새로고침해도 사진이 남아 있다", async () => {
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const imgs = await page.evaluate(() => [...document.querySelectorAll("img")].filter(i => /uploads|blob/.test(i.src)).length);
  if (!imgs) throw new Error("새로고침하니 사라졌다");
});
await step("앨범 지우기 — 올린 파일도 같이 지워진다", async () => {
  await page.getByRole("button", { name: "더보기" }).first().click();
  await page.waitForTimeout(350);
  await page.locator('[data-item-menu] button:has-text("앨범 삭제")').click();
  await page.waitForTimeout(600);
  const confirm = page.getByRole("button", { name: /^삭제$|지우기|확인/ }).last();
  if (await confirm.count()) await confirm.click();
  await page.waitForTimeout(1500);
  await page.goto(BASE + "/albums", { waitUntil: "networkidle" });
  if ((await text()).includes(MARK + "앨범")) throw new Error("지웠는데 남아 있다");
  const after = fileCount();
  if (after !== filesBefore) {
    throw new Error(`파일이 남았다: ${filesBefore}개 → ${after}개`);
  }
});

console.log("할일");
await page.goto(BASE + "/todos", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await step("할일 추가", async () => {
  await page.getByRole("button", { name: /할일 추가/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByPlaceholder(/할일|예:/).first().fill(MARK + "우체국");
  await page.getByRole("button", { name: /^추가$|^저장$/ }).last().click();
  await page.waitForTimeout(1200);
  if (!(await text()).includes(MARK + "우체국")) throw new Error("안 보인다");
});
await step("체크하면 줄이 그어진다", async () => {
  await page.getByRole("checkbox", { name: MARK + "우체국" }).click();
  await page.waitForTimeout(900);
  const struck = await page.evaluate((m) => {
    const el = [...document.querySelectorAll("*")].find(e => e.children.length === 0 && (e.textContent||"").trim() === m);
    return el ? getComputedStyle(el).textDecorationLine.includes("line-through") : false;
  }, MARK + "우체국");
  if (!struck) throw new Error("체크해도 줄이 안 그어진다");
});
await step("할일 지우기", async () => {
  // **그 줄의** `…` 를 연다. 화면의 첫 `…` 를 누르면 **다른 할일이 지워지고** 우리가 만든 건
  // 남아서, 검사가 "서버엔 안 지워졌다" 고 엉뚱하게 실패한다(시드를 다시 깔자마자 그랬다).
  // 자리로 짚지 말 것 — 운영에서 한 번 아찔했던 것과 같은 실수다.
  await openMenu("li", MARK + "우체국");
  await page.locator('[data-item-menu] button:has-text("삭제")').click();
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  if ((await text()).includes(MARK + "우체국")) throw new Error("서버엔 안 지워졌다");
});

console.log("캘린더");
await page.goto(BASE + "/calendar", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await step("일정 추가", async () => {
  await page.getByRole("button", { name: /일정 추가/ }).first().click();
  await page.waitForTimeout(700);
  await page.getByPlaceholder(/제목|예:/).first().fill(MARK + "검진");
  await page.getByRole("button", { name: /^추가$|^저장$/ }).last().click();
  await page.waitForTimeout(1300);
  if (!(await text()).includes(MARK + "검진")) throw new Error("목록에 안 보인다");
});
await step("목록/달력 전환", async () => {
  await page.getByRole("button", { name: "달력" }).click();
  await page.waitForTimeout(600);
  if (!(await text()).includes("일")) throw new Error("달력이 안 나온다");
  await page.getByRole("button", { name: "목록" }).click();
  await page.waitForTimeout(500);
  if (!(await text()).includes(MARK + "검진")) throw new Error("목록으로 안 돌아온다");
});
await step("고른 보기를 기억한다 — 새로고침해도 달력 그대로", async () => {
  // 매번 목록으로 돌아가서, 달력을 보려면 들어올 때마다 다시 눌러야 했다.
  await page.getByRole("button", { name: "달력" }).click();
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  // 눌린 쪽이 어디인지로 본다 — 글자만 보면 목록에도 "일" 이 있어 공허하게 통과한다.
  const on = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => ["목록", "달력"].includes((b.textContent || "").trim()))
      .map((b) => `${b.textContent.trim()}:${b.getAttribute("aria-pressed") ?? b.dataset.state ?? ""}`)
      .join(" ")
  );
  if (!/달력:(true|on|active)/.test(on)) throw new Error(`새로고침하니 달력이 안 눌려 있다 — ${on}`);
  await page.getByRole("button", { name: "목록" }).click();
  await page.waitForTimeout(500);
});
await step("일정 지우기 — 목록에서 바로", async () => {
  const idx = await page.evaluate((m) => [...document.querySelectorAll("li")].findIndex(n => (n.textContent||"").includes(m)), MARK + "검진");
  await page.locator("li").nth(idx).getByRole("button", { name: "더보기" }).click();
  await page.waitForTimeout(350);
  await page.locator('[data-item-menu] button:has-text("삭제")').click();
  await page.waitForTimeout(1300);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  if ((await text()).includes(MARK + "검진")) throw new Error("서버엔 안 지워졌다");
});

console.log("기념일");
await page.goto(BASE + "/anniversaries", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await step("기념일 추가 — D-day 가 계산된다", async () => {
  await page.getByRole("button", { name: /기념일 추가|첫 기념일/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByPlaceholder(/아빠 생일|제목/).first().fill(MARK + "기념");
  await page.locator('input[type="date"]').first().fill("2027-01-01");
  await page.getByRole("button", { name: /^추가$|^저장$/ }).last().click();
  await page.waitForTimeout(1300);
  const t = await text();
  if (!t.includes(MARK + "기념")) throw new Error("안 보인다");
  if (!/D-\d+/.test(t)) throw new Error("D-day 가 안 나온다");
});
await step("기념일 지우기", async () => {
  // 기념일은 카드 그리드에서 **판 하나 안의 줄**로 바뀌었다(겉모습 개편 3).
  // 선택자를 안 고쳤더니 이 단계가 바로 걸렸다 — 검사가 제 일을 했다.
  await page.locator("li", { hasText: MARK + "기념" }).first().getByRole("button", { name: "더보기" }).click();
  await page.waitForTimeout(350);
  await page.locator('[data-item-menu] button:has-text("삭제")').click();
  await page.waitForTimeout(1300);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  if ((await text()).includes(MARK + "기념")) throw new Error("서버엔 안 지워졌다");
});

// ── 아기 일기 ────────────────────────────────────────────
//
// 이 흐름이 없었다. 아기 페이지는 두 번째 탭이고 가장 사적인 글이 쌓이는 곳인데,
// 검사는 장보기·게시판·계획·앨범·할일·캘린더·기념일만 돌고 있었다.
console.log("아기");
await page.goto(BASE + "/baby", { waitUntil: "networkidle" });
await page.waitForTimeout(500);

await step("기록 남기기를 열면 **쓰는 칸이 맨 위**에 있다", async () => {
  await page.getByRole("button", { name: /기록 남기기/ }).first().click();
  await page.waitForTimeout(800);
  const box = page.locator('[role="dialog"] textarea').first();
  const b = await box.boundingBox();
  if (!b) throw new Error("쓰는 칸이 안 보인다");
  // 모달 안에서 글 칸보다 위에 있는 것이 머리글뿐이어야 한다.
  const others = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    const ta = dlg?.querySelector("textarea");
    if (!dlg || !ta) return null;
    const top = ta.getBoundingClientRect().top;
    // 글 칸보다 위에 있는 입력/선택 요소
    return [...dlg.querySelectorAll('input, [role="radio"], [aria-pressed]')].filter(
      (el) => el.getBoundingClientRect().bottom < top && el.getBoundingClientRect().height > 0
    ).length;
  });
  if (others === null) throw new Error("모달을 못 찾았다");
  if (others > 0) throw new Error(`쓰는 칸 위에 정할 것이 ${others}개 있다 — 한 줄 적으러 왔는데`);
});

// 만든 기록의 id 를 잡아 둔다 — 지우기 단계가 실패해도 찌꺼기를 남기지 않으려고.
// (컬렉션에 GET 이 없어서 나중에 id 로 찾을 방법이 없다. 만들 때 받아 두는 수밖에.)
let babyEntryId = null;
const catchBabyEntry = async (res) => {
  if (res.request().method() !== "POST" || !res.url().includes("/api/baby-entries")) return;
  try {
    const j = await res.json();
    if (j?.id) babyEntryId = j.id;
  } catch {
    /* 본문이 없을 수도 있다 */
  }
};
page.on("response", catchBabyEntry);

await step("한 줄 적고 저장하면 일기에 남는다", async () => {
  await page.locator('[role="dialog"] textarea').first().fill(MARK + " 오늘 입덧이 좀 나아졌어요");
  await page.getByRole("button", { name: /^저장$/ }).last().click();
  await page.waitForTimeout(1500);
  if (!(await text()).includes(MARK)) throw new Error("목록에 안 보인다");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  if (!(await text()).includes(MARK)) throw new Error("새로고침하니 사라졌다");
});

await step("접힌 줄을 펴면 날짜·누가·컨디션이 있다", async () => {
  await page.getByRole("button", { name: /기록 남기기/ }).first().click();
  await page.waitForTimeout(700);
  const fold = page.locator('[role="dialog"] button[aria-expanded]').first();
  await fold.click();
  await page.waitForTimeout(400);
  if ((await page.locator('[role="dialog"] input[type="date"]').count()) === 0)
    throw new Error("펴도 날짜가 없다");
  await page.getByRole("button", { name: "취소" }).last().click();
  await page.waitForTimeout(500);
});

await step("기록 지우기 — 새로고침해도 안 되살아난다", async () => {
  // 여기도 **그 카드의** `…` 로. 앞 줄에 아무 데도 안 쓰는 locator 가 매달려 있었고,
  // 실제로는 화면의 첫 `…`(= 다른 기록)를 누르고 있었다.
  await openMenu("[class*='rounded-lg']", MARK);
  await page.locator('[data-item-menu] button:has-text("삭제")').click();
  await page.waitForTimeout(700);
  // 아기 기록은 다시 만들 수 없는 글이라 한 번 묻는다(DESIGN §8).
  const confirm = page.getByRole("button", { name: /^삭제$|^지우기$/ }).last();
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.click();
    await page.waitForTimeout(1200);
  }
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  if ((await text()).includes(MARK)) throw new Error("서버엔 안 지워졌다");
});

await step("아기가 홈에 없으면 한 번 눌러 켤 수 있다", async () => {
  // `JourneySettings.showOnHome` 의 기본값은 false 다 — 배포본이 실제로 그랬다.
  // 태명·예정일을 다 넣어 두고도 홈에서는 아기가 안 보였고, 끄기로 정한 게 아니라
  // 그런 스위치가 있는 줄 몰랐을 뿐이다.
  const baby = await page.evaluate(() => fetch("/api/baby").then((r) => r.json()));
  const before = baby.showOnHome;
  // 설정은 페이지에 하나뿐이라 id 가 없다.
  const set = (v) =>
    page.evaluate(
      (showOnHome) =>
        fetch("/api/baby", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ showOnHome }),
        }).then((r) => r.ok),
      v
    );
  if ((await set(false)) !== true) throw new Error("끄기가 안 먹혔다");
  try {
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const invite = page.getByRole("button", { name: "홈에서도 보기" });
    if (!(await invite.isVisible())) throw new Error("켤 수 있는 줄이 안 보인다");
    await invite.click();
    // 서버 컴포넌트를 다시 받아 오는 데 걸리는 시간은 그때그때 다르다 —
    // 고정 시간(1.5초)으로 재다가 **멀쩡한 기능을 고장으로 잡았다.** 사라질 때까지 기다린다.
    await page
      .getByRole("button", { name: "홈에서도 보기" })
      .waitFor({ state: "hidden", timeout: 8000 })
      .catch(() => {
        throw new Error("눌렀는데 그대로다");
      });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    if (!(await text()).includes("일기 보기")) throw new Error("새로고침하니 아기 칸이 없다");
  } finally {
    // 돌려놓는다 — 검사가 가족의 설정을 바꿔 두면 안 된다.
    await set(before);
  }
});

// 지우기 단계가 어떤 이유로든 실패했으면 여기서 확실히 치운다.
if (babyEntryId) {
  const gone = await page.evaluate(
    (id) => fetch(`/api/baby-entries/${id}`, { method: "DELETE" }).then((r) => r.status).catch(() => 0),
    babyEntryId
  );
  if (gone === 200 || gone === 204) console.log("  (남아 있던 아기 기록을 치웠어요)");
}
// 아래 단계들은 일기를 **page 안의 fetch 로** 만든다 — 그것도 response 로 잡혀서,
// 귀를 열어 두면 babyEntryId 가 엉뚱한 일기로 바뀐다. 위에서 다 치웠으니 뗀다.
page.off("response", catchBabyEntry);

// ── 아기 단계: 준비 → 임신 → 다시 준비 ─────────────────────
//
// 단계 흐름은 **로컬이 준비 단계일 때만** 돈다 — 개발자가 임신 단계로 써 두었으면 건드리지 않는다.
// (그때는 단계마다 "건너뜀" 으로 실패해서 알린다. 조용히 통과시키면 안 돌았다는 걸 아무도 모른다.)
console.log("아기 단계");
const api = (path, method, body) =>
  page.evaluate(
    ([p, m, b]) =>
      fetch(p, { method: m, headers: { "Content-Type": "application/json" }, body: b && JSON.stringify(b) }).then(
        async (r) => ({ status: r.status, json: await r.json().catch(() => null) })
      ),
    [path, method, body]
  );
/** 단계를 다시 읽는다 — 앞 단계가 어디서 멈췄는지에 따라 지금이 달라질 수 있어서 한 번 찍어 두지 않는다. */
const requirePrep = async () => {
  const b = (await api("/api/baby", "GET")).json;
  if (b?.stage === "prep") return;
  if (b?.active?.nickname?.includes(MARK)) throw new Error("앞 단계의 시험용 임신이 안 치워졌다");
  throw new Error("로컬이 준비 단계가 아니라 건너뜀 — 임신을 끝내고 다시");
};
/** 태명에 MARK 가 붙은 진행 중 임신을 지운다(없으면 아무것도 안 한다). 시작할 때의 청소와 같은 규칙. */
const endMarkPregnancy = async () => {
  const a = (await api("/api/baby", "GET")).json?.active;
  return a?.nickname?.includes(MARK) ? api(`/api/pregnancy/${a.id}/end`, "POST", { keep: false }) : null;
};
/** 치우기가 실패해도 그 단계의 원래 오류를 덮지 않는다 — 대신 크게 알린다. 조용히 남기는 것이 제일 나쁘다. */
const tidy = async (what, fn) => {
  try {
    const r = await fn();
    if (r && r.status >= 400) console.log(`      ⚠ 못 치웠다(${what}) — ${r.status}`);
  } catch (e) {
    console.log(`      ⚠ 못 치웠다(${what}) — ${String(e).split("\n")[0].slice(0, 80)}`);
  }
};
/** 게시판 단계가 쓰는 그 8×8 PNG(IMG)를 올리고 주소를 받는다. */
const uploadImg = () =>
  page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const fd = new FormData();
    fd.append("file", new File([bytes], "ui-flows.png", { type: "image/png" }));
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    return r.ok ? ((await r.json()).urls?.[0] ?? null) : null;
  }, readFileSync(IMG).toString("base64"));
const CYCLE_DAY = "2026-01-05"; // 과거 고정 — 로컬 기록과 겹치지 않게
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DUE = ymd(new Date(Date.now() + 200 * 86400000)); // 200일 뒤 예정 → 11주쯤
const TODAY_DAY = ymd(new Date());
/** 주기 카드의 "모든 기록 N개". 컬렉션에 GET 이 없어서 화면의 이 숫자가 유일한 눈이다. */
const cycleCount = async () => Number((await text()).match(/모든 기록\s*(\d+)개/)?.[1] ?? 0);
/**
 * 주기 카드(또는 히어로)의 단추로 기록 하나를 적고, 서버가 돌려준 행을 받는다.
 * 같은 날 같은 기록이면 서버는 **있던 행**을 돌려준다 — 개발자가 그날을 진짜로 적어 두었다면
 * 그건 지우면 안 되니, 이번에 새로 생긴 행인지(`fresh`)를 만든 시각으로 가른다.
 */
const recordCycle = async (button, beforeSave, day = CYCLE_DAY) => {
  const t0 = Date.now();
  await page.getByRole("button", { name: button }).first().click();
  await page.waitForTimeout(500);
  const dlg = page.locator('[role="dialog"]').last();
  await dlg.locator('input[type="date"]').fill(day);
  if (beforeSave) await beforeSave(dlg);
  const saved = page.waitForResponse(
    (r) => r.url().includes("/api/cycle-events") && r.request().method() === "POST",
    { timeout: 8000 }
  );
  saved.catch(() => {}); // 누르기가 실패하면 아무도 안 기다린다 — 처리 안 된 거부로 판 전체가 죽지 않게
  await dlg.getByRole("button", { name: "저장", exact: true }).click();
  const res = await saved;
  const row = await res.json().catch(() => null);
  if (!res.ok() || !row?.id) throw new Error(`저장이 안 됐다 — ${res.status()}`);
  return { row, fresh: new Date(row.createdAt).getTime() >= t0 - 5000 };
};
const alreadyThere = (what, day = CYCLE_DAY) =>
  new Error(
    `${day} 에 이미 ${what} 기록이 있다 — ` +
      (day === CYCLE_DAY ? "검사 날짜(CYCLE_DAY)를 바꿀 것" : "그 기록을 두고는 이 단계를 가를 수 없다")
  );
/** 준비 단계 히어로(h1 "아기 준비" 가 든 판)의 글. */
const prepHeroText = () =>
  page
    .locator("section", { has: page.getByRole("heading", { level: 1, name: "아기 준비", exact: true }) })
    .last()
    .innerText();

await step("생리 시작을 적으면 히어로에 예정일까지 남은 날(추정)이 뜬다", async () => {
  await requirePrep();
  let made = null;
  try {
    await page.goto(BASE + "/baby", { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const n0 = await cycleCount();
    // **오늘** 날짜로 적는다. 예전엔 과거 고정일(CYCLE_DAY)이라 시드의 예측이 "추정" 을 적기 전부터
    // 띄우고 있어 공허하게 통과했다. 오늘 시작이면 이것이 반드시 기준이 된다(더 늦은 시작은 없다).
    // 며칠 전으로 적으면 안 된다 — 아래 "준비 단계로 돌아간 뒤…" 단계가 cycleSince 를 오늘로 찍어서,
    // 같은 날 두 번째 판부터는 그 시작이 since 앞이라 예측이 아예 안 뜬다(lib/cycle.ts).
    const { row, fresh } = await recordCycle(/생리 시작/, null, TODAY_DAY);
    if (!fresh) throw alreadyThere("생리 시작", TODAY_DAY);
    made = row.id;
    await page.waitForTimeout(1200);
    // 큰 숫자는 제목("아기 준비") **바로 다음 줄**이다. "D-" 글자만 찾으면 아래 "다음 진료 … D-9"
    // (flex 칸이라 innerText 에서 제 줄을 갖는다)에도 걸려, 예측이 사라져도 통과한다.
    // 오늘 시작했으니 예정일은 평균 주기(15일 이상) 뒤 — "오늘" 도 "지남" 도 나올 수 없다.
    const hero = await prepHeroText();
    const lines = hero.split("\n").map((l) => l.trim()).filter(Boolean);
    const big = lines[lines.indexOf("아기 준비") + 1] ?? "";
    if (!/^D-\d+$/.test(big)) throw new Error(`제목 아래 큰 숫자가 D-N 이 아니다 — "${big.slice(0, 40)}"`);
    if (!hero.includes("추정")) throw new Error("예측에 '추정' 이 없다");
    // 저장은 따로 본다 — 화면만 바뀌고 서버에 안 남았을 수 있다.
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const n1 = await cycleCount();
    if (n1 !== n0 + 1) throw new Error(`새로고침하니 기록 수가 ${n0} → ${n1}`);
  } finally {
    if (made) await tidy("생리 시작 기록", () => api(`/api/cycle-events/${made}`, "DELETE"));
  }
});

await step("배란 테스트기는 결과를 골라야 저장된다", async () => {
  await requirePrep();
  let made = null;
  try {
    await page.goto(BASE + "/baby", { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const { row, fresh } = await recordCycle(/배란 테스트기/, async (dlg) => {
      // 결과를 미리 골라 두면 안 고르고 저장해 실제와 다른 결과가 남는다.
      if (!(await dlg.getByRole("button", { name: "저장", exact: true }).isDisabled()))
        throw new Error("결과를 안 골랐는데 저장이 켜져 있다");
      await dlg.getByRole("button", { name: "양성", exact: true }).click();
    });
    if (!fresh) throw alreadyThere("배란 테스트기 양성");
    made = row.id;
    if (row.kind !== "ovulationTest" || row.result !== "positive")
      throw new Error(`${row.kind}/${row.result} 로 남았다 — ovulationTest/positive 여야`);
  } finally {
    if (made) await tidy("배란 테스트기 기록", () => api(`/api/cycle-events/${made}`, "DELETE"));
  }
});

await step("같은 날 같은 기록은 한 줄 — 두 번 지워도 200", async () => {
  // 포동이와 사람이 같은 날을 두 번 적어도 줄이 늘면 안 된다(평균 주기가 흔들린다).
  // 지우기는 두 폰이 동시에 누를 수 있다 — 뒤쪽이 500 이면 화면이 지운 줄을 되살린다.
  await requirePrep();
  const made = new Set();
  try {
    const t0 = Date.now();
    const a = await api("/api/cycle-events", "POST", { date: CYCLE_DAY, kind: "periodStart" });
    if (a.status !== 200 || !a.json?.id) throw new Error(`못 적었다 — ${a.status}`);
    if (new Date(a.json.createdAt).getTime() < t0 - 5000) throw alreadyThere("생리 시작");
    made.add(a.json.id);
    const b = await api("/api/cycle-events", "POST", { date: CYCLE_DAY, kind: "periodStart" });
    if (b.json?.id) made.add(b.json.id);
    if (b.json?.id !== a.json.id) throw new Error("같은 날을 다시 적었더니 줄이 늘었다");
    const first = await api(`/api/cycle-events/${a.json.id}`, "DELETE");
    const second = await api(`/api/cycle-events/${a.json.id}`, "DELETE");
    if (first.status !== 200) throw new Error(`첫 삭제가 ${first.status}`);
    if (second.status !== 200) throw new Error(`두 번째 삭제가 ${second.status} — 화면은 이걸 보고 지운 줄을 되살린다`);
  } finally {
    // 지우기는 몇 번을 불러도 같다 — 위에서 지웠어도 한 번 더 부른다.
    for (const id of made) await tidy("주기 기록", () => api(`/api/cycle-events/${id}`, "DELETE"));
  }
});

// 준비 때 일기 하나를 **임신 확인 전에** 적어 둔다 — "준비 단계로 · 지우기" 는 이것을 남겨야 한다.
// 단계 하나에 넣지 않는 이유: 임신 확인 단계가 끝나도 지우면 안 되고, 다음 단계가 치운다.
let prepEntryId = null;
if ((await api("/api/baby", "GET").catch(() => null))?.json?.stage === "prep") {
  const r = await api("/api/baby-entries", "POST", { content: MARK + " 준비 때" }).catch(() => null);
  prepEntryId = r?.json?.id ?? null;
}

await step("임신 확인 → 주차, 두 번째 확인은 409", async () => {
  await requirePrep();
  let ok = false;
  try {
    await page.goto(BASE + "/baby", { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "임신을 확인했어요" }).click();
    await page.waitForTimeout(600);
    const dlg = page.locator('[role="dialog"]').last();
    await dlg.getByPlaceholder("비워 두면 '우리 아기'").fill(MARK + "콩");
    // 생리 기록이 있으면 "마지막 생리일" 이 미리 채워진 채로 열린다 — 예정일 칸으로 바꿔 넣는다.
    await dlg.getByRole("button", { name: "출산 예정일", exact: true }).click();
    await dlg.locator('input[type="date"]').fill(DUE);
    await dlg.getByRole("button", { name: "시작하기", exact: true }).click();
    // 서버가 바꾼 뒤 화면을 다시 받아 온다(router.refresh) — 걸리는 시간이 그때그때라
    // 고정 시간으로 재지 않고 h1 이 태명으로 바뀔 때까지 기다린다.
    await page
      .getByRole("heading", { level: 1, name: MARK + "콩" })
      .waitFor({ timeout: 8000 })
      .catch(() => {
        throw new Error("히어로가 임신 단계로 안 바뀐다");
      });
    // "주" 한 글자는 "주기 기록" 에도 있다 — 히어로 안에서 "N주 N일" 꼴을 찾는다.
    const hero = await page.locator("section", { has: page.locator("h1") }).last().innerText();
    if (!/\d+주 \d+일/.test(hero)) throw new Error(`주차가 안 보인다 — ${hero.slice(0, 40)}`);
    // 두 폰에서 동시에 누른 셈. 태명에 MARK 를 붙여 둔다 — 잘못 만들어지면 다음 판 청소가 잡도록.
    const again = await api("/api/pregnancy", "POST", { nickname: MARK + "둘째확인", dueDate: "2027-01-01" });
    if (again.status !== 409) {
      if (again.json?.id)
        await tidy("두 번째 임신", () => api(`/api/pregnancy/${again.json.id}/end`, "POST", { keep: false }));
      throw new Error(`두 번째 확인이 ${again.status} — 진행 중인 임신이 둘이 된다`);
    }
    ok = true; // 다음 단계가 이 임신을 쓴다 — 통과했으면 여기서 치우지 않는다
  } finally {
    if (!ok) await tidy("시험용 임신", endMarkPregnancy);
  }
});

await step("임신 중에 쓴 일기만 '준비 단계로 · 지우기' 로 사라진다", async () => {
  let duringId = null;
  let photo = null;
  try {
    const now = (await api("/api/baby", "GET")).json;
    if (now?.active && !now.active.nickname?.includes(MARK))
      throw new Error("로컬이 준비 단계가 아니라 건너뜀 — 임신을 끝내고 다시");
    if (!now?.active) throw new Error("앞 단계에서 임신을 못 시작했다");
    if (!prepEntryId) throw new Error("준비 때 일기를 못 적어 두었다");

    // 임신 중 일기 — 사진을 품게 한다. 지우기가 사진 파일까지 치우는지 보려고.
    const base = fileCount();
    photo = await uploadImg();
    if (!photo) throw new Error("사진을 못 올렸다");
    if (fileCount() !== base + 1) throw new Error("올렸는데 파일이 안 생겼다");
    const during = await api("/api/baby-entries", "POST", { content: `${MARK} 임신 중\n\n![](${photo})` });
    duringId = during.json?.id ?? null;
    if (!duringId) throw new Error(`임신 중 일기를 못 적었다 — ${during.status}`);

    await page.goto(BASE + "/baby", { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "임신 설정" }).click();
    await page.waitForTimeout(600);
    await page.locator('[role="dialog"]').last().getByRole("button", { name: "준비 단계로", exact: true }).click();
    await page.waitForTimeout(600);
    // 설정 창과 확인 창의 단추 이름이 같다("준비 단계로") — 지금 맨 위 창 안에서만 찾는다.
    const dlg = page.locator('[role="dialog"]').last();
    if (!(await dlg.innerText()).includes("준비 단계로 돌아갈까요?")) throw new Error("남길지 지울지 묻는 창이 안 뜬다");
    await dlg.getByRole("radio", { name: /이 기간의 기록 지우기/ }).click();
    await dlg.getByRole("button", { name: "준비 단계로", exact: true }).click();
    await page
      .getByRole("heading", { level: 1, name: "아기 준비", exact: true })
      .waitFor({ timeout: 8000 })
      .catch(() => {
        throw new Error("준비 단계로 안 돌아간다");
      });

    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const t = await text();
    if (t.includes(MARK + " 임신 중")) throw new Error("임신 중에 쓴 일기가 남았다");
    if (!t.includes(MARK + " 준비 때")) throw new Error("준비 때 일기까지 지워졌다");
    if (!(await page.getByRole("heading", { level: 1, name: "아기 준비", exact: true }).count()))
      throw new Error("새로고침하니 준비 단계가 아니다");
    if (fileCount() !== base) throw new Error(`사진 파일이 남았다 — ${base + 1}개 → ${fileCount()}개`);
  } finally {
    await tidy("시험용 임신", endMarkPregnancy);
    if (duringId) await tidy("임신 중 일기", () => api(`/api/baby-entries/${duringId}`, "DELETE"));
    // 일기에 못 붙은 사진은 아무도 안 치운다(주인이 없다) — 로컬 파일이니 직접 지운다.
    if (photo?.startsWith("/uploads/")) {
      const f = join(uploadDir, basename(photo));
      if (existsSync(f)) unlinkSync(f);
    }
    if (prepEntryId) await tidy("준비 때 일기", () => api(`/api/baby-entries/${prepEntryId}`, "DELETE"));
  }
});

await step("'남기기' 는 일기를 남기고 준비로 돌아간다", async () => {
  await requirePrep();
  let pregnancyId = null;
  let entryId = null;
  try {
    const started = await api("/api/pregnancy", "POST", { nickname: MARK + "둘", dueDate: DUE });
    pregnancyId = started.json?.id ?? null;
    if (started.status !== 200 || !pregnancyId) throw new Error(`임신을 못 시작했다 — ${started.status}`);
    const e = await api("/api/baby-entries", "POST", { content: MARK + " 남길 일기" });
    entryId = e.json?.id ?? null;
    if (!entryId) throw new Error(`일기를 못 적었다 — ${e.status}`);
    const kept = await api(`/api/pregnancy/${pregnancyId}/end`, "POST", { keep: true });
    if (kept.status !== 200) throw new Error(`남기기가 ${kept.status}`);

    await page.goto(BASE + "/baby", { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    if (!(await page.getByRole("heading", { level: 1, name: "아기 준비", exact: true }).count()))
      throw new Error("준비 단계로 안 돌아갔다");
    if (!(await text()).includes(MARK + " 남길 일기")) throw new Error("남기기를 골랐는데 일기가 사라졌다");

    // 치우기 겸 확인 — 이미 끝난(남긴) 임신도 keep:false 로 지워지고 그 기간 일기가 같이 사라진다.
    // 안 그러면 한 번 남긴 기간은 "처음부터 다시 시작" 말고는 지울 길이 없다.
    const gone = await api(`/api/pregnancy/${pregnancyId}/end`, "POST", { keep: false });
    if (gone.status !== 200) throw new Error(`끝난 임신 지우기가 ${gone.status}`);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    if ((await text()).includes(MARK + " 남길 일기")) throw new Error("끝난 임신을 지웠는데 그 기간 일기가 남았다");
  } finally {
    // 둘 다 몇 번을 불러도 같은 결과다 — 위에서 지웠어도 한 번 더.
    if (pregnancyId)
      await tidy("남긴 임신", () => api(`/api/pregnancy/${pregnancyId}/end`, "POST", { keep: false }));
    if (entryId) await tidy("남길 일기", () => api(`/api/baby-entries/${entryId}`, "DELETE"));
  }
});

// 이 흐름이 이 화면을 다시 만든 이유다. 임신이 끝나 준비로 돌아오면 주기 기록에는 **임신 전** 생리가
// 마지막 시작으로 남아 있어, 그걸 기준으로 히어로가 "21일 지남" 을 60~72px 로 띄우고 날마다 키웠다.
// 서버가 끝난 임신의 추정 시작(JourneySettings.cycleSince = 예정일 − 266일, 오늘보다 뒤는 아니다)을
// 찍고, 그 앞의 시작은 예측의 기준이 못 된다. 그 뒤에 시작이 없으면 히어로는 "생리 시작일을 적으면…"
// 으로 돌아가야 하고, 임신 시작 창의 "마지막 생리일" 도 비어 있어야 한다.
//
// **로컬 기록과 상관없이 가르게** 예정일을 오늘 + 266일로 둔다 → since = 오늘 → 지금 있는 시작은
// (시드 견본이든 개발자 것이든) 전부 그 앞이다. 그러니 배선이 하나라도 빠지면(라우트가 안 찍거나,
// page.tsx·화면이 since 를 안 넘기면) 아래 50일 전 시작으로 예측이 떠서 걸린다.
//
// ⚠ 그래서 이 단계는 로컬의 cycleSince 를 **오늘로 찍는다** — 의도한 동작이다(뒤로 물러나지 않는 값이다).
//   그 뒤로는 오늘 이후 날짜로 생리 시작을 적어야 예측이 뜬다(시드 견본의 12일 전 시작도 기준이 못 된다).
//   되돌리려면 `npm run db:seed`(설정 표를 비운다).
await step("준비 단계로 돌아간 뒤 히어로에 '지남' 이 없다", async () => {
  await requirePrep();
  let cycleId = null;
  let pregnancyId = null;
  try {
    // 50일 전 시작 = 임신 전 생리. 평균 28일이면 이것만으로는 "22일 지남" 이 된다(60일 한도 안이라
    // 오래된 기록 거르기로는 안 가려진다 — since 만이 이것을 막는다). 로컬에 기록이 하나도 없어도
    // 예측이 뜰 거리가 있게 하려고 적는다 — 없으면 since 가 빠져도 "예측 없음" 으로 공허하게 통과한다.
    const FIFTY_AGO = ymd(new Date(Date.now() - 50 * 86400000));
    const t0 = Date.now();
    const c = await api("/api/cycle-events", "POST", { date: FIFTY_AGO, kind: "periodStart" });
    if (c.status !== 200 || !c.json?.id) throw new Error(`생리 시작을 못 적었다 — ${c.status}`);
    // 개발자가 그날을 진짜로 적어 두었으면 서버가 그 행을 돌려준다 — 그건 치우지 않는다(있어도 시험은 같다).
    if (new Date(c.json.createdAt).getTime() >= t0 - 5000) cycleId = c.json.id;

    // 예정일 − 266일 = 오늘 → since 가 오늘이 된다(위 설명).
    const DUE_SINCE_TODAY = ymd(new Date(Date.now() + 266 * 86400000));
    const started = await api("/api/pregnancy", "POST", { nickname: MARK + "셋", dueDate: DUE_SINCE_TODAY });
    pregnancyId = started.json?.id ?? null;
    if (started.status !== 200 || !pregnancyId) throw new Error(`임신을 못 시작했다 — ${started.status}`);

    // 끝내기는 화면으로 — 서버가 바꾼 뒤 router.refresh 로 다시 붙은 화면도 since 를 받아야 한다.
    await page.goto(BASE + "/baby", { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "임신 설정" }).click();
    await page.waitForTimeout(600);
    await page.locator('[role="dialog"]').last().getByRole("button", { name: "준비 단계로", exact: true }).click();
    await page.waitForTimeout(600);
    const dlg = page.locator('[role="dialog"]').last();
    await dlg.getByRole("radio", { name: /이 기간의 기록 지우기/ }).click();
    await dlg.getByRole("button", { name: "준비 단계로", exact: true }).click();
    await page
      .getByRole("heading", { level: 1, name: "아기 준비", exact: true })
      .waitFor({ timeout: 8000 })
      .catch(() => {
        throw new Error("준비 단계로 안 돌아간다");
      });
    await page.waitForTimeout(400);

    const check = async (when) => {
      const hero = await prepHeroText();
      if (hero.includes("지남")) throw new Error(`${when}: 히어로에 '지남' — ${hero.replace(/\s+/g, " ").slice(0, 60)}`);
      // "없음" 만 보면 히어로가 통째로 안 그려져도 통과한다 — 있어야 할 문장을 같이 본다.
      if (!hero.includes("생리 시작일을 적으면"))
        throw new Error(`${when}: 예측이 남아 있다(임신 전 생리를 기준으로 셌다) — ${hero.replace(/\s+/g, " ").slice(0, 60)}`);
    };
    await check("돌아온 직후");
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    if (!(await page.getByRole("heading", { level: 1, name: "아기 준비", exact: true }).count()))
      throw new Error("새로고침하니 h1 이 '아기 준비' 가 아니다");
    await check("새로고침 뒤");

    // 임신 시작 창의 "마지막 생리일" 도 임신 전 날짜로 미리 채워지면 안 된다(예측과 같은 값에서 온다).
    await page.getByRole("button", { name: "임신을 확인했어요" }).click();
    await page.waitForTimeout(600);
    const start = page.locator('[role="dialog"]').last();
    const prefilled = await start.locator('input[type="date"]').inputValue();
    await start.getByRole("button", { name: "취소", exact: true }).click();
    if (prefilled) throw new Error(`임신 시작 창에 ${prefilled} 이 미리 채워져 있다`);
  } finally {
    // 둘 다 몇 번을 불러도 같은 결과다 — 화면에서 지웠어도 한 번 더.
    if (pregnancyId)
      await tidy("시험용 임신", () => api(`/api/pregnancy/${pregnancyId}/end`, "POST", { keep: false }));
    if (cycleId) await tidy("50일 전 생리 시작", () => api(`/api/cycle-events/${cycleId}`, "DELETE"));
  }
});

// "처음부터 다시 시작"(`DELETE /api/baby`)은 돌리지 않는다 — 개발자 로컬의 아기 페이지 기록
// (주기 기록·일기·체크리스트·참고 사이트·올린 사진)이 MARK 와 상관없이 전부 지워진다.

// 단계 흐름이 어디서 멈췄든 로컬을 임신 단계로 남기지 않는다.
{
  const r = await endMarkPregnancy().catch(() => null);
  if (r) console.log("  (남아 있던 시험용 임신을 치웠어요)");
}

// ── 꾸미기 스티커 ────────────────────────────────────────
console.log("꾸미기");
await step("스티커도 원본 그대로 저장된다 — 편집 중엔 고정된 줄인 주소", async () => {
  // 꾸미기 사진도 원본(투명 그대로). 예전엔 600px JPEG 로 눌러 투명한 곳이 검게 됐다.
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.setItem("podong_edit_mode", "1"));
  let made = null;
  try {
    await page.reload({ waitUntil: "networkidle" });
    const decos = () =>
      page.evaluate(() => fetch("/api/decorations?page=%2F").then((r) => (r.ok ? r.json() : [])));
    const beforeIds = (await decos()).map((d) => d.id);
    const before = uploadNames();
    const toolbar = page.locator('[data-deco-ui="/"]').filter({ hasText: "사진 추가" });
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      toolbar.getByRole("button", { name: /사진 추가/ }).click(),
    ]);
    await chooser.setFiles(BIG_IMG);
    made = await until("스티커가 생긴다", async () => (await decos()).find((d) => !beforeIds.includes(d.id)));
    const name = newUpload(before);
    if (!made.url.endsWith("/" + name)) throw new Error(`스티커 주소가 새 파일이 아니다: ${made.url}`);
    assertByteIdentical(name);
    console.log(`      저장 ${name} (sha256 같음)`);

    // 편집 중: 원본(16MB)이 아니라 고정된 줄인 주소. 크기를 끄는 동안 주소가 안 바뀌어야 깜빡이지 않는다.
    const src = await until("편집 중 스티커가 보인다", () =>
      page.evaluate((id) => {
        const img = [...document.querySelectorAll('[data-sticker="/"] img')].find((i) =>
          (i.getAttribute("src") || "").includes(encodeURIComponent(id))
        );
        return img ? img.getAttribute("src") : null;
      }, "/uploads/" + name)
    );
    if (!src.startsWith("/_next/image?") || !src.includes("&w=1200&"))
      throw new Error("편집 중 주소가 고정된 최적화 주소가 아니다: " + src.slice(0, 90));
  } finally {
    await page.evaluate(() => localStorage.setItem("podong_edit_mode", "0"));
    if (made) await page.evaluate((id) => fetch(`/api/decorations/${id}`, { method: "DELETE" }), made.id);
  }
});
await step("넓은 화면에서 오른쪽 끝에 붙인 스티커가 폰에서 화면 밖으로 안 나간다", async () => {
  // 자리는 xPct(가운데, %)로 저장된다. 같은 값이 화면 폭에 따라 다른 자리를 뜻한다:
  // 데스크톱(내용 폭 ~1160px)에서 92.6% 는 999~1149px 로 안쪽이지만,
  // 폰(358px)에서는 286~436px 이라 46px 이 밖으로 나간다.
  // 실제로 가족이 홈에 붙여 둔 사진이 그랬고, 인사말 위에 반쯤 걸쳐 잘려 보였다.
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  const made = await page.evaluate(() =>
    fetch("/api/decorations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ page: "/", url: "/icon.svg", xPct: 92.64, yPx: 99, width: 150, rotation: 0, z: 20 }),
    }).then((r) => (r.ok ? r.json() : null))
  );
  if (!made) throw new Error("스티커를 못 만들었다");
  try {
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const box = await page.evaluate(() => {
      const el = document.querySelector('[data-sticker="/"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), vw: window.innerWidth };
    });
    if (!box) throw new Error("스티커가 안 보인다");
    if (box.right > box.vw + 1 || box.left < -1)
      throw new Error(`화면 밖으로 나갔다 — ${box.left}~${box.right} (폭 ${box.vw})`);
  } finally {
    // 만든 것은 반드시 치운다. 배포본에 시험용 스티커를 남긴 적이 있다.
    await page.evaluate((id) => fetch(`/api/decorations/${id}`, { method: "DELETE" }), made.id);
  }
});

// ── 긴 글자 ──────────────────────────────────────────────
// `word-break: keep-all` 을 건 뒤로 **띄어쓰기 없는 긴 글자**가 판을 밀 수 있게 됐다.
// 실제로 넣어 보고 확인한다 — 화면을 보는 것으로는 절대 안 나오는 종류다.
//
// 재 보니 한글도 주소도 멀쩡했고(`overflow-wrap: break-word` 가 받아 준다),
// **띄어쓰기 없는 긴 영단어 하나**가 홈의 쪽지 격자를 벌렸다. 격자 칸의 기본
// `min-width: auto` 는 "내용의 최소 너비" 라서, `overflow-wrap` 으로는 못 줄인다
// (316px 칸에 397px 카드가 들어가 오른쪽이 잘렸다 → `min-w-0` 으로 고쳤다).
// ── 두 번 지우기 ─────────────────────────────────────────
// 공유 목록이다 — **두 사람이 같은 항목을 동시에 지우는 일이 실제로 있다.**
// 예전엔 뒤쪽 요청이 prisma P2025 로 **500** 을 받았고, 화면은 `!res.ok` 를 보고
// 낙관적 삭제를 되돌려 **지운 것이 되살아났다.** 이미 없으면 그걸로 된 것이다.
console.log("두 번 지우기");
await step("같은 항목을 두 번 지워도 되살아나지 않는다", async () => {
  const r = await page.evaluate(async (mark) => {
    const made = await fetch("/api/shopping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: mark + "두번", quantity: "1개" }),
    }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (!made?.id) return { err: "못 만들었다" };
    const first = await fetch(`/api/shopping/${made.id}`, { method: "DELETE" }).then((x) => x.status);
    const second = await fetch(`/api/shopping/${made.id}`, { method: "DELETE" }).then((x) => x.status);
    const list = await fetch("/api/shopping").then((x) => (x.ok ? x.json() : [])).catch(() => []);
    const left = (Array.isArray(list) ? list : []).filter((i) => (i.name || "").includes(mark)).length;
    return { first, second, left };
  }, MARK);
  if (r.err) throw new Error(r.err);
  if (r.first !== 200) throw new Error(`첫 삭제가 ${r.first}`);
  if (r.second >= 500) throw new Error(`두 번째 삭제가 ${r.second} — 화면은 이걸 보고 지운 것을 되살린다`);
  if (r.left !== 0) throw new Error(`${r.left}개가 남아 있다`);
});

console.log("긴 글자");
{
  const LONG = {
    "긴 한글(띄어쓰기 없음)": "쿠팡사이트에서파는초대용량친환경세탁세제리필용기포함",
    "긴 주소": "https://www.coupang.com/vp/products/1234567890?itemId=9876543210&vendorItemId=1122334455",
    "긴 영단어": "supercalifragilisticexpialidociousantidisestablishmentarianism",
  };
  for (const [label, body] of Object.entries(LONG)) {
    await step(`${label} 가 판을 밀지 않는다`, async () => {
      const id = await page.evaluate(
        ([m, b]) =>
          fetch("/api/board", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: m + " " + b, color: "rose" }),
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((r) => r?.id ?? null)
            .catch(() => null),
        [MARK, body]
      );
      if (!id) throw new Error("쪽지를 못 만들었다");
      try {
        for (const w of [320, 360, 390]) {
          await page.setViewportSize({ width: w, height: 844 });
          for (const path of ["/", "/board"]) {
            await page.goto(BASE + path, { waitUntil: "networkidle" });
            await page.waitForTimeout(250);
            const r = await page.evaluate(() => {
              const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
              let spill = null;
              for (const el of document.querySelectorAll("body *")) {
                if (el.children.length || el.closest("nextjs-portal")) continue;
                const b = el.getBoundingClientRect();
                if (b.width < 4) continue;
                if (b.right > window.innerWidth + 1 || b.left < -1) {
                  spill = `${(el.textContent || "").trim().slice(0, 14)} (${Math.round(b.left)}~${Math.round(b.right)})`;
                  break;
                }
              }
              return { over, spill };
            });
            if (r.over > 0) throw new Error(`${w}px ${path}: 가로 스크롤 ${r.over}px`);
            if (r.spill) throw new Error(`${w}px ${path}: 화면 밖으로 — ${r.spill}`);
          }
        }
      } finally {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate((i) => fetch(`/api/board/${i}`, { method: "DELETE" }), id);
      }
    });
  }
  // 격자는 쪽지만 있는 게 아니다 — 계획 카드도 같은 이유로 벌어졌다(288px 칸에 538px 카드).
  await step("긴 제목이 계획 격자를 벌리지 않는다", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const id = await page.evaluate(
      ([m, b, d]) =>
        fetch("/api/plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: m + b, description: b, kind: "trip", startDate: d }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((r) => r?.id ?? null)
          .catch(() => null),
      [MARK, "supercalifragilisticexpialidociousantidisestablishmentarianism", today]
    );
    if (!id) throw new Error("계획을 못 만들었다");
    try {
      for (const w of [320, 390]) {
        await page.setViewportSize({ width: w, height: 844 });
        await page.goto(BASE + "/plans", { waitUntil: "networkidle" });
        await page.waitForTimeout(250);
        const r = await page.evaluate(() => {
          const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
          let spill = null;
          for (const el of document.querySelectorAll("body *")) {
            if (el.children.length || el.closest("nextjs-portal")) continue;
            const b = el.getBoundingClientRect();
            if (b.width < 4) continue;
            if (b.right > window.innerWidth + 1) { spill = `${(el.textContent || "").trim().slice(0, 12)} → ${Math.round(b.right)}px`; break; }
          }
          return { over, spill };
        });
        if (r.over > 0) throw new Error(`${w}px: 가로 스크롤 ${r.over}px`);
        if (r.spill) throw new Error(`${w}px: 화면 밖으로 — ${r.spill}`);
      }
    } finally {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate((i) => fetch(`/api/plans/${i}`, { method: "DELETE" }), id);
    }
  });
}

console.log(errs.length ? "\n콘솔 오류: " + JSON.stringify([...new Set(errs)]) : "\n콘솔 오류 없음");
console.log(failed === 0 ? `✓ ${total}단계 모두 통과` : `⚠ ${failed}단계 실패`);
if (failed) process.exitCode = 1;
await browser.close();
for (const f of [IMG, BIG_IMG]) {
  try {
    unlinkSync(f);
  } catch {
    /* 지워져 있어도 상관없다 */
  }
}
