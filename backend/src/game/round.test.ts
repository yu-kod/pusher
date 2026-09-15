import { describe, expect, it } from "vitest";
import { coin, faceDown } from "../test-utils/cards.js";
import { scriptedRng } from "../test-utils/rng.js";
import { DEFAULT_BALANCE } from "./balance.js";
import { createRng } from "./rng.js";
import { setupGame, type GameState, type Lane } from "./setup.js";
import { resolveInsertionRound } from "./round.js";

/**
 * 手番プレイヤーの手札と各レーンを指定した初期状態を作る。
 *
 * 出目の判定を狙って書けるよう、滞留とレーンの中身は明示的に与える。
 */
function buildState(
  hand: readonly (1 | 2 | 3)[],
  lanes: readonly Partial<Lane>[],
  overrides?: Partial<GameState>
): GameState {
  const base = setupGame(["A", "B", "C"], createRng(1), DEFAULT_BALANCE);
  return {
    ...base,
    players: base.players.map((p, i) => ({
      ...p,
      hand: i === 0 ? hand.map((c) => coin(c)) : [],
      points: 0,
    })),
    lanes: base.lanes.map((lane, i) => ({
      ...lane,
      stock: [],
      pending: [],
      hasExtraSlot: false,
      ...lanes[i],
    })),
    drawPile: [],
    pendingPoints: 0,
    jackpotPoints: 0,
    jackpotCounter: 0,
    ...overrides,
  };
}

describe("resolveInsertionRound（投入ラウンド）", () => {
  it("投入したレーンの数だけダイスを振る（docs/spec.md §3）", () => {
    const state = buildState([1, 1, 1], [{}, {}, {}]);

    const result = resolveInsertionRound(
      state,
      [
        { laneIndex: 0, handIndexes: [0] },
        { laneIndex: 2, handIndexes: [1] },
      ],
      // 3個目を振ったら「出目を使い切った」で落ちる
      scriptedRng([1, 4])
    );

    expect(result.lanes.map((l) => l.roll)).toEqual([1, 4]);
  });

  it("レーンごとに独立して判定する（docs/spec.md §3）", () => {
    // 目標値はどちらも 1（コイン1枚・滞留なし）。出目1で成功、出目2で失敗
    const state = buildState([1, 1], [{ stock: [coin(3)] }, { stock: [coin(3)] }, {}]);

    const result = resolveInsertionRound(
      state,
      [
        { laneIndex: 0, handIndexes: [0] },
        { laneIndex: 1, handIndexes: [1] },
      ],
      scriptedRng([1, 2])
    );

    expect(result.lanes.map((l) => l.outcome)).toEqual(["success", "failure"]);
  });

  it("成功したレーンは押し出しを解決し、落ちたカードを返す（docs/spec.md §4）", () => {
    const state = buildState([2], [{ stock: [coin(3), coin(1)], pending: faceDown([coin(1)]) }]);

    // 目標値 = 2(コイン) + 1(滞留) = 3。出目3で成功
    const result = resolveInsertionRound(
      state,
      [{ laneIndex: 0, handIndexes: [0] }],
      scriptedRng([3])
    );

    expect(result.lanes[0]?.fallenCards).toEqual([coin(3), coin(1)]);
  });

  it("失敗したレーンからは何も落ちず、投入カードが滞留に残る（docs/spec.md §3）", () => {
    const state = buildState([1], [{ stock: [coin(3)] }]);

    // 目標値 1。出目6 は目標値6未満なので横穴にならず、ただの失敗
    const result = resolveInsertionRound(
      state,
      [{ laneIndex: 0, handIndexes: [0] }],
      scriptedRng([6])
    );

    expect(result.lanes[0]?.outcome).toBe("failure");
    expect(result.lanes[0]?.fallenCards).toEqual([]);
    expect(result.state.lanes[0]?.pending).toEqual(faceDown([coin(1)]));
    expect(result.state.lanes[0]?.stock).toEqual([coin(3)]);
  });

  it("落ちたカードの点数が未確定得点に積み上がる（docs/spec.md §3）", () => {
    const state = buildState([2], [{ stock: [coin(3), coin(2)], pending: faceDown([coin(1)]) }]);

    const result = resolveInsertionRound(
      state,
      [{ laneIndex: 0, handIndexes: [0] }],
      scriptedRng([3])
    );

    expect(result.state.pendingPoints).toBe(5);
    expect(result.gainedPoints).toBe(5);
  });

  it("未確定得点は前のラウンドぶんに積み増す", () => {
    const state = buildState([2], [{ stock: [coin(3), coin(2)], pending: faceDown([coin(1)]) }], {
      pendingPoints: 7,
    });

    const result = resolveInsertionRound(
      state,
      [{ laneIndex: 0, handIndexes: [0] }],
      scriptedRng([3])
    );

    expect(result.state.pendingPoints).toBe(12);
    // gainedPoints はこのラウンドで得た点数だけを返す
    expect(result.gainedPoints).toBe(5);
  });

  it("未確定得点はまだ手番プレイヤーの得点にならない（docs/spec.md §3）", () => {
    const state = buildState([2], [{ stock: [coin(3)], pending: faceDown([coin(1)]) }]);

    const result = resolveInsertionRound(
      state,
      [{ laneIndex: 0, handIndexes: [0] }],
      scriptedRng([3])
    );

    expect(result.state.players[0]?.points).toBe(0);
  });

  it("複数レーンで成功したら左から順に解決する（docs/spec.md §3）", () => {
    const state = buildState([1, 1], [{ stock: [coin(1)] }, { stock: [coin(2)] }, {}]);

    const result = resolveInsertionRound(
      state,
      [
        { laneIndex: 1, handIndexes: [1] },
        { laneIndex: 0, handIndexes: [0] },
      ],
      scriptedRng([1, 1])
    );

    expect(result.lanes.map((l) => l.laneIndex)).toEqual([0, 1]);
    expect(result.lanes.map((l) => l.fallenCards)).toEqual([[coin(1)], [coin(2)]]);
  });

  it("レーンごとの投入コイン数と目標値も返す", () => {
    const state = buildState([3], [{ pending: faceDown([coin(1), coin(1)]) }]);

    const result = resolveInsertionRound(
      state,
      [{ laneIndex: 0, handIndexes: [0] }],
      scriptedRng([5])
    );

    expect(result.lanes[0]).toMatchObject({ laneIndex: 0, insertedCoins: 3, target: 5 });
  });

  it("元の状態を変更しない", () => {
    const state = buildState([2], [{ stock: [coin(3)], pending: faceDown([coin(1)]) }]);

    resolveInsertionRound(state, [{ laneIndex: 0, handIndexes: [0] }], scriptedRng([3]));

    expect(state.players[0]?.hand).toHaveLength(1);
    expect(state.pendingPoints).toBe(0);
    expect(state.lanes[0]?.pending).toHaveLength(1);
  });
});
