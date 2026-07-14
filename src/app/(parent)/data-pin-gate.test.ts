import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionOrNull: vi.fn(),
  getParentPinHash: vi.fn(),
  listLearners: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSessionOrNull: mocks.getSessionOrNull }));
vi.mock("@/lib/parent-pin-store", () => ({
  getParentPinHash: mocks.getParentPinHash,
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => undefined) })),
}));
vi.mock("@/lib/env", () => ({ getEnv: vi.fn(() => "test-secret") }));
vi.mock("@/lib/tutor/store", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/tutor/store")>()),
  listLearners: mocks.listLearners,
}));

import { getOverview } from "./data";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionOrNull.mockResolvedValue({
    user: { id: "account-1", email: "parent@example.com" },
  });
  mocks.getParentPinHash.mockResolvedValue("stored-hash");
});

describe("parent data PIN gate", () => {
  it("returns the locked empty overview with a valid session but no unlock cookie", async () => {
    await expect(getOverview()).resolves.toEqual({ learners: [], primary: null });
    expect(mocks.listLearners).not.toHaveBeenCalled();
  });
});
