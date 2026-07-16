import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

const focus = vi.hoisted(() => vi.fn());

vi.mock("react", async (importActual) => ({
  ...(await importActual<typeof import("react")>()),
  useEffect: (effect: () => void) => effect(),
  useRef: () => ({ current: { focus } }),
}));

import { CompletionHeading } from "./CompletionHeading";

describe("CompletionHeading", () => {
  it("moves focus to the newly mounted phase heading without scrolling", () => {
    const heading = CompletionHeading({ children: "You did it!" }) as ReactElement<{
      tabIndex: number;
    }>;

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(heading.type).toBe("h1");
    expect(heading.props.tabIndex).toBe(-1);
  });
});
