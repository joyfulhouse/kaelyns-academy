import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOverview: vi.fn(),
  parentPinRequiresChallenge: vi.fn(),
  requireAccount: vi.fn(),
}));

vi.mock("@/app/(parent)/data", () => ({ getOverview: mocks.getOverview }));
vi.mock("@/lib/parent-pin-gate", () => ({
  parentPinRequiresChallenge: mocks.parentPinRequiresChallenge,
}));
vi.mock("@/lib/tenancy", () => ({ requireAccount: mocks.requireAccount }));
vi.mock("@/components/parent/PinChallenge", () => ({
  PinChallenge: () => <section>PIN challenge marker</section>,
}));

import ParentHomePage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAccount.mockResolvedValue({ accountId: "account-1", userId: "account-1" });
  mocks.parentPinRequiresChallenge.mockResolvedValue(true);
});

describe("ParentHomePage PIN gate", () => {
  it("renders PinChallenge before reading parent data when a soft navigation is locked", async () => {
    const html = renderToStaticMarkup(await ParentHomePage());

    expect(html).toContain("PIN challenge marker");
    expect(mocks.getOverview).not.toHaveBeenCalled();
  });
});
