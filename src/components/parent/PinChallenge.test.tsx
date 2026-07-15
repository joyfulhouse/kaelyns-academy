import {
  isValidElement,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actionMocks = vi.hoisted(() => ({
  verifyPin: vi.fn(),
  clearPin: vi.fn(),
  refresh: vi.fn(),
}));

const hookHarness = vi.hoisted(() => {
  let values: unknown[] = [];
  let cursor = 0;
  let transitions: Promise<void>[] = [];

  return {
    reset() {
      values = [];
      cursor = 0;
      transitions = [];
    },
    beginRender() {
      cursor = 0;
    },
    useState<T>(initial: T | (() => T)) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) {
        values[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      }
      const setValue = (next: T | ((previous: T) => T)) => {
        const previous = values[index] as T;
        values[index] =
          typeof next === "function" ? (next as (current: T) => T)(previous) : next;
      };
      return [values[index] as T, setValue] as const;
    },
    useTransition() {
      const startTransition = (callback: () => void | Promise<void>) => {
        const result = callback();
        if (result instanceof Promise) transitions.push(result);
      };
      return [false, startTransition] as const;
    },
    async flushTransitions() {
      const pending = transitions;
      transitions = [];
      await Promise.all(pending);
    },
  };
});

vi.mock("react", async (importActual) => ({
  ...(await importActual<typeof import("react")>()),
  useEffect: vi.fn(),
  useState: hookHarness.useState,
  useTransition: hookHarness.useTransition,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: actionMocks.refresh }) }));
vi.mock("@/app/(parent)/pin-actions", () => ({
  verifyParentPinAction: actionMocks.verifyPin,
  clearParentPinByPasswordAction: actionMocks.clearPin,
}));

import { PinChallenge, PinChallengeStatus } from "./PinChallenge";

interface TestElementProps {
  children?: ReactNode | ((field: Record<string, unknown>) => ReactNode);
  id?: string;
  onChange?: (event: { target: { value: string } }) => void;
  onClick?: () => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  value?: string;
}

beforeEach(() => {
  hookHarness.reset();
  vi.clearAllMocks();
});

function renderChallenge(): ReactElement<TestElementProps> {
  hookHarness.beginRender();
  return PinChallenge() as ReactElement<TestElementProps>;
}

function findElement(
  node: ReactNode,
  predicate: (element: ReactElement<TestElementProps>) => boolean,
): ReactElement<TestElementProps> {
  if (Array.isArray(node)) {
    for (const child of node) {
      try {
        return findElement(child, predicate);
      } catch {
        // Continue through siblings until a match is found.
      }
    }
  }

  if (isValidElement<TestElementProps>(node)) {
    if (predicate(node)) return node;
    return findElement(node.props.children as ReactNode, predicate);
  }

  throw new Error("Expected element was not rendered.");
}

function fieldInput(tree: ReactNode, id: string): ReactElement<TestElementProps> {
  const field = findElement(tree, (element) => element.props.id === id);
  if (typeof field.props.children !== "function") {
    throw new Error(`Field ${id} did not expose its input renderer.`);
  }
  const input = field.props.children({ id, name: id });
  if (!isValidElement<TestElementProps>(input)) {
    throw new Error(`Field ${id} did not render an input.`);
  }
  return input;
}

function click(tree: ReactNode, label: string): void {
  const control = findElement(
    tree,
    (element) =>
      typeof element.props.onClick === "function" &&
      textContent(element.props.children as ReactNode).includes(label),
  );
  control.props.onClick?.();
}

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (isValidElement<TestElementProps>(node)) {
    return textContent(node.props.children as ReactNode);
  }
  return "";
}

function changeInput(tree: ReactNode, id: string, value: string): void {
  fieldInput(tree, id).props.onChange?.({ target: { value } });
}

function submitForm(tree: ReactNode): void {
  const form = findElement(tree, (element) => element.type === "form");
  form.props.onSubmit?.({ preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>);
}

describe("PinChallenge", () => {
  it("renders an accessible numeric PIN prompt and recovery control", () => {
    const html = renderToStaticMarkup(<PinChallenge />);

    expect(html).toContain("Enter your grown-up PIN");
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain('maxLength="6"');
    expect(html).toContain("Forgot PIN?");
  });

  it("empties the PIN input after a rate-limited attempt", async () => {
    actionMocks.verifyPin.mockResolvedValue({
      ok: false,
      reason: "rate-limited",
      message: "Too many tries.",
      retryAfterSec: 60,
    });
    let tree = renderChallenge();
    changeInput(tree, "parent-pin", "8642");
    tree = renderChallenge();

    submitForm(tree);
    await hookHarness.flushTransitions();
    tree = renderChallenge();

    expect(fieldInput(tree, "parent-pin").props.value).toBe("");
  });

  it("empties the recovery password after a failed submission", async () => {
    actionMocks.clearPin.mockResolvedValue({
      ok: false,
      reason: "reauth-failed",
      message: "That password didn’t match. Try again.",
    });
    let tree = renderChallenge();
    click(tree, "Forgot PIN?");
    tree = renderChallenge();
    changeInput(tree, "parent-pin-password", "correct horse battery staple");
    tree = renderChallenge();

    submitForm(tree);
    await hookHarness.flushTransitions();
    tree = renderChallenge();

    expect(fieldInput(tree, "parent-pin-password").props.value).toBe("");
  });

  it("empties the recovery password after a rate-limited submission", async () => {
    actionMocks.clearPin.mockResolvedValue({
      ok: false,
      reason: "rate-limited",
      message: "Too many tries.",
      retryAfterSec: 300,
    });
    let tree = renderChallenge();
    click(tree, "Forgot PIN?");
    tree = renderChallenge();
    changeInput(tree, "parent-pin-password", "correct horse battery staple");
    tree = renderChallenge();

    submitForm(tree);
    await hookHarness.flushTransitions();
    tree = renderChallenge();

    expect(fieldInput(tree, "parent-pin-password").props.value).toBe("");
  });

  it("empties credentials whenever recovery view is entered or exited", () => {
    let tree = renderChallenge();
    changeInput(tree, "parent-pin", "8642");
    tree = renderChallenge();
    click(tree, "Forgot PIN?");
    tree = renderChallenge();
    changeInput(tree, "parent-pin-password", "correct horse battery staple");
    tree = renderChallenge();

    click(tree, "Back");
    tree = renderChallenge();
    expect(fieldInput(tree, "parent-pin").props.value).toBe("");

    click(tree, "Forgot PIN?");
    tree = renderChallenge();
    expect(fieldInput(tree, "parent-pin-password").props.value).toBe("");
  });

  it("empties the PIN input after a thrown attempt", async () => {
    actionMocks.verifyPin.mockRejectedValue(new Error("network down"));
    let tree = renderChallenge();
    changeInput(tree, "parent-pin", "8642");
    tree = renderChallenge();

    submitForm(tree);
    await hookHarness.flushTransitions();
    tree = renderChallenge();

    expect(fieldInput(tree, "parent-pin").props.value).toBe("");
  });

  it("empties the recovery password after a thrown attempt", async () => {
    actionMocks.clearPin.mockRejectedValue(new Error("network down"));
    let tree = renderChallenge();
    click(tree, "Forgot PIN?");
    tree = renderChallenge();
    changeInput(tree, "parent-pin-password", "correct horse battery staple");
    tree = renderChallenge();

    submitForm(tree);
    await hookHarness.flushTransitions();
    tree = renderChallenge();

    expect(fieldInput(tree, "parent-pin-password").props.value).toBe("");
  });

  it("starts with empty credentials after unmounting and remounting", () => {
    let tree = renderChallenge();
    click(tree, "Forgot PIN?");
    tree = renderChallenge();
    changeInput(tree, "parent-pin-password", "correct horse battery staple");

    hookHarness.reset();
    tree = renderChallenge();
    expect(fieldInput(tree, "parent-pin").props.value).toBe("");
    click(tree, "Forgot PIN?");
    tree = renderChallenge();
    expect(fieldInput(tree, "parent-pin-password").props.value).toBe("");
  });
});

describe("PinChallengeStatus", () => {
  it("renders a calm incorrect-PIN error", () => {
    const html = renderToStaticMarkup(
      <PinChallengeStatus message="That PIN didn’t match. Try again." retryAfterSec={null} />,
    );

    expect(html).toContain("That PIN didn’t match. Try again.");
    expect(html).toContain('role="alert"');
  });

  it("renders the cooldown duration", () => {
    const html = renderToStaticMarkup(
      <PinChallengeStatus message="Too many tries." retryAfterSec={42} />,
    );

    expect(html).toContain("Try again in 42 seconds.");
  });
});
