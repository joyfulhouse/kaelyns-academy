import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  // _archive holds the v2 app (excluded from the v3 build); drizzle/ is generated SQL.
  { ignores: ["_archive/**", ".next/**", "drizzle/**"] },
  ...nextVitals,
]);

export default eslintConfig;
