import { describe, expect, it } from "vitest";
import { nextResolutionOrder, type RoundExit } from "./priority.js";

/** 席順4人ぶんの初期値 */
const SEATS = [0, 1, 2, 3];

function exit(playerIndex: number, tick: number, forced = false): RoundExit {
  return { playerIndex, tick, forced };
}

describe("nextResolutionOrder（docs/turn-structure.md §4-2）", () => {
  it("早く降りた順が次のラウンドの解決順になる", () => {
    const order = nextResolutionOrder(SEATS, [exit(2, 1), exit(0, 3), exit(3, 2), exit(1, 5)]);

    expect(order).toEqual([2, 3, 0, 1]);
  });

  it("同じティックで降りた人どうしは、前ラウンドの先行権の順", () => {
    // 前ラウンドの先行権が 3,2,1,0 なら、同着は 3 が先
    const order = nextResolutionOrder(
      [3, 2, 1, 0],
      [exit(0, 1), exit(1, 1), exit(2, 1), exit(3, 1)]
    );

    expect(order).toEqual([3, 2, 1, 0]);
  });

  it("降りさせられた人は、自分から降りた人より後ろ", () => {
    // 0 は1ティック目に横穴。3 は最後まで粘って自分で降りた
    const order = nextResolutionOrder(SEATS, [
      exit(0, 1, true),
      exit(1, 2, true),
      exit(2, 4),
      exit(3, 6),
    ]);

    expect(order).toEqual([2, 3, 0, 1]);
  });

  it("降りさせられた人どうしも、早いほうが先", () => {
    const order = nextResolutionOrder(SEATS, [
      exit(0, 5, true),
      exit(1, 1, true),
      exit(2, 3, true),
      exit(3, 2, true),
    ]);

    expect(order).toEqual([1, 3, 2, 0]);
  });

  it("前ラウンドの先行権を渡さなければ席順のまま扱う（初回）", () => {
    const order = nextResolutionOrder(
      SEATS,
      SEATS.map((p) => exit(p, 1))
    );

    expect(order).toEqual(SEATS);
  });

  it("全員ぶんの結果が揃っていなければ例外を投げる", () => {
    expect(() => nextResolutionOrder(SEATS, [exit(0, 1), exit(1, 2)])).toThrow(RangeError);
  });

  it("同じプレイヤーが二重に降りていたら例外を投げる", () => {
    expect(() =>
      nextResolutionOrder(SEATS, [exit(0, 1), exit(0, 2), exit(2, 3), exit(3, 4)])
    ).toThrow(RangeError);
  });

  it("元の配列を書き換えない", () => {
    const exits = [exit(3, 1), exit(2, 2), exit(1, 3), exit(0, 4)];
    const previous = [...SEATS];

    nextResolutionOrder(previous, exits);

    expect(previous).toEqual(SEATS);
    expect(exits.map((e) => e.playerIndex)).toEqual([3, 2, 1, 0]);
  });
});

describe("先行権に居ないプレイヤー", () => {
  it("前のラウンドに居ないプレイヤーが混ざっていたら例外を投げる", () => {
    expect(() =>
      nextResolutionOrder(SEATS, [exit(0, 1), exit(1, 2), exit(2, 3), exit(9, 4)])
    ).toThrow(RangeError);
  });
});
