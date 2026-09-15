import { describe, expect, it } from "vitest";
import { ApiError, messageOf, roomNotFound, unprocessable } from "./errors.js";

describe("ApiError", () => {
  it("ステータスコードとエラーコードを持つ", () => {
    const error = roomNotFound("ABCDEF");

    expect(error).toBeInstanceOf(ApiError);
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("ROOM_NOT_FOUND");
    expect(error.message).toContain("ABCDEF");
  });

  it("422 はルール違反に使う", () => {
    expect(unprocessable("だめ").statusCode).toBe(422);
  });
});

describe("messageOf", () => {
  it("Error からはメッセージを取り出す", () => {
    expect(messageOf(new Error("だめ"))).toBe("だめ");
  });

  it("Error でなければ文字列にする", () => {
    expect(messageOf("だめ")).toBe("だめ");
    expect(messageOf(42)).toBe("42");
  });
});
