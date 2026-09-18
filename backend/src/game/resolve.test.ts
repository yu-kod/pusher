import { describe, expect, it, vi } from "vitest";
import { coin, faceDown } from "../test-utils/cards.js";
import { scriptedRng } from "../test-utils/rng.js";
import { DEFAULT_BALANCE } from "./balance.js";
import type { Card, EventKind } from "./deck.js";
import { createRng } from "./rng.js";
import { setupGame, type GameState, type Lane } from "./setup.js";
import { collectAndResolveFall, type EventChooser } from "./resolve.js";
import { splitOverrides, withPendingPoints, type StateOverrides } from "../test-utils/state.js";
import { pendingPointsOf } from "./push.js";

const event = (kind: EventKind): Card => ({ kind: "event", event: kind });

/** レーンの指定と滞留の選択を固定で返す chooser */
function fixedChooser(laneIndex = 0, pendingIndex = 0): EventChooser {
  return {
    chooseLane: () => laneIndex,
    choosePending: () => pendingIndex,
  };
}

function buildState(lanes: readonly Partial<Lane>[], overrides?: StateOverrides): GameState {
  const { pendingPoints, rest } = splitOverrides(overrides);
  const base = setupGame(["A", "B", "C"], createRng(1), DEFAULT_BALANCE);
  return withPendingPoints(
    {
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
      discardPile: [],
      jackpotPoints: 0,
      jackpotCounter: 0,
      ...rest,
    },
    pendingPoints
  );
}

describe("collectAndResolveFall（落下カードの解決・docs/spec.md §6）", () => {
  it("イベントがなければ点数にして山札へ戻すだけ（§4-2）", () => {
    const state = buildState([{}, {}, {}]);

    const result = collectAndResolveFall(
      state,
      0,
      [coin(2), coin(3)],
      fixedChooser(),
      scriptedRng([])
    );

    expect(pendingPointsOf(result.state)).toBe(5);
    expect(result.state.drawPile).toEqual([coin(2), coin(3)]);
    expect(result.events).toEqual([]);
  });

  it("イベントカードは捨て札にする（山札へは戻らない）", () => {
    const state = buildState([{ stock: [coin(1)] }, {}, {}]);

    const result = collectAndResolveFall(
      state,
      0,
      [event("extraSlot")],
      fixedChooser(1),
      scriptedRng([])
    );

    expect(result.state.discardPile).toEqual([event("extraSlot")]);
  });

  it("効果を即座に解決する（§6）", () => {
    const state = buildState([{ stock: [coin(1)] }, {}, {}]);

    const result = collectAndResolveFall(
      state,
      0,
      [event("extraSlot")],
      fixedChooser(1),
      scriptedRng([])
    );

    expect(result.state.lanes[1]?.hasExtraSlot).toBe(true);
  });

  it("解決したイベントを順に返す", () => {
    const state = buildState([{ stock: [coin(1)] }, {}, {}]);

    const result = collectAndResolveFall(
      state,
      0,
      [event("extraSlot")],
      fixedChooser(1),
      scriptedRng([])
    );

    expect(result.events).toEqual([{ event: "extraSlot", extraTurn: true }]);
  });

  it("「投入口増設」以外は追加手番にならない（ルール解釈メモ）", () => {
    const state = buildState([{ stock: [coin(1)] }, {}, {}]);

    const result = collectAndResolveFall(
      state,
      0,
      [event("openLane")],
      fixedChooser(1),
      scriptedRng([])
    );

    expect(result.events).toEqual([{ event: "openLane", extraTurn: false }]);
  });

  it("解決後、そのレーンからもう1枚落として点数にする（§6）", () => {
    const state = buildState([{ stock: [coin(3), coin(1)] }, {}, {}]);

    const result = collectAndResolveFall(
      state,
      0,
      [event("extraSlot")],
      fixedChooser(1),
      scriptedRng([])
    );

    expect(pendingPointsOf(result.state)).toBe(3);
    expect(result.state.lanes[0]?.stock).toEqual([coin(1)]);
  });

  it("通常の落下分とイベントの追加落下分が両方とも点数になる", () => {
    const state = buildState([{ stock: [coin(3)] }, {}, {}]);

    const result = collectAndResolveFall(
      state,
      0,
      [coin(2), event("extraSlot")],
      fixedChooser(1),
      scriptedRng([])
    );

    expect(pendingPointsOf(result.state)).toBe(5);
  });

  it("もう1枚もイベントなら連鎖する（ルール解釈メモ）", () => {
    const state = buildState([{ stock: [event("extraSlot"), coin(2)] }, {}, {}]);

    const result = collectAndResolveFall(
      state,
      0,
      [event("extraSlot")],
      fixedChooser(1),
      scriptedRng([])
    );

    // 1枚目 → もう1枚（イベント）→ さらにもう1枚（コイン2）
    expect(result.events.map((e) => e.event)).toEqual(["extraSlot", "extraSlot"]);
    expect(pendingPointsOf(result.state)).toBe(2);
    expect(result.state.lanes[0]?.stock).toEqual([]);
  });

  it("レーンが空なら連鎖が止まる（ルール解釈メモ）", () => {
    const state = buildState([{ stock: [] }, {}, {}]);

    const result = collectAndResolveFall(
      state,
      0,
      [event("extraSlot")],
      fixedChooser(1),
      scriptedRng([])
    );

    expect(pendingPointsOf(result.state)).toBe(0);
    expect(result.events).toHaveLength(1);
  });

  it("元の状態を変更しない", () => {
    const state = buildState([{ stock: [coin(3)] }, {}, {}]);

    collectAndResolveFall(state, 0, [event("extraSlot")], fixedChooser(1), scriptedRng([]));

    expect(pendingPointsOf(state)).toBe(0);
    expect(state.lanes[0]?.stock).toEqual([coin(3)]);
    expect(state.lanes[1]?.hasExtraSlot).toBe(false);
  });

  describe("なだれ", () => {
    it("全レーンから落ちたカードが点数になる（§6）", () => {
      const state = buildState([
        { stock: [coin(1)], pending: faceDown([coin(1)]) },
        { stock: [coin(2)], pending: faceDown([coin(1)]) },
        { stock: [coin(3)], pending: faceDown([coin(1)]) },
      ]);

      const result = collectAndResolveFall(
        state,
        0,
        [event("avalanche")],
        fixedChooser(),
        scriptedRng([])
      );

      // なだれで 1+2+3、そのあと §6 の「もう1枚落とす」でレーン0 の滞留から押し込まれた 1
      expect(pendingPointsOf(result.state)).toBe(7);
    });

    it("なだれで落ちたカードがイベントなら §6 を適用する（ルール解釈メモ）", () => {
      const state = buildState([
        { stock: [] },
        { stock: [event("extraSlot"), coin(2)], pending: faceDown([coin(1)]) },
        { stock: [] },
      ]);

      const result = collectAndResolveFall(
        state,
        0,
        [event("avalanche")],
        fixedChooser(2),
        scriptedRng([])
      );

      expect(result.events.map((e) => e.event)).toEqual(["avalanche", "extraSlot"]);
      // レーン1 から落ちた extraSlot の「もう1枚」で coin(2)
      expect(pendingPointsOf(result.state)).toBe(2);
    });
  });

  describe("横穴開放", () => {
    it("選んだ1枚が点数になる（§6）", () => {
      const state = buildState([
        { stock: [] },
        { pending: faceDown([coin(1), coin(3), coin(2)]) },
        {},
      ]);

      const chooser: EventChooser = { chooseLane: () => 1, choosePending: () => 1 };
      const result = collectAndResolveFall(state, 0, [event("openLane")], chooser, scriptedRng([]));

      expect(pendingPointsOf(result.state)).toBe(3);
      expect(result.state.lanes[1]?.pending).toHaveLength(2);
    });

    it("滞留が空のレーンを選んでも壊れず、選択も求めない", () => {
      const state = buildState([{ stock: [] }, { pending: [] }, {}]);
      const choosePending = vi.fn(() => 0);
      const chooser: EventChooser = { chooseLane: () => 1, choosePending };

      const result = collectAndResolveFall(state, 0, [event("openLane")], chooser, scriptedRng([]));

      expect(pendingPointsOf(result.state)).toBe(0);
      expect(choosePending).not.toHaveBeenCalled();
    });
  });

  describe("抽選抽選", () => {
    it("カウンターを2つ進めて即座に JP判定を行う（§6）", () => {
      const state = buildState([{ stock: [] }, {}, {}], {
        jackpotCounter: 1,
        jackpotPoints: 8,
      });

      const result = collectAndResolveFall(
        state,
        0,
        [event("lottery")],
        fixedChooser(),
        scriptedRng([6])
      );

      expect(result.state.jackpotCounter).toBe(0);
      expect(result.state.players[0]?.points).toBe(8);
    });

    it("外れてもカウンターは戻らない", () => {
      const state = buildState([{ stock: [] }, {}, {}], { jackpotCounter: 1, jackpotPoints: 8 });

      const result = collectAndResolveFall(
        state,
        0,
        [event("lottery")],
        fixedChooser(),
        scriptedRng([2])
      );

      expect(result.state.jackpotCounter).toBe(3);
      expect(result.state.jackpotPoints).toBe(8);
    });
  });
});
