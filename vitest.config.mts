import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

// lib/ 의 순수 함수만 테스트합니다. React/Next 컴포넌트 테스트는 없습니다.
export default defineConfig({
  resolve: { alias: { "@": root } },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    environment: "node",
  },
});
