import { describe, expect, it } from "vitest";
import { assignSeats, type SeatPosition } from "./seating";

/** 席だけを手番順（自分から時計回り）に並べて取り出す */
function positionsOf(count: number, myIndex: number): SeatPosition[] {
  const players = Array.from({ length: count }, (_, i) => `p${i}`);
  return assignSeats(players, myIndex).map((seat) => seat.position);
}

describe("assignSeats", () => {
  it("自分は必ず手前に座る", () => {
    for (let count = 1; count <= 4; count += 1) {
      for (let me = 0; me < count; me += 1) {
        expect(positionsOf(count, me)[0]).toBe("bottom");
      }
    }
  });

  it("2人なら向かい合う", () => {
    expect(positionsOf(2, 0)).toEqual(["bottom", "top"]);
  });

  it("3人なら自分を挟んで左右に座る", () => {
    expect(positionsOf(3, 0)).toEqual(["bottom", "left", "right"]);
  });

  it("4人なら四方を埋める", () => {
    expect(positionsOf(4, 0)).toEqual(["bottom", "left", "top", "right"]);
  });

  it("手番順（時計回り）に並べる", () => {
    const players = ["A", "B", "C", "D"];
    // 自分が B なら、次の手番 C が左、D が上、A が右
    expect(assignSeats(players, 1).map((seat) => seat.player)).toEqual(["B", "C", "D", "A"]);
  });

  it("元の並びでの位置を持ち続ける", () => {
    const seats = assignSeats(["A", "B", "C"], 2);
    expect(seats.map((seat) => seat.index)).toEqual([2, 0, 1]);
  });

  it("5人以上なら余りは向かいに座る", () => {
    expect(positionsOf(5, 0)).toEqual(["bottom", "top", "top", "top", "top"]);
  });

  it("誰もいなければ席もない", () => {
    expect(assignSeats([], 0)).toEqual([]);
  });
});
