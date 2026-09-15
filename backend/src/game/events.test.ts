import { describe, expect, it } from "vitest";
import { coin, faceDown, faceUp } from "../test-utils/cards.js";
import { createRng, type Rng } from "./rng.js";
import { DEFAULT_BALANCE } from "./balance.js";
import { setupGame, type GameState, type Lane } from "./setup.js";
import { resolveAvalanche, resolveExtraSlot, resolveLottery, resolveOpenLane } from "./events.js";

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

function buildState(lanes: Partial<Lane>[], overrides?: Partial<GameState>): GameState {
  const base = setupGame(["A", "B", "C"], createRng(1), DEFAULT_BALANCE);
  return {
    ...base,
    players: base.players.map((p) => ({ ...p, hand: [], points: 0 })),
    lanes: base.lanes.map((lane, i) => ({
      ...lane,
      stock: [],
      pending: [],
      hasExtraSlot: false,
      ...lanes[i],
    })),
    drawPile: [],
    jackpotPoints: 0,
    pendingPoints: 0,
    jackpotCounter: 0,
    ...overrides,
  };
}

describe("resolveAvalanche（なだれ）", () => {
  it("全レーンの滞留を1枚ずつ押し込み、同数を落とす（docs/spec.md §6）", () => {
    const state = buildState([
      { stock: [coin(1)], pending: faceDown([coin(2)]) },
      { stock: [coin(3)], pending: faceDown([coin(2)]) },
      { stock: [coin(1)], pending: faceDown([coin(2)]) },
    ]);

    const result = resolveAvalanche(state);

    expect(result.fallenCards).toEqual([coin(1), coin(3), coin(1)]);
  });

  it("滞留が空のレーンからは何も落ちない", () => {
    const state = buildState([
      { stock: [coin(1)], pending: faceDown([coin(2)]) },
      { stock: [coin(3)], pending: [] },
      { stock: [coin(1)], pending: [] },
    ]);

    expect(resolveAvalanche(state).fallenCards).toEqual([coin(1)]);
  });

  it("押し込むのは各レーン1枚だけ（滞留が厚くても）", () => {
    const state = buildState([
      { stock: [coin(1), coin(1)], pending: faceDown([coin(2), coin(3), coin(3)]) },
      {},
      {},
      {},
    ]);

    const result = resolveAvalanche(state);

    expect(result.fallenCards).toHaveLength(1);
    expect(result.state.lanes[0]?.pending).toHaveLength(2);
  });

  it("通常の押し出しと同じく補充は行わない（docs/spec.md §4-3）", () => {
    const state = buildState([{ stock: [coin(1)], pending: faceDown([coin(2)]) }, {}, {}], {
      drawPile: [coin(3), coin(3)],
    });

    const result = resolveAvalanche(state);

    // 山札は減らない。落下カードの行き先は呼び出し側が決める（§4-2）
    expect(result.state.drawPile).toEqual([coin(3), coin(3)]);
    expect(result.state.lanes[0]?.stock).toEqual([coin(2)]);
  });

  it("滞留が全レーン空なら何も起きない", () => {
    const state = buildState([{}, {}, {}]);

    const result = resolveAvalanche(state);

    expect(result.fallenCards).toEqual([]);
    expect(result.state.lanes).toEqual(state.lanes);
  });

  it("元の状態を変更しない", () => {
    const state = buildState([{ stock: [coin(1)], pending: faceDown([coin(2)]) }, {}, {}]);

    resolveAvalanche(state);

    expect(state.lanes[0]?.pending).toHaveLength(1);
    expect(state.lanes[0]?.stock).toEqual([coin(1)]);
  });
});

describe("resolveOpenLane（横穴開放）", () => {
  it("指定レーンの滞留をすべて表向きにする（docs/spec.md §6）", () => {
    const state = buildState([{ pending: faceDown([coin(1), coin(2), coin(3)]) }, {}, {}]);

    const result = resolveOpenLane(state, 0, 1);

    expect(result.state.lanes[0]?.pending.every((p) => p.faceUp)).toBe(true);
  });

  it("選んだ1枚を点数にし、カードは山札へ戻す（docs/spec.md §6）", () => {
    const state = buildState([{ pending: faceDown([coin(1), coin(2), coin(3)]) }, {}, {}]);

    const result = resolveOpenLane(state, 0, 1);

    expect(result.takenCard).toEqual(coin(2));
    expect(result.state.pendingPoints).toBe(2);
    expect(result.state.drawPile).toEqual([coin(2)]);
  });

  it("残りは表向きのまま滞留する", () => {
    const state = buildState([{ pending: faceDown([coin(1), coin(2), coin(3)]) }, {}, {}]);

    const result = resolveOpenLane(state, 0, 1);

    expect(result.state.lanes[0]?.pending).toEqual(faceUp([coin(1), coin(3)]));
  });

  it("滞留枚数が減る", () => {
    const state = buildState([{ pending: faceDown([coin(1), coin(2)]) }, {}, {}]);

    expect(resolveOpenLane(state, 0, 0).state.lanes[0]?.pending).toHaveLength(1);
  });

  it("滞留が空なら何も獲得しないが例外にもならない", () => {
    const state = buildState([{ pending: [] }, {}, {}]);

    const result = resolveOpenLane(state, 0, 0);

    expect(result.takenCard).toBeNull();
    expect(result.state.pendingPoints).toBe(0);
  });

  it("他のレーンは表向きにならない", () => {
    const state = buildState([
      { pending: faceDown([coin(1)]) },
      { pending: faceDown([coin(2)]) },
      {},
      {},
    ]);

    const result = resolveOpenLane(state, 0, 0);

    expect(result.state.lanes[1]?.pending.every((p) => p.faceUp)).toBe(false);
  });

  it("元の状態を変更しない", () => {
    const state = buildState([{ pending: faceDown([coin(1), coin(2)]) }, {}, {}]);

    resolveOpenLane(state, 0, 0);

    expect(state.lanes[0]?.pending).toEqual(faceDown([coin(1), coin(2)]));
  });

  it("存在しないレーンなら例外を投げる", () => {
    expect(() => resolveOpenLane(buildState([{}, {}, {}]), 9, 0)).toThrow(RangeError);
  });

  it("滞留の範囲外を選んだら例外を投げる", () => {
    const state = buildState([{ pending: faceDown([coin(1)]) }, {}, {}]);

    expect(() => resolveOpenLane(state, 0, 5)).toThrow(RangeError);
    expect(() => resolveOpenLane(state, 0, -1)).toThrow(RangeError);
  });
});

describe("resolveExtraSlot（投入口増設）", () => {
  it("指定レーンに増設マーカーを置く（docs/spec.md §6）", () => {
    const state = buildState([{}, {}, {}]);

    expect(resolveExtraSlot(state, 1).lanes[1]?.hasExtraSlot).toBe(true);
  });

  it("他のレーンにはマーカーを置かない", () => {
    const next = resolveExtraSlot(buildState([{}, {}, {}]), 1);

    expect(next.lanes[0]?.hasExtraSlot).toBe(false);
  });

  it("すでにマーカーがあるレーンでも壊れない", () => {
    const state = buildState([{ hasExtraSlot: true }, {}, {}]);

    expect(resolveExtraSlot(state, 0).lanes[0]?.hasExtraSlot).toBe(true);
  });

  it("元の状態を変更しない", () => {
    const state = buildState([{}, {}, {}]);

    resolveExtraSlot(state, 0);

    expect(state.lanes[0]?.hasExtraSlot).toBe(false);
  });

  it("存在しないレーンなら例外を投げる", () => {
    expect(() => resolveExtraSlot(buildState([{}, {}, {}]), 9)).toThrow(RangeError);
  });
});

describe("resolveLottery（抽選抽選）", () => {
  it("ジャックポットカウンターを2つ進める（docs/spec.md §6）", () => {
    const state = buildState([{}, {}, {}], { jackpotCounter: 1 });

    expect(resolveLottery(state, scriptedRng([1])).state.jackpotCounter).toBe(3);
  });

  it("カウンターは閾値で頭打ちになる", () => {
    const state = buildState([{}, {}, {}], { jackpotCounter: 4 });

    const result = resolveLottery(state, scriptedRng([1]));

    expect(result.state.jackpotCounter).toBe(5);
  });

  it("即座に JP判定を1回行う（docs/spec.md §6）", () => {
    const state = buildState([{}, {}, {}], { jackpotCounter: 3, jackpotPoints: 5 });

    const result = resolveLottery(state, scriptedRng([6]));

    expect(result.jackpotRoll).toBe(6);
    expect(result.jackpotWon).toBe(true);
    expect(result.wonPoints).toBe(5);
    expect(result.state.players[0]?.points).toBe(5);
  });

  it("外れてもカウンターは戻らない（docs/spec.md §6）", () => {
    const state = buildState([{}, {}, {}], { jackpotCounter: 1 });

    const result = resolveLottery(state, scriptedRng([2]));

    expect(result.jackpotWon).toBe(false);
    expect(result.wonPoints).toBe(0);
    expect(result.state.jackpotCounter).toBe(3);
  });

  it("カウンターが閾値未満でも JP判定を行う（docs/spec.md §6）", () => {
    const state = buildState([{}, {}, {}], { jackpotCounter: 0, jackpotPoints: 1 });

    const result = resolveLottery(state, scriptedRng([6]));

    expect(result.state.jackpotCounter).toBe(0);
    expect(result.jackpotWon).toBe(true);
    expect(result.state.players[0]?.points).toBe(1);
  });

  it("元の状態を変更しない", () => {
    const state = buildState([{}, {}, {}], { jackpotCounter: 1 });

    resolveLottery(state, scriptedRng([1]));

    expect(state.jackpotCounter).toBe(1);
  });
});
