import { describe, expect, it } from "vitest";
import { coin, faceDown } from "../test-utils/cards.js";
import { scriptedRng } from "../test-utils/rng.js";
import { withPendingPoints } from "../test-utils/state.js";
import { DEFAULT_BALANCE, withPreset } from "./balance.js";
import { autoEventChooser } from "./chooser.js";
import { createRng } from "./rng.js";
import { setupGame, type GameState, type Lane } from "./setup.js";
import { resolveTick } from "./tick.js";

const chooser = autoEventChooser;

/**
 * 3人、各自が指定のコイン札を1枚だけ持ち、レーンは指定した中身だけを持つ状態。
 *
 * ティックは「全員が同時に宣言し、先行権順に1人ずつ解決する」（docs/turn-structure.md §4-6）。
 * ここで見たいのは**解決が1人ずつ順に起きること**なので、盤面は最小にする。
 */
function buildState(hands: readonly (1 | 2 | 3)[], lanes: readonly Partial<Lane>[]): GameState {
  const base = setupGame(["A", "B", "C"], createRng(1), DEFAULT_BALANCE);
  return {
    ...base,
    players: base.players.map((p, i) => ({
      ...p,
      hand: [coin(hands[i] ?? 1)],
      points: 0,
      pendingPoints: 0,
    })),
    lanes: base.lanes.map((lane, i) => ({
      ...lane,
      stock: [],
      pending: [],
      hasExtraSlot: false,
      ...lanes[i],
    })),
    drawPile: [],
  };
}

/** 落ちれば必ず得点になるレーン */
function richLane(): Partial<Lane> {
  return { stock: [coin(3), coin(3), coin(3)], pending: faceDown([coin(1), coin(1)]) };
}

describe("resolveTick（ティック同時進行・docs/turn-structure.md §4-1）", () => {
  it("宣言した順（先行権順）に1人ずつ解決する", () => {
    const state = buildState([1, 1, 1], [richLane()]);

    const result = resolveTick(
      state,
      [
        { playerIndex: 2, insertions: [{ laneIndex: 0, handIndexes: [0] }] },
        { playerIndex: 0, insertions: [{ laneIndex: 0, handIndexes: [0] }] },
      ],
      chooser,
      scriptedRng([1, 1])
    );

    expect(result.players.map((p) => p.playerIndex)).toEqual([2, 0]);
  });

  it("得点は解決したプレイヤー本人の未確定得点に入る", () => {
    const state = buildState([1, 1, 1], [richLane()]);

    const result = resolveTick(
      state,
      [{ playerIndex: 1, insertions: [{ laneIndex: 0, handIndexes: [0] }] }],
      chooser,
      scriptedRng([1])
    );

    expect(result.state.players[1]?.pendingPoints).toBe(3);
    expect(result.state.players[0]?.pendingPoints).toBe(0);
    expect(result.state.players[2]?.pendingPoints).toBe(0);
  });

  it("同じティックで2人が同じレーンへ入れたら、2人目は1人目の結果を見てから判定する", () => {
    // 滞留2枚に1コイン札 → 目標値3。1人目が成功すると滞留は 2枚のまま（押し込み1・投入1）
    const state = buildState([1, 1, 1], [richLane()]);

    const result = resolveTick(
      state,
      [
        { playerIndex: 0, insertions: [{ laneIndex: 0, handIndexes: [0] }] },
        { playerIndex: 1, insertions: [{ laneIndex: 0, handIndexes: [0] }] },
      ],
      chooser,
      scriptedRng([1, 1])
    );

    // 2人目の目標値は、1人目の解決が終わったあとの滞留枚数から算出される
    expect(result.players[1]?.round.lanes[0]?.target).toBe(3);
  });

  it("1人が横穴を踏んでも、他のプレイヤーの未確定得点は巻き込まれない", () => {
    const base = buildState([1, 1, 1], [richLane()]);
    // A はすでに 8点を抱えている
    const state = withPendingPoints({ ...base, currentPlayerIndex: 0 }, 8);

    // B（index 1）が出目6で横穴を踏む
    const result = resolveTick(
      state,
      [{ playerIndex: 1, insertions: [{ laneIndex: 0, handIndexes: [0] }] }],
      chooser,
      scriptedRng([6])
    );

    expect(result.players[0]?.round.busted).toBe(true);
    expect(result.state.players[1]?.pendingPoints).toBe(0);
    expect(result.state.players[0]?.pendingPoints).toBe(8);
  });

  it("解決が終わったら currentPlayerIndex を元に戻す", () => {
    const state = buildState([1, 1, 1], [richLane()]);

    const result = resolveTick(
      state,
      [{ playerIndex: 2, insertions: [{ laneIndex: 0, handIndexes: [0] }] }],
      chooser,
      scriptedRng([1])
    );

    expect(result.state.currentPlayerIndex).toBe(state.currentPlayerIndex);
  });

  it("存在しないプレイヤーの宣言は受け付けない", () => {
    const state = buildState([1, 1, 1], [richLane()]);

    expect(() =>
      resolveTick(
        state,
        [{ playerIndex: 9, insertions: [{ laneIndex: 0, handIndexes: [0] }] }],
        chooser,
        scriptedRng([1])
      )
    ).toThrow(RangeError);
  });

  it("1手番あたりの投入ラウンド上限は未対応なので、設定されていたら弾く", () => {
    const base = buildState([1, 1, 1], [richLane()]);
    const state = { ...base, config: withPreset("insertionRounds3") };

    expect(() => resolveTick(state, [], chooser, scriptedRng([]))).toThrow(
      /maxInsertionRoundsPerTurn/
    );
  });

  it("誰も宣言しなければ盤面は変わらない", () => {
    const state = buildState([1, 1, 1], [richLane()]);

    const result = resolveTick(state, [], chooser, scriptedRng([]));

    expect(result.players).toEqual([]);
    expect(result.state.lanes).toEqual(state.lanes);
  });
});
