import type { KnipConfig } from "knip";

/**
 * Dead-code audit config (`bun run audit:dead-code`). Knip auto-detects the
 * Next.js / Vitest / Playwright / Drizzle / ESLint / PostCSS / Sentry plugins
 * from package.json + the config files, which contribute most entry points
 * (the `src/app/**` route conventions, `instrumentation*.ts`, the sentry configs,
 * the test globs, each tool config). This file only declares what those plugins
 * can't infer, and what must be ignored.
 *
 * Rule (CLAUDE.md): never silence a finding with a `knip-ignore` comment — either
 * delete the dead code, or declare the missed entry/dep/binary HERE with a note.
 */
const config: KnipConfig = {
  entry: [
    // Serwist service-worker source — compiled by @serwist/turbopack, never imported.
    "src/app/sw.ts",
    // Playwright suite: the plugin doesn't resolve the config's custom project
    // `testMatch` regexes, so declare the specs + the auth setup explicitly.
    "e2e/**/*.setup.ts",
    "e2e/specs/*.spec.ts",
    // CLI scripts run outside package.json: dev-only audio tools + the CI E2E-gate
    // content seed (invoked as `bun scripts/seed-content.ts` in the Forgejo workflow).
    "scripts/seed-content.ts",
    "scripts/generate-audio.ts",
    "scripts/warm-english-audio.ts",
  ],
  ignore: [
    // Archived v2 app — excluded from build/lint/tests everywhere else.
    "_archive/**",
    // Program 01 curriculum kept on disk but intentionally NOT wired into the
    // registry (see the note in src/content/index.ts) — retained, not dead.
    "src/content/programs/summer-k-to-grade1.ts",
  ],
  // macOS system binaries used only by the dev-only audio generator (not npm bins).
  ignoreBinaries: ["afconvert", "say"],
};

export default config;
