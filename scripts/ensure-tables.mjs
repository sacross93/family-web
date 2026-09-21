// 빌드 직전에 **있어야 할 표가 있는지** 확인한다.  (package.json 의 build 가 부른다)
//
// 왜: 운영 `DATABASE_URL` 은 Vercel 에 Secret 이라 **아무도 다시 읽을 수 없다.** 그래서 새 표가
// 생길 때마다 사람이 Neon 콘솔에 들어가야 했다 — "배포하면 끝" 이어야 할 일에 사람을 묶는다.
// 빌드 환경은 그 값을 갖고 있으니 여기서 확인한다.
//
// **빌드를 죽이지 않는다.** 표를 못 만들어도 사이트는 돌아야 한다(없는 표를 읽는 화면은
// "아직 확인할 수 없어요" 로 비켜 간다). 대신 **크게 적는다** — 조용히 실패하는 것이 제일 나쁘다.
//
// 돌리는 SQL 은 `prisma/ensure.sql` 하나뿐이고 거기엔 `CREATE ... IF NOT EXISTS` 만 있다.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const SQL = "prisma/ensure.sql";

if (!process.env.DATABASE_URL) {
  console.log("[표 확인] DATABASE_URL 이 없어 건너뜁니다(로컬 빌드).");
  process.exit(0);
}
if (!existsSync(SQL)) {
  console.log(`[표 확인] ${SQL} 이 없어 건너뜁니다.`);
  process.exit(0);
}

// 파일에 더하기 말고 다른 것이 섞이면 **돌리지 않는다.** 배포마다 도는 자리라,
// 여기 DROP 한 줄이 들어가면 배포할 때마다 운영 데이터가 그걸 맞는다.
const sql = readFileSync(SQL, "utf8");
const forbidden = sql.match(/^\s*(DROP|ALTER|DELETE|TRUNCATE|UPDATE|INSERT)\b/gim);
if (forbidden) {
  console.error(`[표 확인] ${SQL} 에 더하기가 아닌 명령이 있어 멈춥니다: ${[...new Set(forbidden.map((s) => s.trim()))].join(", ")}`);
  console.error("  이 파일은 배포마다 돕니다. 고치는 일은 사람 손으로 한 번만 하세요.");
  process.exit(0); // 빌드는 살린다. 실행만 안 한다.
}

try {
  execFileSync("npx", ["prisma", "db", "execute", "--file", SQL, "--schema", "prisma/schema.prisma"], {
    stdio: "pipe",
    encoding: "utf8",
  });
  console.log("[표 확인] ✓ 있어야 할 표가 다 있습니다.");
} catch (error) {
  const detail = `${error?.stdout ?? ""}${error?.stderr ?? ""}`.trim().split("\n").slice(0, 4).join(" / ");
  console.error("[표 확인] ✗ 표를 확인하지 못했습니다 — 사이트는 그대로 뜨지만 그 기능은 비어 보입니다.");
  console.error(`  ${detail || error?.message || "이유 불명"}`);
}
