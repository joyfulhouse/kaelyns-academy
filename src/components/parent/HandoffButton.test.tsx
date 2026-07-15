import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { buildHandoffHref, completeHandoff, HandoffButton } from "./HandoffButton";

describe("HandoffButton", () => {
  it("names the learner in a clear device-passing action", () => {
    const html = renderToStaticMarkup(
      <HandoffButton learnerId="learner-1" learnerName="Kaelyn" />,
    );

    expect(html).toContain("Hand the device to Kaelyn");
    expect(html).toContain('type="button"');
  });

  it("puts only the learner id in the handoff URL, never the display name", () => {
    const href = buildHandoffHref("kaelyn-adaptive", "learner-1");

    expect(href).toBe("/learn/kaelyn-adaptive?handoff=learner-1");
    expect(href).not.toContain("Kaelyn");
  });

  it("does not navigate when the learner selection cannot be stored", async () => {
    const navigate = vi.fn();

    const result = await completeHandoff("learner-1", "kaelyn-adaptive", {
      lockParentArea: vi.fn(async () => ({ ok: true as const })),
      writeSelection: vi.fn(() => false),
      navigate,
    });

    expect(result).toMatchObject({ ok: false });
    expect(navigate).not.toHaveBeenCalled();
  });
});
