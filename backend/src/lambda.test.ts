import { describe, expect, it } from "vitest";

describe("lambda エントリポイント", () => {
  it("handler をエクスポートする", async () => {
    const mod = await import("./lambda.js");

    expect(typeof mod.handler).toBe("function");
  });
});
