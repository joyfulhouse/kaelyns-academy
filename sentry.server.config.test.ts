import type { Event } from "@sentry/nextjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentryMocks = vi.hoisted(() => ({
  httpIntegration: vi.fn<(options: unknown) => object>(() => ({ name: "Http" })),
  init: vi.fn<(options: unknown) => void>(),
}));

vi.mock("@sentry/nextjs", () => sentryMocks);

interface HttpIntegrationOptionsUnderTest {
  ignoreIncomingRequestBody?: (url: string) => boolean;
}

interface InitOptionsUnderTest {
  beforeSend?: (event: Event) => Event | null | PromiseLike<Event | null>;
  dataCollection?: {
    cookies?: unknown;
    httpBodies?: unknown[];
  };
}

describe("Sentry request privacy", () => {
  beforeEach(() => {
    vi.resetModules();
    sentryMocks.httpIntegration.mockClear();
    sentryMocks.init.mockClear();
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@example.invalid/1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("disables all incoming body capture and strips credentials in the server runtime", async () => {
    await import("./sentry.server.config");

    const httpOptions = sentryMocks.httpIntegration.mock.calls[0]?.[0] as
      | HttpIntegrationOptionsUnderTest
      | undefined;
    expect(httpOptions?.ignoreIncomingRequestBody?.("/api/unrelated-server-action")).toBe(true);
    await expectCredentialFieldsStripped();
  });

  it("disables body and cookie collection and strips credentials in the edge runtime", async () => {
    await import("./sentry.edge.config");

    expect(sentryMocks.httpIntegration).not.toHaveBeenCalled();
    const initOptions = getInitOptions();
    expect(initOptions?.dataCollection).toMatchObject({
      cookies: false,
      httpBodies: [],
    });
    await expectCredentialFieldsStripped();
  });
});

function getInitOptions(): InitOptionsUnderTest | undefined {
  return sentryMocks.init.mock.calls[0]?.[0] as InitOptionsUnderTest | undefined;
}

async function expectCredentialFieldsStripped(): Promise<void> {
  const event: Event = {
    request: {
      url: "https://kaelyns.academy/parent/settings",
      data: {
        pin: "SENTINEL_PIN_1234",
        password: "SENTINEL_PW",
      },
      cookies: {
        session: "SENTINEL_COOKIE",
      },
    },
  };

  const scrubbed = await getInitOptions()?.beforeSend?.(event);

  expect(scrubbed).toBe(event);
  expect(event.request?.data).toBeUndefined();
  expect(event.request?.cookies).toBeUndefined();
  expect(JSON.stringify(event)).not.toContain("SENTINEL_PIN_1234");
  expect(JSON.stringify(event)).not.toContain("SENTINEL_PW");
}
