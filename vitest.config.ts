import { defineConfig } from "vitest/config";
import path from "path";
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // .next/** keeps vitest from discovering third-party *.spec.js inside the
    // standalone build output (and **/node_modules for any worktree symlinks).
    exclude: ["_archive/**", "node_modules/**", "**/node_modules/**", ".next/**"],
  },
});
