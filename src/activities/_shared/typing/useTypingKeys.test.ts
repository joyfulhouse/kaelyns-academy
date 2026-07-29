import { isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { SpeakerButton } from "../ActivityChrome";
import { dispatchTypingKeydown } from "./useTypingKeys";
import type { KeydownLike } from "./typingKey";

interface SpeakerElementProps {
  onClick?: () => void;
  onPointerDown?: (event: { preventDefault: () => void }) => void;
}

function speakerElement(onSpeak: () => void, releasePointerFocus: boolean) {
  const element = SpeakerButton({ onSpeak, releasePointerFocus });
  if (!isValidElement<SpeakerElementProps>(element)) {
    throw new Error("Expected SpeakerButton to render a button");
  }
  return element;
}

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

  it("delivers Space to the game after pointer activation of the typing speaker", () => {
    const speaker = speakerElement(vi.fn(), true);
    const preventPointerFocus = vi.fn();
    speaker.props.onPointerDown?.({ preventDefault: preventPointerFocus });

    const emit = vi.fn();
    const space = keydown(" ", null);
    dispatchTypingKeydown(space, emit);

    expect(preventPointerFocus).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith({
      type: "char",
      char: " ",
      code: "Space",
      shiftKey: false,
    });
    expect(space.preventDefault).toHaveBeenCalledOnce();
  });

  it("leaves Space with a keyboard-focused speaker for native activation", () => {
    const onSpeak = vi.fn();
    const speaker = speakerElement(onSpeak, true);
    const emit = vi.fn();
    const space = keydown(" ", targetMatching("button"));

    dispatchTypingKeydown(space, emit);
    speaker.props.onClick?.();

    expect(emit).not.toHaveBeenCalled();
    expect(space.preventDefault).not.toHaveBeenCalled();
    expect(onSpeak).toHaveBeenCalledOnce();
  });

  it("withholds Enter from a focused button for native activation", () => {
    const emit = vi.fn();
    const enter = keydown("Enter", targetMatching("button"));

    dispatchTypingKeydown(enter, emit);

    expect(emit).not.toHaveBeenCalled();
    expect(enter.preventDefault).not.toHaveBeenCalled();
  });

  it("withholds every gameplay key from a focused text input", () => {
    const emit = vi.fn();

    dispatchTypingKeydown(keydown("a", targetMatching("input")), emit);
    dispatchTypingKeydown(keydown(" ", targetMatching("input")), emit);

    expect(emit).not.toHaveBeenCalled();
  });
});
