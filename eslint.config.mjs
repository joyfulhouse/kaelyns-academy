import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  // _archive holds the v2 app (excluded from the v3 build); drizzle/ is generated SQL;
  // .claude/worktrees/ are git worktree build artifacts, never app source.
  { ignores: ["_archive/**", ".next/**", "drizzle/**", ".claude/worktrees/**"] },
  ...nextVitals,
]);

export default eslintConfig;
