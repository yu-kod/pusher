import { describe, expect, it } from "vitest";
import { createRng } from "./rng.js";
import { DEFAULT_BALANCE } from "./balance.js";
import { setupGame } from "./setup.js";
import { faceDown } from "../test-utils/cards.js";
import { calculateTarget, classifyRoll, insertCards, type RollOutcome } from "./turn.js";

describe("calculateTarget", () => {
  it("投入カードのコイン数と滞留枚数の合計になる（docs/spec.md §3）", () => {
    expect(calculateTarget(2, 3)).toBe(5);
  });

  it("滞留が空なら投入カードのコイン数そのものになる", () => {
    expect(calculateTarget(1, 0)).toBe(1);
    expect(calculateTarget(3, 0)).toBe(3);
  });

  it("2枚同時投入ではコイン数の合計を渡せる（docs/spec.md §6 投入口増設）", () => {
    expect(calculateTarget(3 + 2, 4)).toBe(9);
  });

  it("コイン数が 1 未満なら例外を投げる", () => {
    expect(() => calculateTarget(0, 0)).toThrow(RangeError);
  });

  it("滞留枚数が負なら例外を投げる", () => {
    expect(() => calculateTarget(1, -1)).toThrow(RangeError);
  });

  it("整数でなければ例外を投げる", () => {
    expect(() => calculateTarget(1.5, 0)).toThrow(RangeError);
    expect(() => calculateTarget(1, 0.5)).toThrow(RangeError);
  });
});

describe("classifyRoll", () => {
  /**
   * docs/spec.md §3 §5 の判定を出目 1〜6 × 目標値 1〜8 で網羅する。
   *
   * - 出目 ≦ 目標値 → 成功
   * - 出目 > 目標値 → 失敗
   * - 出目が 6 かつ 目標値が 6 以上 → 横穴（成功より優先）
   */
  const expected: Record<number, RollOutcome[]> = {
    // 目標値: [出目1, 出目2, 出目3, 出目4, 出目5, 出目6]
    1: ["success", "failure", "failure", "failure", "failure", "failure"],
    2: ["success", "success", "failure", "failure", "failure", "failure"],
    3: ["success", "success", "success", "failure", "failure", "failure"],
    4: ["success", "success", "success", "success", "failure", "failure"],
    5: ["success", "success", "success", "success", "success", "failure"],
    6: ["success", "success", "success", "success", "success", "sideHole"],
    7: ["success", "success", "success", "success", "success", "sideHole"],
    8: ["success", "success", "success", "success", "success", "sideHole"],
  };

  for (const [target, outcomes] of Object.entries(expected)) {
    for (const [index, outcome] of outcomes.entries()) {
      const roll = index + 1;
      it(`目標値 ${target} で出目 ${roll} なら ${outcome}`, () => {
        expect(classifyRoll(roll, Number(target))).toBe(outcome);
      });
    }
  }

  it("目標値が 6 以上でも出目 6 以外は横穴にならない", () => {
    expect(classifyRoll(5, 9)).toBe("success");
  });

  it("目標値が 5 以下の出目 6 は横穴ではなく失敗", () => {
    expect(classifyRoll(6, 5)).toBe("failure");
  });

  it("成功率の上限は 83%（6分の5）に固定される（docs/spec.md §5）", () => {
    const successes = [1, 2, 3, 4, 5, 6].filter((roll) => classifyRoll(roll, 100) === "success");
    expect(successes).toHaveLength(5);
  });

  it("出目が 1〜6 の範囲外なら例外を投げる", () => {
    expect(() => classifyRoll(0, 3)).toThrow(RangeError);
    expect(() => classifyRoll(7, 3)).toThrow(RangeError);
    expect(() => classifyRoll(1.5, 3)).toThrow(RangeError);
  });

  it("目標値が 1 未満なら例外を投げる", () => {
    expect(() => classifyRoll(1, 0)).toThrow(RangeError);
  });
});

describe("insertCards", () => {
  /** 手札を指定のカードに差し替えた初期状態を作る */
  function stateWithHand(coins: readonly (1 | 2 | 3)[], pendingCount = 0) {
    const base = setupGame(["A", "B", "C"], createRng(1), DEFAULT_BALANCE);
    const players = base.players.map((p, i) =>
      i === 0 ? { ...p, hand: coins.map((c) => ({ kind: "coin" as const, coins: c })) } : p
    );
    const lanes = base.lanes.map((lane, i) =>
      i === 0
        ? {
            ...lane,
            pending: faceDown(Array.from({ length: pendingCount }, () => base.drawPile[0]!)),
          }
        : lane
    );
    return { ...base, players, lanes };
  }

  it("手札のカードを滞留エリアへ移す（docs/spec.md §3）", () => {
    const state = stateWithHand([2, 1]);

    const result = insertCards(state, 0, [0]);

    expect(result.state.lanes[0]?.pending).toHaveLength(1);
    expect(result.state.lanes[0]?.pending[0]).toEqual({
      card: { kind: "coin", coins: 2 },
      faceUp: false,
    });
  });

  it("投入したカードを手札から取り除く", () => {
    const state = stateWithHand([2, 1]);

    const result = insertCards(state, 0, [0]);

    expect(result.state.players[0]?.hand).toEqual([{ kind: "coin", coins: 1 }]);
  });

  it("投入前の滞留枚数から目標値を算出する", () => {
    const state = stateWithHand([2], 3);

    expect(insertCards(state, 0, [0]).target).toBe(5);
  });

  it("元の状態を変更しない", () => {
    const state = stateWithHand([2, 1]);

    insertCards(state, 0, [0]);

    expect(state.players[0]?.hand).toHaveLength(2);
    expect(state.lanes[0]?.pending).toHaveLength(0);
  });

  it("手番プレイヤーの手札から投入する", () => {
    const state = { ...stateWithHand([2, 1]), currentPlayerIndex: 1 };

    // 手番は B なので、A の手札は減らない
    const result = insertCards(state, 0, [0]);

    expect(result.state.players[0]?.hand).toHaveLength(2);
    expect(result.state.players[1]?.hand).toHaveLength(4);
  });

  describe("投入口増設", () => {
    it("マーカーがあれば 2 枚同時に投入できる（docs/spec.md §6）", () => {
      const base = stateWithHand([3, 2, 1]);
      const state = {
        ...base,
        lanes: base.lanes.map((l, i) => (i === 0 ? { ...l, hasExtraSlot: true } : l)),
      };

      const result = insertCards(state, 0, [0, 1]);

      expect(result.state.lanes[0]?.pending).toHaveLength(2);
      expect(result.target).toBe(5);
    });

    it("マーカーがなければ 2 枚同時に投入できない", () => {
      const state = stateWithHand([3, 2]);

      expect(() => insertCards(state, 0, [0, 1])).toThrow(Error);
    });

    it("マーカーがあっても 3 枚は投入できない", () => {
      const base = stateWithHand([3, 2, 1]);
      const state = {
        ...base,
        lanes: base.lanes.map((l, i) => (i === 0 ? { ...l, hasExtraSlot: true } : l)),
      };

      expect(() => insertCards(state, 0, [0, 1, 2])).toThrow(Error);
    });
  });

  describe("入力の検証", () => {
    it("1 枚も指定しなければ例外を投げる", () => {
      expect(() => insertCards(stateWithHand([2]), 0, [])).toThrow(Error);
    });

    it("存在しないレーンなら例外を投げる", () => {
      expect(() => insertCards(stateWithHand([2]), 9, [0])).toThrow(RangeError);
      expect(() => insertCards(stateWithHand([2]), -1, [0])).toThrow(RangeError);
    });

    it("存在しない手札の添字なら例外を投げる", () => {
      expect(() => insertCards(stateWithHand([2]), 0, [5])).toThrow(RangeError);
      expect(() => insertCards(stateWithHand([2]), 0, [-1])).toThrow(RangeError);
    });

    it("同じ手札を 2 回指定したら例外を投げる", () => {
      const base = stateWithHand([3, 2]);
      const state = {
        ...base,
        lanes: base.lanes.map((l, i) => (i === 0 ? { ...l, hasExtraSlot: true } : l)),
      };

      expect(() => insertCards(state, 0, [0, 0])).toThrow(Error);
    });

    it("手番プレイヤーの添字が範囲外なら例外を投げる", () => {
      const state = { ...stateWithHand([2]), currentPlayerIndex: 99 };

      expect(() => insertCards(state, 0, [0])).toThrow(RangeError);
    });

    it("イベントカードは投入できない（docs/spec.md ルール解釈メモ）", () => {
      const base = setupGame(["A", "B", "C"], createRng(1), DEFAULT_BALANCE);
      const state = {
        ...base,
        players: base.players.map((p, i) =>
          i === 0 ? { ...p, hand: [{ kind: "event" as const, event: "avalanche" as const }] } : p
        ),
      };

      expect(() => insertCards(state, 0, [0])).toThrow(/イベントカード/);
    });
  });
});
