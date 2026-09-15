import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { messageOf } from "./errors";

describe("messageOf", () => {
  it("API のエラーはサーバーのメッセージをそのまま出す", () => {
    expect(messageOf(new ApiError("UNPROCESSABLE", "ルームが満員", 422))).toBe("ルームが満員");
  });

  it("それ以外は通信エラーとして扱う", () => {
    expect(messageOf(new TypeError("Failed to fetch"))).toBe("通信に失敗しました");
    expect(messageOf("なにか")).toBe("通信に失敗しました");
  });
});
