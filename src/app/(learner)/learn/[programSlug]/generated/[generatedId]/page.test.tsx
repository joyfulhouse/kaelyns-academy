import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sessionLookup: vi.fn(async () => ({ user: { id: "acc-1" } })),
}));

vi.mock("@/lib/auth", () => ({
  getSessionOrNull: mocks.sessionLookup,
}));

vi.mock("@/lib/tutor/store", () => ({}));

vi.mock("@/components/learner/GeneratedPracticeHost", () => ({
  GeneratedPracticeHost: ({
    programSlug,
    generatedId,
  }: {
    programSlug: string;
    generatedId?: string;
  }) => <div data-program={programSlug} data-generated={generatedId} />,
}));

import GeneratedActivityPage from "./page";

it("defers generated-row lookup until the client resolves the selected learner", async () => {
  const html = renderToStaticMarkup(
    await GeneratedActivityPage({
      params: Promise.resolve({
        programSlug: "kaelyn-adaptive",
        generatedId: "gen-1",
      }),
    }),
  );

  expect(html).toContain('data-program="kaelyn-adaptive"');
  expect(html).toContain('data-generated="gen-1"');
  expect(mocks.sessionLookup).not.toHaveBeenCalled();
});
