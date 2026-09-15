import { describe, expect, it } from "vitest";
import { createRng, type Rng } from "./rng.js";
import { DEFAULT_GAME_CONFIG, setupGame, type GameState } from "./setup.js";
import { coin } from "../test-utils/cards.js";
import { applySideHole, canRollJackpot, rollJackpot, settleJackpotAtGameEnd } from "./jackpot.js";

/** 出目を並べて返す決定的な Rng */
function scriptedRng(rolls: readonly number[]): Rng {
  let index = 0;
  return {
    nextInt: () => 0,
    shuffle: (items) => [...items],
    rollD6: () => {
      const roll = rolls[index++];
      if (roll === undefined) throw new Error("出目を使い切った");
      return roll;
    },
  };
}

function buildState(overrides?: Partial<GameState>): GameState {
  const base = setupGame(["A", "B", "C"], createRng(1), DEFAULT_GAME_CONFIG);
  return {
    ...base,
    players: base.players.map((p) => ({ ...p, hand: [] })),
    jackpotPool: [],
    jackpotCounter: 0,
    ...overrides,
  };
}

describe("applySideHole", () => {
  it("落ちたカードを獲得者ではなくジャックポットプールへ入れる（docs/spec.md §5）", () => {
    const state = buildState();

    const next = applySideHole(state, [coin(2), coin(3)]);

    expect(next.jackpotPool).toEqual([coin(2), coin(3)]);
    expect(next.players[0]?.hand).toEqual([]);
  });

  it("既存のプールに積み増す", () => {
    const state = buildState({ jackpotPool: [coin(1)] });

    expect(applySideHole(state, [coin(2)]).jackpotPool).toEqual([coin(1), coin(2)]);
  });

  it("カウンターを1つ進める（docs/spec.md §5）", () => {
    expect(applySideHole(buildState({ jackpotCounter: 2 }), []).jackpotCounter).toBe(3);
  });

  it("カウンターは 5 で頭打ちになる（docs/spec.md §5）", () => {
    expect(applySideHole(buildState({ jackpotCounter: 5 }), []).jackpotCounter).toBe(5);
  });

  it("最後に横穴を出したプレイヤーを記録する", () => {
    const state = { ...buildState(), currentPlayerIndex: 1 };

    expect(applySideHole(state, []).lastSideHolePlayerId).toBe(state.players[1]?.id);
  });

  it("元の状態を変更しない", () => {
    const state = buildState({ jackpotCounter: 1 });

    applySideHole(state, [coin(2)]);

    expect(state.jackpotCounter).toBe(1);
    expect(state.jackpotPool).toEqual([]);
  });

  it("手番プレイヤーの添字が範囲外なら例外を投げる", () => {
    const state = { ...buildState(), currentPlayerIndex: 99 };

    expect(() => applySideHole(state, [])).toThrow(RangeError);
  });
});

describe("canRollJackpot", () => {
  it("カウンターが 5 に達したら判定できる（docs/spec.md §5）", () => {
    expect(canRollJackpot(buildState({ jackpotCounter: 5 }))).toBe(true);
  });

  it("カウンターが 5 未満なら判定できない", () => {
    expect(canRollJackpot(buildState({ jackpotCounter: 4 }))).toBe(false);
  });
});

describe("rollJackpot", () => {
  it("6 が出たらプールのカードを全獲得する（docs/spec.md §5）", () => {
    const state = buildState({ jackpotCounter: 5, jackpotPool: [coin(3), coin(2)] });

    const result = rollJackpot(state, scriptedRng([6]));

    expect(result.won).toBe(true);
    expect(result.wonCards).toEqual([coin(3), coin(2)]);
    expect(result.state.players[0]?.hand).toEqual([coin(3), coin(2)]);
    expect(result.state.jackpotPool).toEqual([]);
  });

  it("当選したらカウンターを 0 に戻す（docs/spec.md ルール解釈メモ）", () => {
    const state = buildState({ jackpotCounter: 5, jackpotPool: [coin(3)] });

    expect(rollJackpot(state, scriptedRng([6])).state.jackpotCounter).toBe(0);
  });

  it("6 以外なら外れる", () => {
    const state = buildState({ jackpotCounter: 5, jackpotPool: [coin(3)] });

    const result = rollJackpot(state, scriptedRng([5]));

    expect(result.won).toBe(false);
    expect(result.wonCards).toEqual([]);
    expect(result.state.players[0]?.hand).toEqual([]);
    expect(result.state.jackpotPool).toEqual([coin(3)]);
  });

  it("外れてもカウンターは 5 のまま据え置く（docs/spec.md §5）", () => {
    const state = buildState({ jackpotCounter: 5, jackpotPool: [coin(3)] });

    expect(rollJackpot(state, scriptedRng([1])).state.jackpotCounter).toBe(5);
  });

  it("出目を返す", () => {
    expect(rollJackpot(buildState(), scriptedRng([4])).roll).toBe(4);
  });

  it("手番プレイヤーが獲得する", () => {
    const state = { ...buildState({ jackpotPool: [coin(3)] }), currentPlayerIndex: 2 };

    const result = rollJackpot(state, scriptedRng([6]));

    expect(result.state.players[2]?.hand).toEqual([coin(3)]);
    expect(result.state.players[0]?.hand).toEqual([]);
  });

  it("プールが空でも当選処理が壊れない", () => {
    const result = rollJackpot(buildState({ jackpotCounter: 5 }), scriptedRng([6]));

    expect(result.won).toBe(true);
    expect(result.wonCards).toEqual([]);
  });

  it("元の状態を変更しない", () => {
    const state = buildState({ jackpotCounter: 5, jackpotPool: [coin(3)] });

    rollJackpot(state, scriptedRng([6]));

    expect(state.jackpotPool).toEqual([coin(3)]);
    expect(state.jackpotCounter).toBe(5);
  });

  it("手番プレイヤーの添字が範囲外なら例外を投げる", () => {
    const state = { ...buildState(), currentPlayerIndex: 99 };

    expect(() => rollJackpot(state, scriptedRng([6]))).toThrow(RangeError);
  });
});

describe("再判定の流れ（docs/spec.md §5）", () => {
  it("外れたあと、次の横穴でまた JP判定できる", () => {
    const rng = scriptedRng([1, 6]);
    let state = buildState({ jackpotCounter: 4, jackpotPool: [coin(3)] });

    // 1回目の横穴でカウンターが 5 に達し、JP判定に外れる
    state = applySideHole(state, [coin(1)]);
    expect(state.jackpotCounter).toBe(5);
    const first = rollJackpot(state, rng);
    expect(first.won).toBe(false);

    // 2回目の横穴。カウンターは 5 で頭打ちのまま、再判定して当たる
    state = applySideHole(first.state, [coin(2)]);
    expect(state.jackpotCounter).toBe(5);
    const second = rollJackpot(state, rng);
    expect(second.won).toBe(true);
    expect(second.wonCards).toEqual([coin(3), coin(1), coin(2)]);
  });
});

describe("settleJackpotAtGameEnd", () => {
  it("カウンターが 5 なら最後に横穴を出したプレイヤーが獲得する（docs/spec.md §5）", () => {
    const base = buildState({ jackpotCounter: 5, jackpotPool: [coin(3), coin(2)] });
    const state = { ...base, lastSideHolePlayerId: base.players[1]?.id ?? null };

    const next = settleJackpotAtGameEnd(state);

    expect(next.players[1]?.hand).toEqual([coin(3), coin(2)]);
    expect(next.jackpotPool).toEqual([]);
  });

  it("カウンターが 5 未満なら誰も獲得せず流れる（docs/spec.md §5）", () => {
    const base = buildState({ jackpotCounter: 4, jackpotPool: [coin(3)] });
    const state = { ...base, lastSideHolePlayerId: base.players[1]?.id ?? null };

    const next = settleJackpotAtGameEnd(state);

    expect(next.players.every((p) => p.hand.length === 0)).toBe(true);
    expect(next.jackpotPool).toEqual([]);
  });

  it("カウンターが 5 でも横穴を出した人がいなければ流れる", () => {
    const state = buildState({ jackpotCounter: 5, jackpotPool: [coin(3)] });

    const next = settleJackpotAtGameEnd(state);

    expect(next.players.every((p) => p.hand.length === 0)).toBe(true);
    expect(next.jackpotPool).toEqual([]);
  });

  it("プールが空なら何も起きない", () => {
    const base = buildState({ jackpotCounter: 5 });
    const state = { ...base, lastSideHolePlayerId: base.players[0]?.id ?? null };

    expect(settleJackpotAtGameEnd(state).players[0]?.hand).toEqual([]);
  });

  it("記録されたプレイヤーが見つからなければ流れる", () => {
    const state = {
      ...buildState({ jackpotCounter: 5, jackpotPool: [coin(3)] }),
      lastSideHolePlayerId: "missing",
    };

    const next = settleJackpotAtGameEnd(state);

    expect(next.players.every((p) => p.hand.length === 0)).toBe(true);
    expect(next.jackpotPool).toEqual([]);
  });

  it("元の状態を変更しない", () => {
    const base = buildState({ jackpotCounter: 5, jackpotPool: [coin(3)] });
    const state = { ...base, lastSideHolePlayerId: base.players[0]?.id ?? null };

    settleJackpotAtGameEnd(state);

    expect(state.jackpotPool).toEqual([coin(3)]);
  });
});
