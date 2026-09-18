import { describe, expect, it } from "vitest";

describe("ws エントリポイント", () => {
  it("handler をエクスポートする", async () => {
    const mod = await import("./ws.js");

    expect(typeof mod.handler).toBe("function");
  });
});
