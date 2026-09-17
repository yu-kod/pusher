import { describe, expect, it } from "vitest";
import { createRng } from "./rng.js";
import { DEFAULT_BALANCE, withPreset } from "./balance.js";
import { setupGame, type GameState } from "./setup.js";
import { coin, faceDown } from "../test-utils/cards.js";
import { calculateTarget, classifyRoll, insertIntoLanes, type RollOutcome } from "./turn.js";

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

/** 既定の横穴条件（docs/spec.md §5）: 出目6は目標値によらず常に横穴 */
const DEFAULT_SIDE_HOLE = DEFAULT_BALANCE.sideHole;

describe("classifyRoll", () => {
  /**
   * docs/spec.md §3 §5 の判定を出目 1〜6 × 目標値 1〜8 で網羅する。
   *
   * - 出目 ≦ 目標値 → 成功
   * - 出目 > 目標値 → 失敗
   * - 出目が 6 → 横穴（成功より優先。目標値を問わない）
   */
  const expected: Record<number, RollOutcome[]> = {
    // 目標値: [出目1, 出目2, 出目3, 出目4, 出目5, 出目6]
    1: ["success", "failure", "failure", "failure", "failure", "sideHole"],
    2: ["success", "success", "failure", "failure", "failure", "sideHole"],
    3: ["success", "success", "success", "failure", "failure", "sideHole"],
    4: ["success", "success", "success", "success", "failure", "sideHole"],
    5: ["success", "success", "success", "success", "success", "sideHole"],
    6: ["success", "success", "success", "success", "success", "sideHole"],
    7: ["success", "success", "success", "success", "success", "sideHole"],
    8: ["success", "success", "success", "success", "success", "sideHole"],
  };

  for (const [target, outcomes] of Object.entries(expected)) {
    for (const [index, outcome] of outcomes.entries()) {
      const roll = index + 1;
      it(`目標値 ${target} で出目 ${roll} なら ${outcome}`, () => {
        expect(classifyRoll(roll, Number(target), DEFAULT_SIDE_HOLE)).toBe(outcome);
      });
    }
  }

  it("出目 6 以外は横穴にならない", () => {
    expect(classifyRoll(5, 9, DEFAULT_SIDE_HOLE)).toBe("success");
  });

  it("目標値が低くても出目 6 は横穴になる（逃げ道を作らない / #67）", () => {
    expect(classifyRoll(6, 1, DEFAULT_SIDE_HOLE)).toBe("sideHole");
    expect(classifyRoll(6, 5, DEFAULT_SIDE_HOLE)).toBe("sideHole");
  });

  it("成功率の上限は 83%（6分の5）に固定される（docs/spec.md §5）", () => {
    const successes = [1, 2, 3, 4, 5, 6].filter(
      (roll) => classifyRoll(roll, 100, DEFAULT_SIDE_HOLE) === "success"
    );
    expect(successes).toHaveLength(5);
  });

  it("出目が 1〜6 の範囲外なら例外を投げる", () => {
    expect(() => classifyRoll(0, 3, DEFAULT_SIDE_HOLE)).toThrow(RangeError);
    expect(() => classifyRoll(7, 3, DEFAULT_SIDE_HOLE)).toThrow(RangeError);
    expect(() => classifyRoll(1.5, 3, DEFAULT_SIDE_HOLE)).toThrow(RangeError);
  });

  it("目標値が 1 未満なら例外を投げる", () => {
    expect(() => classifyRoll(1, 0, DEFAULT_SIDE_HOLE)).toThrow(RangeError);
  });
});

describe("classifyRoll — 横穴の条件を変えた場合（#67）", () => {
  it("目標値の下限を 6 にすると、目標値5以下の出目6は失敗に戻る（#67 以前の既定）", () => {
    const rule = { minRoll: 6, minTarget: 6 };

    expect(classifyRoll(6, 6, rule)).toBe("sideHole");
    expect(classifyRoll(6, 5, rule)).toBe("failure");
    expect(classifyRoll(5, 5, rule)).toBe("success");
  });

  it("出目の下限を 5 にすると、出目5も横穴になり成功率の上限が 4/6 になる", () => {
    const rule = { minRoll: 5, minTarget: 6 };

    expect(classifyRoll(5, 6, rule)).toBe("sideHole");
    expect(classifyRoll(6, 6, rule)).toBe("sideHole");
    expect(classifyRoll(4, 6, rule)).toBe("success");
    // 目標値が下限未満なら、出目5は通常どおり成功
    expect(classifyRoll(5, 5, rule)).toBe("success");
  });
});

describe("insertIntoLanes", () => {
  /**
   * 手番プレイヤーの手札と、先頭レーンの滞留枚数を指定した初期状態を作る。
   *
   * 複数レーンへの同時投入は既定では 1レーンに制限されている（#55）ため、
   * その振る舞いを見るテストでは multiLane を適用する。
   */
  function stateWithHand(coins: readonly (1 | 2 | 3)[], pendingCount = 0, multiLane = false) {
    const base = setupGame(
      ["A", "B", "C"],
      createRng(1),
      multiLane ? withPreset("multiLane") : DEFAULT_BALANCE
    );
    const players = base.players.map((p, i) =>
      i === 0 ? { ...p, hand: coins.map((c) => ({ kind: "coin" as const, coins: c })) } : p
    );
    const lanes = base.lanes.map((lane, i) => ({
      ...lane,
      pending: i === 0 ? faceDown(Array.from({ length: pendingCount }, () => coin(1))) : [],
    }));
    return { ...base, players, lanes };
  }

  /** 1レーンへ1枚だけ投入する（よく使う最小の指定） */
  const intoLane = (laneIndex: number, handIndexes: readonly number[]) => [
    { laneIndex, handIndexes },
  ];

  it("手札のカードを滞留エリアへ移す（docs/spec.md §3）", () => {
    const state = stateWithHand([2, 1]);

    const result = insertIntoLanes(state, intoLane(0, [0]));

    expect(result.state.lanes[0]?.pending).toEqual([
      { card: { kind: "coin", coins: 2 }, faceUp: false },
    ]);
  });

  it("投入したカードを手札から取り除く", () => {
    const state = stateWithHand([2, 1]);

    const result = insertIntoLanes(state, intoLane(0, [0]));

    expect(result.state.players[0]?.hand).toEqual([{ kind: "coin", coins: 1 }]);
  });

  it("投入前の滞留枚数から目標値を算出する", () => {
    const state = stateWithHand([2], 3);

    expect(insertIntoLanes(state, intoLane(0, [0])).lanes[0]?.target).toBe(5);
  });

  it("元の状態を変更しない", () => {
    const state = stateWithHand([2, 1]);

    insertIntoLanes(state, intoLane(0, [0]));

    expect(state.players[0]?.hand).toHaveLength(2);
    expect(state.lanes[0]?.pending).toHaveLength(0);
  });

  it("手番プレイヤーの手札から投入する", () => {
    const base = stateWithHand([2, 1]);
    const state = {
      ...base,
      // 手番は B。B の手札もコイン札に固定しておく（配られる札にイベントが混ざるため）
      players: base.players.map((p, i) =>
        i === 1 ? { ...p, hand: [coin(1), coin(1), coin(1), coin(1), coin(1)] } : p
      ),
      currentPlayerIndex: 1,
    };

    // 手番は B なので、A の手札は減らない
    const result = insertIntoLanes(state, intoLane(0, [0]));

    expect(result.state.players[0]?.hand).toHaveLength(2);
    expect(result.state.players[1]?.hand).toHaveLength(4);
  });

  describe("複数レーンへの同時投入（config.maxLanesPerRound を上げた場合）", () => {
    it("各レーンへ1枚ずつ同時に投入できる", () => {
      const state = stateWithHand([3, 2, 1], 0, true);

      const result = insertIntoLanes(state, [
        { laneIndex: 0, handIndexes: [0] },
        { laneIndex: 1, handIndexes: [1] },
        { laneIndex: 2, handIndexes: [2] },
      ]);

      expect(result.state.lanes.map((l) => l.pending.length)).toEqual([1, 1, 1]);
      expect(result.state.players[0]?.hand).toEqual([]);
    });

    it("投入しなかったレーンには何も入らない", () => {
      const state = stateWithHand([3, 2, 1]);

      const result = insertIntoLanes(state, intoLane(1, [0]));

      expect(result.state.lanes.map((l) => l.pending.length)).toEqual([0, 1, 0]);
      expect(result.state.players[0]?.hand).toHaveLength(2);
    });

    it("手札の添字は投入前の手札に対する添字として解釈する", () => {
      const state = stateWithHand([3, 2, 1], 0, true);

      const result = insertIntoLanes(state, [
        { laneIndex: 0, handIndexes: [0] },
        { laneIndex: 1, handIndexes: [2] },
      ]);

      expect(result.state.lanes[0]?.pending[0]?.card).toEqual({ kind: "coin", coins: 3 });
      expect(result.state.lanes[1]?.pending[0]?.card).toEqual({ kind: "coin", coins: 1 });
      // 残るのは投入しなかった 2コイン札
      expect(result.state.players[0]?.hand).toEqual([{ kind: "coin", coins: 2 }]);
    });

    it("レーンごとの内訳を左から順に返す（§3 の解決順）", () => {
      const state = stateWithHand([3, 1], 2, true);

      const result = insertIntoLanes(state, [
        { laneIndex: 2, handIndexes: [1] },
        { laneIndex: 0, handIndexes: [0] },
      ]);

      expect(result.lanes).toEqual([
        // 滞留2枚のレーンなので 3 + 2
        { laneIndex: 0, insertedCoins: 3, target: 5 },
        { laneIndex: 2, insertedCoins: 1, target: 1 },
      ]);
    });
  });

  describe("投入口増設", () => {
    /** 先頭レーンに増設マーカーを置いた状態にする */
    function withExtraSlot(state: GameState): GameState {
      return {
        ...state,
        lanes: state.lanes.map((l, i) => (i === 0 ? { ...l, hasExtraSlot: true } : l)),
      };
    }

    it("マーカーがあれば 2 枚同時に投入できる（docs/spec.md §6）", () => {
      const state = withExtraSlot(stateWithHand([3, 2, 1]));

      const result = insertIntoLanes(state, intoLane(0, [0, 1]));

      expect(result.state.lanes[0]?.pending).toHaveLength(2);
      expect(result.lanes[0]?.target).toBe(5);
    });

    it("マーカーがなければ 2 枚同時に投入できない", () => {
      const state = stateWithHand([3, 2]);

      expect(() => insertIntoLanes(state, intoLane(0, [0, 1]))).toThrow(Error);
    });

    it("マーカーがあっても 3 枚は投入できない", () => {
      const state = withExtraSlot(stateWithHand([3, 2, 1]));

      expect(() => insertIntoLanes(state, intoLane(0, [0, 1, 2]))).toThrow(Error);
    });

    it("同じ手札を 2 回指定したら例外を投げる", () => {
      const state = withExtraSlot(stateWithHand([3, 2]));

      expect(() => insertIntoLanes(state, intoLane(0, [0, 0]))).toThrow(Error);
    });
  });

  describe("入力の検証", () => {
    it("1レーンも指定しなければ例外を投げる（最低1枚は投入する）", () => {
      expect(() => insertIntoLanes(stateWithHand([2]), [])).toThrow(Error);
    });

    it("1 枚も指定しなければ例外を投げる", () => {
      expect(() => insertIntoLanes(stateWithHand([2]), intoLane(0, []))).toThrow(Error);
    });

    it("存在しないレーンなら例外を投げる", () => {
      expect(() => insertIntoLanes(stateWithHand([2]), intoLane(9, [0]))).toThrow(RangeError);
      expect(() => insertIntoLanes(stateWithHand([2]), intoLane(-1, [0]))).toThrow(RangeError);
    });

    it("存在しない手札の添字なら例外を投げる", () => {
      expect(() => insertIntoLanes(stateWithHand([2]), intoLane(0, [5]))).toThrow(RangeError);
      expect(() => insertIntoLanes(stateWithHand([2]), intoLane(0, [-1]))).toThrow(RangeError);
    });

    it("同じレーンを2回指定したら例外を投げる", () => {
      const state = stateWithHand([3, 2]);

      expect(() =>
        insertIntoLanes({ ...state, config: withPreset("multiLane") }, [
          { laneIndex: 0, handIndexes: [0] },
          { laneIndex: 0, handIndexes: [1] },
        ])
      ).toThrow(Error);
    });

    it("同じ手札を別のレーンへ指定したら例外を投げる", () => {
      const state = stateWithHand([3, 2]);

      expect(() =>
        insertIntoLanes({ ...state, config: withPreset("multiLane") }, [
          { laneIndex: 0, handIndexes: [0] },
          { laneIndex: 1, handIndexes: [0] },
        ])
      ).toThrow(Error);
    });

    it("config.maxLanesPerRound を超えるレーン数なら例外を投げる（既定は1レーン）", () => {
      const state = stateWithHand([3, 2, 1]);

      expect(() =>
        insertIntoLanes(state, [
          { laneIndex: 0, handIndexes: [0] },
          { laneIndex: 1, handIndexes: [1] },
        ])
      ).toThrow(/レーン/);
    });

    it("手番プレイヤーの添字が範囲外なら例外を投げる", () => {
      const state = { ...stateWithHand([2]), currentPlayerIndex: 99 };

      expect(() => insertIntoLanes(state, intoLane(0, [0]))).toThrow(RangeError);
    });

    it("イベントカードは投入できない（docs/spec.md ルール解釈メモ）", () => {
      const base = setupGame(["A", "B", "C"], createRng(1), DEFAULT_BALANCE);
      const state = {
        ...base,
        players: base.players.map((p, i) =>
          i === 0 ? { ...p, hand: [{ kind: "event" as const, event: "avalanche" as const }] } : p
        ),
      };

      expect(() => insertIntoLanes(state, intoLane(0, [0]))).toThrow(/イベントカード/);
    });
  });
});
