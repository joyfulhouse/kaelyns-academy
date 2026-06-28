import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  // _archive holds the v2 app (excluded from the v3 build); drizzle/ is generated SQL;
  // .claude/worktrees/ are git worktree build artifacts, never app source;
  // playwright-report/ + test-results/ are generated Playwright e2e artifacts (bundled vendor JS).
  {
    ignores: [
      "_archive/**",
      ".next/**",
      "drizzle/**",
      ".claude/worktrees/**",
      "playwright-report/**",
      "test-results/**",
      "blob-report/**",
    ],
  },
  ...nextVitals,
]);

export default eslintConfig;
