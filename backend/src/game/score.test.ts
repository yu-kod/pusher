import { describe, expect, it } from "vitest";
import { coin } from "../test-utils/cards.js";
import type { Card } from "./deck.js";
import { cardPoints, totalPoints } from "./score.js";

describe("cardPoints", () => {
  it("コインカードは印字されたコイン数が点数になる（docs/spec.md §4-2）", () => {
    expect(cardPoints(coin(1))).toBe(1);
    expect(cardPoints(coin(2))).toBe(2);
    expect(cardPoints(coin(3))).toBe(3);
  });

  it("イベントカードは 0 点（コイン数が印字されていない）", () => {
    expect(cardPoints({ kind: "event", event: "avalanche" })).toBe(0);
  });
});

describe("totalPoints", () => {
  it("カードの点数を合計する", () => {
    expect(totalPoints([coin(1), coin(3), coin(2)])).toBe(6);
  });

  it("イベントカードは合計に寄与しない", () => {
    const cards: Card[] = [coin(2), { kind: "event", event: "lottery" }, coin(3)];

    expect(totalPoints(cards)).toBe(5);
  });

  it("空配列なら 0", () => {
    expect(totalPoints([])).toBe(0);
  });
});
