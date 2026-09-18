import { describe, expect, it } from "vitest";
import { coin, faceDown } from "../test-utils/cards.js";
import type { Card } from "./deck.js";
import { scriptedRng } from "../test-utils/rng.js";
import { DEFAULT_BALANCE, withPreset } from "./balance.js";
import { createRng } from "./rng.js";
import { setupGame, type GameState, type Lane } from "./setup.js";
import type { EventChooser } from "./resolve.js";
import { resolveInsertionRound } from "./round.js";
import { splitOverrides, withPendingPoints, type StateOverrides } from "../test-utils/state.js";
import { pendingPointsOf } from "./push.js";

/** レーン0・滞留の先頭を選ぶ chooser。イベントが落ちないテストでは使われない */
const chooser: EventChooser = { chooseLane: () => 0, choosePending: () => 0 };

/**
 * 手番プレイヤーの手札と各レーンを指定した初期状態を作る。
 *
 * 出目の判定を狙って書けるよう、滞留とレーンの中身は明示的に与える。
 */
function buildState(
  hand: readonly (1 | 2 | 3)[],
  lanes: readonly Partial<Lane>[],
  overrides?: StateOverrides
): GameState {
  const { pendingPoints, rest } = splitOverrides(overrides);
  const base = setupGame(["A", "B", "C"], createRng(1), DEFAULT_BALANCE);
  return withPendingPoints(
    {
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
      jackpotPoints: 0,
      jackpotCounter: 0,
      ...rest,
    },
    pendingPoints
  );
}

describe("resolveInsertionRound（投入ラウンド）", () => {
  it("投入したレーンの数だけダイスを振る（docs/spec.md §3）", () => {
    const state = buildState([1, 1, 1], [{}, {}, {}], { config: withPreset("multiLane") });

    const result = resolveInsertionRound(
      state,
      [
        { laneIndex: 0, handIndexes: [0] },
        { laneIndex: 2, handIndexes: [1] },
      ],
      // 3個目を振ったら「出目を使い切った」で落ちる
      chooser,
      scriptedRng([1, 4])
    );

    expect(result.lanes.map((l) => l.roll)).toEqual([1, 4]);
  });

  it("レーンごとに独立して判定する（docs/spec.md §3）", () => {
    // 目標値はどちらも 1（コイン1枚・滞留なし）。出目1で成功、出目2で失敗
    const state = buildState([1, 1], [{ stock: [coin(3)] }, { stock: [coin(3)] }, {}], {
      config: withPreset("multiLane"),
    });

    const result = resolveInsertionRound(
      state,
      [
        { laneIndex: 0, handIndexes: [0] },
        { laneIndex: 1, handIndexes: [1] },
      ],
      chooser,
      scriptedRng([1, 2])
    );

    expect(result.lanes.map((l) => l.outcome)).toEqual(["success", "failure"]);
  });

  it("成功したレーンは押し出しを解決し、落ちたカードを返す（docs/spec.md §4）", () => {
    const state = buildState([2], [{ stock: [coin(3), coin(1)], pending: faceDown([coin(1)]) }]);

    // 目標値 = 2(コイン) + 1(滞留) = 3。出目3で成功。押し込みは ceil(2/2) = 1枚
    const result = resolveInsertionRound(
      state,
      [{ laneIndex: 0, handIndexes: [0] }],
      chooser,
      scriptedRng([3])
    );

    expect(result.lanes[0]?.fallenCards).toEqual([coin(3)]);
  });

  it("失敗したレーンからは何も落ちず、投入カードが滞留に残る（docs/spec.md §3）", () => {
    const state = buildState([1], [{ stock: [coin(3)] }]);

    // 目標値 1。出目5 は目標値を超えているので失敗（出目6は横穴になるので使わない）
    const result = resolveInsertionRound(
      state,
      [{ laneIndex: 0, handIndexes: [0] }],
      chooser,
      scriptedRng([5])
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
      chooser,
      scriptedRng([3])
    );

    expect(pendingPointsOf(result.state)).toBe(3);
    expect(result.gainedPoints).toBe(3);
  });

  it("未確定得点は前のラウンドぶんに積み増す", () => {
    const state = buildState([2], [{ stock: [coin(3), coin(2)], pending: faceDown([coin(1)]) }], {
      pendingPoints: 7,
    });

    const result = resolveInsertionRound(
      state,
      [{ laneIndex: 0, handIndexes: [0] }],
      chooser,
      scriptedRng([3])
    );

    expect(pendingPointsOf(result.state)).toBe(10);
    // gainedPoints はこのラウンドで得た点数だけを返す
    expect(result.gainedPoints).toBe(3);
  });

  it("未確定得点はまだ手番プレイヤーの得点にならない（docs/spec.md §3）", () => {
    const state = buildState([2], [{ stock: [coin(3)], pending: faceDown([coin(1)]) }]);

    const result = resolveInsertionRound(
      state,
      [{ laneIndex: 0, handIndexes: [0] }],
      chooser,
      scriptedRng([3])
    );

    expect(result.state.players[0]?.points).toBe(0);
  });

  it("複数レーンで成功したら左から順に解決する（docs/spec.md §3）", () => {
    const state = buildState([1, 1], [{ stock: [coin(1)] }, { stock: [coin(2)] }, {}], {
      config: withPreset("multiLane"),
    });

    const result = resolveInsertionRound(
      state,
      [
        { laneIndex: 1, handIndexes: [1] },
        { laneIndex: 0, handIndexes: [0] },
      ],
      chooser,
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
      chooser,
      scriptedRng([5])
    );

    expect(result.lanes[0]).toMatchObject({ laneIndex: 0, insertedCoins: 3, target: 5 });
  });

  describe("横穴（バースト）", () => {
    /**
     * 目標値6以上のレーンを作る。出目6 で横穴になる。
     *
     * 滞留5枚 + 1コイン札で目標値6。レーンの中身は落下用に多めに積む。
     */
    const bustableLane = (): Partial<Lane> => ({
      stock: [coin(1), coin(1)],
      pending: faceDown([coin(1), coin(1), coin(1), coin(1), coin(1)]),
    });

    it("横穴が出たことを返す（docs/spec.md §5）", () => {
      const state = buildState([1], [bustableLane()]);

      const result = resolveInsertionRound(
        state,
        [{ laneIndex: 0, handIndexes: [0] }],
        chooser,
        scriptedRng([6])
      );

      expect(result.lanes[0]?.outcome).toBe("sideHole");
      expect(result.busted).toBe(true);
    });

    it("押し出し自体は通常どおり発生する（docs/spec.md §5）", () => {
      const state = buildState([1], [bustableLane()]);

      const result = resolveInsertionRound(
        state,
        [{ laneIndex: 0, handIndexes: [0] }],
        chooser,
        scriptedRng([6])
      );

      expect(result.lanes[0]?.fallenCards).toEqual([coin(1)]);
    });

    it("未確定得点がすべてジャックポットへ移る（docs/spec.md §3 §5）", () => {
      const state = buildState([1], [bustableLane()], { pendingPoints: 9 });

      const result = resolveInsertionRound(
        state,
        [{ laneIndex: 0, handIndexes: [0] }],
        chooser,
        scriptedRng([6])
      );

      // 積み上がっていた 9 点 + このラウンドの落下分 1 点
      expect(result.state.jackpotPoints).toBe(10);
      expect(pendingPointsOf(result.state)).toBe(0);
    });

    it("すでに確定した得点は失われない（docs/spec.md §3）", () => {
      const base = buildState([1], [bustableLane()], { pendingPoints: 9 });
      const state = { ...base, players: base.players.map((p) => ({ ...p, points: 12 })) };

      const result = resolveInsertionRound(
        state,
        [{ laneIndex: 0, handIndexes: [0] }],
        chooser,
        scriptedRng([6])
      );

      expect(result.state.players[0]?.points).toBe(12);
    });

    it("ジャックポットカウンターを1つ進める（docs/spec.md §5）", () => {
      const state = buildState([1], [bustableLane()], { jackpotCounter: 2 });

      const result = resolveInsertionRound(
        state,
        [{ laneIndex: 0, handIndexes: [0] }],
        chooser,
        scriptedRng([6])
      );

      expect(result.state.jackpotCounter).toBe(3);
    });

    it("横穴が出なければジャックポットへは移らない", () => {
      const state = buildState([1], [bustableLane()], { pendingPoints: 9 });

      const result = resolveInsertionRound(
        state,
        [{ laneIndex: 0, handIndexes: [0] }],
        chooser,
        scriptedRng([5])
      );

      expect(result.busted).toBe(false);
      expect(result.state.jackpotPoints).toBe(0);
      expect(pendingPointsOf(result.state)).toBeGreaterThan(9);
    });

    it("目標値が低くても出目6なら横穴になる（docs/spec.md §5 / #67）", () => {
      const state = buildState([1], [{ stock: [coin(3)] }]);

      const result = resolveInsertionRound(
        state,
        [{ laneIndex: 0, handIndexes: [0] }],
        chooser,
        scriptedRng([6])
      );

      expect(result.lanes[0]?.outcome).toBe("sideHole");
      expect(result.busted).toBe(true);
    });

    it("横穴の下限を戻せば、目標値6未満の出目6は失敗になる（#67 以前の既定）", () => {
      const state = buildState([1], [{ stock: [coin(3)] }], {
        config: withPreset("sideHoleTarget6"),
      });

      const result = resolveInsertionRound(
        state,
        [{ laneIndex: 0, handIndexes: [0] }],
        chooser,
        scriptedRng([6])
      );

      expect(result.lanes[0]?.outcome).toBe("failure");
      expect(result.busted).toBe(false);
    });

    it("同じラウンドで2レーンが横穴でも横穴は1回として扱う（docs/spec.md ルール解釈メモ）", () => {
      const state = buildState([1, 1], [bustableLane(), bustableLane(), {}], {
        jackpotCounter: 0,
        config: withPreset("multiLane"),
      });

      const result = resolveInsertionRound(
        state,
        [
          { laneIndex: 0, handIndexes: [0] },
          { laneIndex: 1, handIndexes: [1] },
        ],
        chooser,
        scriptedRng([6, 6])
      );

      expect(result.lanes.map((l) => l.outcome)).toEqual(["sideHole", "sideHole"]);
      expect(result.state.jackpotCounter).toBe(1);
      // 両レーンの落下分がまとめてジャックポットへ
      expect(result.state.jackpotPoints).toBe(2);
    });

    it("カウンターが閾値に達したら即座に JP判定を行う（docs/spec.md §5）", () => {
      const state = buildState([1], [bustableLane()], {
        jackpotCounter: 4,
        jackpotPoints: 20,
        pendingPoints: 0,
      });

      // 1個目が投入ラウンドの出目、2個目が JP判定の出目
      const result = resolveInsertionRound(
        state,
        [{ laneIndex: 0, handIndexes: [0] }],
        chooser,
        scriptedRng([6, 6])
      );

      expect(result.jackpot).toEqual({ roll: 6, won: true, wonPoints: 21 });
      expect(result.state.players[0]?.points).toBe(21);
      expect(result.state.jackpotCounter).toBe(0);
    });

    it("JP判定に外れたらカウンターは据え置き（docs/spec.md §5）", () => {
      const state = buildState([1], [bustableLane()], { jackpotCounter: 4, jackpotPoints: 20 });

      const result = resolveInsertionRound(
        state,
        [{ laneIndex: 0, handIndexes: [0] }],
        chooser,
        scriptedRng([6, 3])
      );

      expect(result.jackpot).toEqual({ roll: 3, won: false, wonPoints: 0 });
      expect(result.state.jackpotCounter).toBe(5);
      expect(result.state.jackpotPoints).toBe(21);
    });

    it("カウンターが閾値未満なら JP判定は行わない", () => {
      const state = buildState([1], [bustableLane()], { jackpotCounter: 0 });

      // JP判定の出目を用意していないので、振ったら「出目を使い切った」で落ちる
      const result = resolveInsertionRound(
        state,
        [{ laneIndex: 0, handIndexes: [0] }],
        chooser,
        scriptedRng([6])
      );

      expect(result.jackpot).toBeNull();
    });

    it("横穴が出なければ JP判定は行わない", () => {
      const state = buildState([1], [bustableLane()], { jackpotCounter: 5 });

      const result = resolveInsertionRound(
        state,
        [{ laneIndex: 0, handIndexes: [0] }],
        chooser,
        scriptedRng([5])
      );

      expect(result.jackpot).toBeNull();
    });
  });

  it("元の状態を変更しない", () => {
    const state = buildState([2], [{ stock: [coin(3)], pending: faceDown([coin(1)]) }]);

    resolveInsertionRound(state, [{ laneIndex: 0, handIndexes: [0] }], chooser, scriptedRng([3]));

    expect(state.players[0]?.hand).toHaveLength(1);
    expect(pendingPointsOf(state)).toBe(0);
    expect(state.lanes[0]?.pending).toHaveLength(1);
  });

  describe("続けられるか（docs/spec.md §3 チキンレース）", () => {
    it("手札が残っていて横穴も出ていなければ続けられる", () => {
      const state = buildState([1, 1], [{ stock: [coin(2)] }]);

      const result = resolveInsertionRound(
        state,
        [{ laneIndex: 0, handIndexes: [0] }],
        chooser,
        scriptedRng([1])
      );

      expect(result.canContinue).toBe(true);
    });

    it("横穴が出たら続けられない（手番は即座に終了する）", () => {
      const state = buildState(
        [1, 1],
        [{ stock: [coin(1)], pending: faceDown([coin(1), coin(1), coin(1), coin(1), coin(1)]) }]
      );

      const result = resolveInsertionRound(
        state,
        [{ laneIndex: 0, handIndexes: [0] }],
        chooser,
        scriptedRng([6])
      );

      expect(result.busted).toBe(true);
      expect(result.canContinue).toBe(false);
    });

    it("手札が空になったら続けられない（docs/spec.md §3）", () => {
      const state = buildState([1], [{ stock: [coin(2)] }]);

      const result = resolveInsertionRound(
        state,
        [{ laneIndex: 0, handIndexes: [0] }],
        chooser,
        scriptedRng([1])
      );

      expect(result.state.players[0]?.hand).toEqual([]);
      expect(result.canContinue).toBe(false);
    });

    it("投入ラウンド数を数える", () => {
      const state = buildState([1, 1], [{ stock: [coin(2), coin(2)] }]);

      const first = resolveInsertionRound(
        state,
        [{ laneIndex: 0, handIndexes: [0] }],
        chooser,
        scriptedRng([1])
      );
      expect(first.state.insertionRoundsThisTurn).toBe(1);

      const second = resolveInsertionRound(
        first.state,
        [{ laneIndex: 0, handIndexes: [0] }],
        chooser,
        scriptedRng([1])
      );
      expect(second.state.insertionRoundsThisTurn).toBe(2);
    });

    it("config.maxInsertionRoundsPerTurn に達したら続けられない", () => {
      const base = buildState([1, 1, 1], [{ stock: [coin(2), coin(2)] }]);
      const state = {
        ...base,
        config: { ...base.config, maxInsertionRoundsPerTurn: 1 },
      };

      const result = resolveInsertionRound(
        state,
        [{ laneIndex: 0, handIndexes: [0] }],
        chooser,
        scriptedRng([1])
      );

      expect(result.state.players[0]?.hand).toHaveLength(2);
      expect(result.canContinue).toBe(false);
    });

    it("既定は無制限なので手札と横穴だけが上限になる", () => {
      expect(DEFAULT_BALANCE.maxInsertionRoundsPerTurn).toBeNull();
    });

    it("横穴で手番が終わったら投入ラウンド数を戻す", () => {
      const base = buildState(
        [1, 1],
        [{ stock: [coin(1)], pending: faceDown([coin(1), coin(1), coin(1), coin(1), coin(1)]) }],
        { insertionRoundsThisTurn: 3 }
      );

      const result = resolveInsertionRound(
        base,
        [{ laneIndex: 0, handIndexes: [0] }],
        chooser,
        scriptedRng([6])
      );

      expect(result.state.insertionRoundsThisTurn).toBe(0);
    });
  });

  describe("バースト確率（docs/spec.md §3 リスクの調整ダイヤル）", () => {
    /** 目標値6以上のレーン。出目6 が横穴になる */
    const bustable = (): Partial<Lane> => ({
      stock: [coin(1), coin(1), coin(1)],
      pending: faceDown([coin(1), coin(1), coin(1), coin(1), coin(1)]),
    });

    /** k個のダイスの出目の全組み合わせ（6^k 通り） */
    function allRolls(k: number): number[][] {
      return k === 0
        ? [[]]
        : allRolls(k - 1).flatMap((rest) => [1, 2, 3, 4, 5, 6].map((face) => [face, ...rest]));
    }

    it.each([1, 2, 3])("%i レーンに投入したバースト確率は 1-(5/6)^k になる", (laneCount) => {
      const state = buildState([1, 1, 1], [bustable(), bustable(), bustable()], {
        config: withPreset("multiLane"),
      });
      const insertions = Array.from({ length: laneCount }, (_, i) => ({
        laneIndex: i,
        handIndexes: [i],
      }));

      const combinations = allRolls(laneCount);
      const busts = combinations.filter(
        // JP判定は起きない（カウンターが 0 から始まる）ので、出目は投入ラウンドのぶんだけ
        (rolls) => resolveInsertionRound(state, insertions, chooser, scriptedRng(rolls)).busted
      ).length;

      expect(busts / combinations.length).toBeCloseTo(1 - (5 / 6) ** laneCount, 10);
    });
  });

  describe("落下カードのイベント（docs/spec.md §6）", () => {
    const eventCard = (kind: "extraSlot"): Card => ({ kind: "event", event: kind });

    it("落ちたカードがイベントなら効果を解決する", () => {
      const state = buildState([2], [{ stock: [eventCard("extraSlot"), coin(1)] }, {}, {}]);

      const result = resolveInsertionRound(
        state,
        [{ laneIndex: 0, handIndexes: [0] }],
        { chooseLane: () => 2, choosePending: () => 0 },
        scriptedRng([1])
      );

      expect(result.state.lanes[2]?.hasExtraSlot).toBe(true);
      expect(result.events).toEqual([{ event: "extraSlot", extraTurn: true }]);
    });

    it("イベントが落ちなければ events は空", () => {
      const state = buildState([2], [{ stock: [coin(1)] }, {}, {}]);

      const result = resolveInsertionRound(
        state,
        [{ laneIndex: 0, handIndexes: [0] }],
        chooser,
        scriptedRng([1])
      );

      expect(result.events).toEqual([]);
    });
  });
});
