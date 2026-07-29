import { describe, expect, it, vi } from "vitest";
import { dispatchTypingKeydown } from "./useTypingKeys";
import type { KeydownLike } from "./typingKey";

function targetMatching(
  selectorFragment: string | null,
  focusVisible = false,
): EventTarget {
  const control = {
    matches: vi.fn((selector: string) => selector === ":focus-visible" && focusVisible),
  };
  return {
    closest: (selector: string) => {
      return selectorFragment !== null && selector.includes(selectorFragment)
        ? control
        : null;
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
  it.each([false, true])(
    "delivers a letter when an activatable is focus-visible=%s",
    (focusVisible) => {
      const emit = vi.fn();

      dispatchTypingKeydown(keydown("a", targetMatching("button", focusVisible)), emit);

      expect(emit).toHaveBeenCalledWith({
        type: "char",
        char: "a",
        code: "KeyA",
        shiftKey: false,
      });
    },
  );

  it("delivers Space and prevents its native action on a pointer-focused activatable", () => {
    const emit = vi.fn();
    const space = keydown(" ", targetMatching("button"));

    dispatchTypingKeydown(space, emit);

    expect(emit).toHaveBeenCalledWith({
      type: "char",
      char: " ",
      code: "Space",
      shiftKey: false,
    });
    expect(space.preventDefault).toHaveBeenCalledOnce();
  });

  it("leaves Space and Enter with a keyboard-focused activatable", () => {
    const emit = vi.fn();
    const target = targetMatching("button", true);
    const space = keydown(" ", target);
    const enter = keydown("Enter", target);

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
