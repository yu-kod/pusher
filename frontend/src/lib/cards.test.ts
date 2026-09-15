import { describe, expect, it } from "vitest";
import { cardLabel } from "./cards";
import { coin, eventCard } from "@/test-utils/game";

describe("cardLabel", () => {
  it("コイン札はコイン数で呼ぶ", () => {
    expect(cardLabel(coin(2))).toBe("2コイン札");
  });

  it("イベント札はイベント名で呼ぶ", () => {
    expect(cardLabel(eventCard("lottery"))).toBe("イベント: lottery");
  });
});
