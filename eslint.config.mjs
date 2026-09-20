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
      // `_` 로 시작하는 이름은 **일부러 안 쓰는 것**이다 — 스프레드에서 빼내려고 꺼낸
      // props(`_v`, `_s`, `_c`), 쓰지 않는 콜백 인자(`node`) 같은 것들.
      // 이 규칙이 그 약속을 모르면 매번 경고가 뜨고, 그러면 진짜 경고가 묻힌다.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
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
