import { describe, expect, it } from "vitest";
import { PAYOUT_DRIFT, tossFrom } from "./cardFlight";

describe("tossFrom", () => {
  it("手札は卓の手前にあるので、カードは下から入ってくる", () => {
    expect(tossFrom(1, 3).y).toBeGreaterThan(0);
  });

  it("中央のレーンへはまっすぐ入る", () => {
    expect(tossFrom(1, 3).x).toBe(0);
  });

  it("左右のレーンへは、手前の中央から斜めに入る", () => {
    expect(tossFrom(0, 3).x).toBeGreaterThan(0);
    expect(tossFrom(2, 3).x).toBeLessThan(0);
  });

  it("端のレーンほど遠くから入る", () => {
    expect(Math.abs(tossFrom(0, 5).x)).toBeGreaterThan(Math.abs(tossFrom(1, 5).x));
  });

  it("レーンが1本なら、まっすぐ入る", () => {
    expect(tossFrom(0, 1).x).toBe(0);
  });
});

describe("PAYOUT_DRIFT", () => {
  it("落ちたカードは落下口から手前へ出てくる", () => {
    expect(PAYOUT_DRIFT.y).toBeGreaterThan(0);
  });
});
