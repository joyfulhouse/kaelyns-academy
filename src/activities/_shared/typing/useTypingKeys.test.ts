import { describe, expect, it, vi } from "vitest";
import { dispatchTypingKeydown } from "./useTypingKeys";
import type { KeydownLike } from "./typingKey";

function targetMatching(selectorFragment: string | null): EventTarget {
  return {
    closest: (selector: string) => {
      return selectorFragment !== null && selector.includes(selectorFragment) ? {} : null;
    },
  } as unknown as EventTarget;
}

function keydown(
  key: string,
  target: EventTarget | null,
): KeydownLike & { target: EventTarget | null; preventDefault: () => void } {
  return {
    key,
    code: key === " " ? "Space" : `Key${key.toUpperCase()}`,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    target,
    preventDefault: vi.fn(),
  };
}

describe("dispatchTypingKeydown", () => {
  it("delivers a letter typed while a button keeps focus", () => {
    const emit = vi.fn();

    dispatchTypingKeydown(keydown("a", targetMatching("button")), emit);

    expect(emit).toHaveBeenCalledWith({
      type: "char",
      char: "a",
      code: "KeyA",
      shiftKey: false,
    });
  });

  it("withholds Space and Enter from a focused button for native activation", () => {
    const emit = vi.fn();
    const space = keydown(" ", targetMatching("button"));
    const enter = keydown("Enter", targetMatching("button"));

    dispatchTypingKeydown(space, emit);
    dispatchTypingKeydown(enter, emit);

    expect(emit).not.toHaveBeenCalled();
    expect(space.preventDefault).not.toHaveBeenCalled();
    expect(enter.preventDefault).not.toHaveBeenCalled();
  });

  it("withholds every gameplay key from a focused text input", () => {
    const emit = vi.fn();

    dispatchTypingKeydown(keydown("a", targetMatching("input")), emit);
    dispatchTypingKeydown(keydown(" ", targetMatching("input")), emit);

    expect(emit).not.toHaveBeenCalled();
  });
});
