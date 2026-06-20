import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("web app manifest", () => {
  it("is installable: standalone, root start_url, paper theme", () => {
    const m = manifest();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
    expect(m.theme_color).toBe("#fdf6e9");
    expect(m.background_color).toBe("#fdf6e9");
    expect(m.name).toBe("Kaelyn's Academy");
  });

  it("ships 192 + 512 + a maskable icon", () => {
    const icons = manifest().icons ?? [];
    const sizes = icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
    expect(icons.every((i) => i.type === "image/png")).toBe(true);
  });
});
