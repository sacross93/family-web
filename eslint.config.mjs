import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // 가족이 올린 임의 URL 사진은 next/image 대신 <img>를 의도적으로 사용
      "@next/next/no-img-element": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright MCP 가 쓰는 폴더(스크린샷·임시 스크립트). git 도 무시한다.
    ".playwright-mcp/**",
  ]),
]);

export default eslintConfig;
