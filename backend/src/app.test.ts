import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("createApp", () => {
  it("GET /api/health が ok を返す", async () => {
    const res = await createApp().request("/api/health");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "ok" });
  });

  it("未定義のパスは 404 を返す", async () => {
    const res = await createApp().request("/api/does-not-exist");

    expect(res.status).toBe(404);
  });
});
