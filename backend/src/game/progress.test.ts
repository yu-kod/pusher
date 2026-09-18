import { describe, expect, it } from "vitest";
import { coin, faceDown } from "../test-utils/cards.js";
import { DEFAULT_BALANCE, withPreset } from "./balance.js";
import { createRng } from "./rng.js";
import { setupGame, type GameState } from "./setup.js";
import type { EventCard } from "./deck.js";
import type { EventChooser } from "./resolve.js";
import { determineWinners, endRound, endTurn } from "./progress.js";
import { scriptedRng } from "../test-utils/rng.js";
import { splitOverrides, withPendingPoints, type StateOverrides } from "../test-utils/state.js";
import { pendingPointsOf } from "./push.js";

/** レーン0・滞留の先頭を選ぶ chooser */
const chooser: EventChooser = { chooseLane: () => 0, choosePending: () => 0 };

/** イベントを引かないテスト用。振られたら「出目を使い切った」で落ちる */
const noRolls = scriptedRng([]);

function buildState(overrides?: StateOverrides): GameState {
  const { pendingPoints, rest } = splitOverrides(overrides);
  const base = setupGame(["A", "B", "C"], createRng(1), DEFAULT_BALANCE);
  return withPendingPoints(
    {
      ...base,
      players: base.players.map((p) => ({ ...p, hand: [], points: 0 })),
      lanes: base.lanes.map((lane) => ({ ...lane, stock: [], pending: [] })),
      drawPile: [],
      discardPile: [],
      insertionRoundsThisTurn: 0,
      jackpotPoints: 0,
      jackpotCounter: 0,
      ...rest,
    },
    pendingPoints
  );
}

describe("endTurn（手番の終了）", () => {
  it("未確定得点を手番プレイヤーの得点に加える（docs/spec.md §3「やめる」）", () => {
    const state = buildState({ pendingPoints: 7 });

    const result = endTurn(state);

    expect(result.state.players[0]?.points).toBe(7);
    expect(pendingPointsOf(result.state)).toBe(0);
  });

  it("次のプレイヤーへ手番を移す（docs/spec.md §3）", () => {
    const state = buildState();

    expect(endTurn(state).state.currentPlayerIndex).toBe(1);
  });

  it("最後のプレイヤーの手番が終わったら先頭へ戻る", () => {
    const state = { ...buildState(), currentPlayerIndex: 2 };

    expect(endTurn(state).state.currentPlayerIndex).toBe(0);
  });

  it("全員が手番を終えたらラウンド終了になる（docs/spec.md §3）", () => {
    expect(endTurn({ ...buildState(), currentPlayerIndex: 2 }).roundEnded).toBe(true);
  });

  it("途中のプレイヤーではラウンド終了にならない", () => {
    expect(endTurn(buildState()).roundEnded).toBe(false);
    expect(endTurn({ ...buildState(), currentPlayerIndex: 1 }).roundEnded).toBe(false);
  });

  it("投入ラウンドの回数を戻す", () => {
    const state = buildState({ insertionRoundsThisTurn: 3 });

    expect(endTurn(state).state.insertionRoundsThisTurn).toBe(0);
  });

  it("横穴で終わった手番でも呼べる（未確定得点はすでに 0）", () => {
    const base = buildState({ pendingPoints: 0, jackpotPoints: 9 });
    const state = { ...base, players: base.players.map((p) => ({ ...p, points: 4 })) };

    const result = endTurn(state);

    expect(result.state.players[0]?.points).toBe(4);
    expect(result.state.jackpotPoints).toBe(9);
  });

  it("元の状態を変更しない", () => {
    const state = buildState({ pendingPoints: 7 });

    endTurn(state);

    expect(pendingPointsOf(state)).toBe(7);
    expect(state.currentPlayerIndex).toBe(0);
  });

  it("手番プレイヤーの添字が範囲外なら例外を投げる", () => {
    const state = { ...buildState(), currentPlayerIndex: 99 };

    expect(() => endTurn(state)).toThrow(RangeError);
  });

  it("得点はカードではなく点数で持つ（手札は減らない）", () => {
    const base = buildState({ pendingPoints: 3 });
    const state = { ...base, players: base.players.map((p) => ({ ...p, hand: [coin(2)] })) };

    expect(endTurn(state).state.players[0]?.hand).toEqual([coin(2)]);
  });
});

describe("endRound（ラウンド終了処理）", () => {
  /** シャッフルせずそのまま返す Rng。山札の並びを追えるようにする */
  const noShuffle = { shuffle: <T>(items: readonly T[]): T[] => [...items] };

  it("各プレイヤーが山札から3枚ドローする（docs/spec.md §3）", () => {
    const state = buildState({
      drawPile: [coin(1), coin(1), coin(1), coin(2), coin(2), coin(2), coin(3), coin(3), coin(3)],
    });

    const result = endRound(state, { ...noRolls, ...noShuffle }, chooser);

    expect(result.state.players.map((p) => p.hand)).toEqual([
      [coin(1), coin(1), coin(1)],
      [coin(2), coin(2), coin(2)],
      [coin(3), coin(3), coin(3)],
    ]);
    expect(result.state.drawPile).toEqual([]);
  });

  it("既存の手札に積み増す", () => {
    const base = buildState({ drawPile: Array.from({ length: 9 }, () => coin(1)) });
    const state = { ...base, players: base.players.map((p) => ({ ...p, hand: [coin(3)] })) };

    expect(endRound(state, { ...noRolls, ...noShuffle }, chooser).state.players[0]?.hand).toEqual([
      coin(3),
      coin(1),
      coin(1),
      coin(1),
    ]);
  });

  it("ドロー枚数は config.roundDrawCount で変えられる", () => {
    const base = buildState({ drawPile: [coin(1), coin(1), coin(1)] });
    const state = { ...base, config: withPreset("roundDraw1") };

    const result = endRound(state, { ...noRolls, ...noShuffle }, chooser);

    expect(result.state.players.map((p) => p.hand.length)).toEqual([1, 1, 1]);
  });

  it("ラウンド番号を1つ進める", () => {
    const state = buildState({ round: 3, drawPile: [] });

    expect(endRound(state, { ...noRolls, ...noShuffle }, chooser).state.round).toBe(4);
  });

  it("レーンへの補充は行わない（docs/spec.md §4-3）", () => {
    const state = buildState({ drawPile: [coin(1), coin(1), coin(1), coin(1), coin(1), coin(1)] });

    const result = endRound(state, { ...noRolls, ...noShuffle }, chooser);

    expect(result.state.lanes.map((l) => l.stock.length)).toEqual([0, 0, 0]);
  });

  it("元の状態を変更しない", () => {
    const state = buildState({ drawPile: [coin(1), coin(1), coin(1), coin(1), coin(1), coin(1)] });

    endRound(state, { ...noRolls, ...noShuffle }, chooser);

    expect(state.players[0]?.hand).toEqual([]);
    expect(state.drawPile).toHaveLength(6);
  });

  describe("山札が尽きたとき（docs/spec.md §3）", () => {
    it("捨て札をシャッフルして山札とする", () => {
      const state = buildState({
        drawPile: [coin(1)],
        discardPile: Array.from({ length: 8 }, () => coin(2)),
      });

      const result = endRound(state, { ...noRolls, ...noShuffle }, chooser);

      expect(result.state.players[0]?.hand).toEqual([coin(1), coin(2), coin(2)]);
      expect(result.state.discardPile).toEqual([]);
      expect(result.deckExhausted).toBe(false);
    });

    it("捨て札も尽きたらあるぶんだけ引いて終了を知らせる", () => {
      const state = buildState({ drawPile: [coin(1), coin(1), coin(1), coin(1)], discardPile: [] });

      const result = endRound(state, { ...noRolls, ...noShuffle }, chooser);

      expect(result.state.players.map((p) => p.hand.length)).toEqual([3, 1, 0]);
      expect(result.deckExhausted).toBe(true);
    });

    it("山札も捨て札も空なら誰も引けない", () => {
      const result = endRound(buildState(), { ...noRolls, ...noShuffle }, chooser);

      expect(result.state.players.every((p) => p.hand.length === 0)).toBe(true);
      expect(result.deckExhausted).toBe(true);
    });

    it("シャッフルには渡された Rng を使う", () => {
      const state = buildState({
        drawPile: [],
        discardPile: [
          coin(1),
          coin(2),
          coin(3),
          coin(1),
          coin(2),
          coin(3),
          coin(1),
          coin(2),
          coin(3),
        ],
      });

      // 逆順に並べ替える Rng
      const reversing = { shuffle: <T>(items: readonly T[]): T[] => [...items].reverse() };

      expect(endRound(state, { ...noRolls, ...reversing }, chooser).state.players[0]?.hand).toEqual(
        [coin(3), coin(2), coin(1)]
      );
    });
  });
});

describe("ゲーム終了（docs/spec.md §3）", () => {
  const noShuffle = { shuffle: <T>(items: readonly T[]): T[] => [...items] };

  /** ドローで山札が尽きないよう十分な枚数を積む */
  const plentyDrawPile = () => Array.from({ length: 20 }, () => coin(1));

  it("最終ラウンドの終了でゲームが終わる", () => {
    const state = buildState({ round: DEFAULT_BALANCE.maxRounds, drawPile: plentyDrawPile() });

    const result = endRound(state, { ...noRolls, ...noShuffle }, chooser);

    expect(result.gameOver).toBe(true);
    expect(result.state.phase).toBe("finished");
  });

  it("最終ラウンドまではゲームが続く", () => {
    const state = buildState({ round: DEFAULT_BALANCE.maxRounds - 1, drawPile: plentyDrawPile() });

    const result = endRound(state, { ...noRolls, ...noShuffle }, chooser);

    expect(result.gameOver).toBe(false);
    expect(result.state.phase).toBe("playing");
  });

  it("山札も捨て札も尽きたらその時点で終了する", () => {
    const state = buildState({ round: 2, drawPile: [], discardPile: [] });

    const result = endRound(state, { ...noRolls, ...noShuffle }, chooser);

    expect(result.deckExhausted).toBe(true);
    expect(result.gameOver).toBe(true);
    expect(result.state.phase).toBe("finished");
  });

  it("終了時、未払い出しのジャックポットは既定では流れる（§5 / #68）", () => {
    const base = buildState({
      round: DEFAULT_BALANCE.maxRounds,
      drawPile: plentyDrawPile(),
      jackpotCounter: DEFAULT_BALANCE.jackpotThreshold,
      jackpotPoints: 15,
    });
    const state = { ...base, lastSideHolePlayerId: base.players[1]?.id ?? null };

    const result = endRound(state, { ...noRolls, ...noShuffle }, chooser);

    expect(result.state.players.every((p) => p.points === 0)).toBe(true);
    expect(result.state.jackpotPoints).toBe(0);
  });

  it("払い出す設定なら、最後に横穴を出したプレイヤーが獲得する（#68 以前の既定）", () => {
    const config = withPreset("payUnpaidJackpot");
    const base = buildState({
      config,
      round: config.maxRounds,
      drawPile: plentyDrawPile(),
      jackpotCounter: config.jackpotThreshold,
      jackpotPoints: 15,
    });
    const state = { ...base, lastSideHolePlayerId: base.players[1]?.id ?? null };

    const result = endRound(state, { ...noRolls, ...noShuffle }, chooser);

    expect(result.state.players[1]?.points).toBe(15);
    expect(result.state.jackpotPoints).toBe(0);
  });

  it("終了時、カウンターが閾値未満ならジャックポットは流れる（§5）", () => {
    const base = buildState({
      round: DEFAULT_BALANCE.maxRounds,
      drawPile: plentyDrawPile(),
      jackpotCounter: DEFAULT_BALANCE.jackpotThreshold - 1,
      jackpotPoints: 15,
    });
    const state = { ...base, lastSideHolePlayerId: base.players[1]?.id ?? null };

    const result = endRound(state, { ...noRolls, ...noShuffle }, chooser);

    expect(result.state.players.every((p) => p.points === 0)).toBe(true);
    expect(result.state.jackpotPoints).toBe(0);
  });

  it("終了していなければジャックポットはそのまま残る", () => {
    const state = buildState({
      round: 1,
      drawPile: plentyDrawPile(),
      jackpotCounter: DEFAULT_BALANCE.jackpotThreshold,
      jackpotPoints: 15,
    });

    expect(endRound(state, { ...noRolls, ...noShuffle }, chooser).state.jackpotPoints).toBe(15);
  });
});

describe("determineWinners（勝敗判定・docs/spec.md §3）", () => {
  /** 得点と手札枚数を指定したプレイヤーを持つ状態を作る */
  function stateWith(players: readonly { points: number; handSize: number }[]): GameState {
    const base = buildState();
    return {
      ...base,
      players: base.players.map((p, i) => ({
        ...p,
        points: players[i]?.points ?? 0,
        hand: Array.from({ length: players[i]?.handSize ?? 0 }, () => coin(1)),
      })),
    };
  }

  it("得点が最も多いプレイヤーが勝つ", () => {
    const state = stateWith([
      { points: 12, handSize: 0 },
      { points: 30, handSize: 0 },
      { points: 21, handSize: 0 },
    ]);

    expect(determineWinners(state).map((p) => p.id)).toEqual(["p2"]);
  });

  it("同点なら手札が多いほうが勝つ（少ない弾薬で同じ点数を得たため）", () => {
    const state = stateWith([
      { points: 30, handSize: 2 },
      { points: 30, handSize: 5 },
      { points: 12, handSize: 9 },
    ]);

    expect(determineWinners(state).map((p) => p.id)).toEqual(["p2"]);
  });

  it("手札枚数は最多得点者のあいだでだけ比べる", () => {
    const state = stateWith([
      { points: 30, handSize: 1 },
      { points: 12, handSize: 99 },
      { points: 12, handSize: 99 },
    ]);

    expect(determineWinners(state).map((p) => p.id)).toEqual(["p1"]);
  });

  it("得点も手札枚数も並んだら引き分け（docs/spec.md ルール解釈メモ）", () => {
    const state = stateWith([
      { points: 30, handSize: 4 },
      { points: 30, handSize: 4 },
      { points: 12, handSize: 0 },
    ]);

    expect(determineWinners(state).map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("全員が 0 点でも勝者を返す", () => {
    const state = stateWith([
      { points: 0, handSize: 0 },
      { points: 0, handSize: 0 },
      { points: 0, handSize: 0 },
    ]);

    expect(determineWinners(state)).toHaveLength(3);
  });

  it("元の状態を変更しない", () => {
    const state = stateWith([
      { points: 30, handSize: 1 },
      { points: 12, handSize: 2 },
      { points: 12, handSize: 3 },
    ]);

    determineWinners(state);

    expect(state.players.map((p) => p.points)).toEqual([30, 12, 12]);
  });
});

describe("ラウンド終了時に引いたイベント（docs/spec.md §6）", () => {
  const noShuffle = { shuffle: <T>(items: readonly T[]): T[] => [...items] };
  const eventCard = (kind: "extraSlot" | "openLane" | "lottery"): EventCard => ({
    kind: "event",
    event: kind,
  });

  it("イベントカードは手札に入らない（ルール解釈メモ）", () => {
    const state = buildState({
      drawPile: [eventCard("extraSlot"), ...Array.from({ length: 8 }, () => coin(1))],
    });

    const result = endRound(state, { ...scriptedRng([]), ...noShuffle }, chooser);

    // 3枚ドローのうち1枚がイベントだったので、手札に入るのは2枚
    expect(result.state.players[0]?.hand).toEqual([coin(1), coin(1)]);
    expect(result.state.players.flatMap((p) => p.hand).every((c) => c.kind === "coin")).toBe(true);
  });

  it("その場で効果を解決して捨て札にする（§6）", () => {
    const state = buildState({
      drawPile: [eventCard("extraSlot"), ...Array.from({ length: 8 }, () => coin(1))],
    });

    const result = endRound(
      state,
      { ...scriptedRng([]), ...noShuffle },
      {
        chooseLane: () => 2,
        choosePending: () => 0,
      }
    );

    expect(result.state.lanes[2]?.hasExtraSlot).toBe(true);
    expect(result.state.discardPile).toEqual([eventCard("extraSlot")]);
  });

  it("引き直しはしない（ドロー枚数は変わらない）", () => {
    const state = buildState({
      drawPile: [eventCard("extraSlot"), ...Array.from({ length: 8 }, () => coin(1))],
    });

    const result = endRound(state, { ...scriptedRng([]), ...noShuffle }, chooser);

    expect(result.state.drawPile).toEqual([]);
  });

  it("効果の得点は引いた人のものとして即座に確定する（ルール解釈メモ）", () => {
    const base = buildState({
      drawPile: [
        coin(1),
        coin(1),
        coin(1),
        coin(1),
        eventCard("openLane"),
        ...Array.from({ length: 4 }, () => coin(1)),
      ],
    });
    const state = {
      ...base,
      lanes: base.lanes.map((lane, i) =>
        i === 0 ? { ...lane, pending: faceDown([coin(3)]) } : lane
      ),
    };

    // 2人目が openLane を引く
    const result = endRound(state, { ...scriptedRng([]), ...noShuffle }, chooser);

    expect(result.state.players[1]?.points).toBe(3);
    expect(pendingPointsOf(result.state)).toBe(0);
  });

  it("「投入口増設」でも追加手番は発生しない（ルール解釈メモ）", () => {
    const state = buildState({
      drawPile: [eventCard("extraSlot"), ...Array.from({ length: 8 }, () => coin(1))],
    });

    const result = endRound(state, { ...scriptedRng([]), ...noShuffle }, chooser);

    expect(result.events).toEqual([{ event: "extraSlot", extraTurn: false }]);
  });

  it("「抽選抽選」は引いた人が JP判定を行う", () => {
    const state = buildState({
      drawPile: [
        ...Array.from({ length: 6 }, () => coin(1)),
        eventCard("lottery"),
        coin(1),
        coin(1),
      ],
      jackpotCounter: 3,
      jackpotPoints: 9,
    });

    // 3人目が lottery を引き、出目6 で当選する
    const result = endRound(state, { ...scriptedRng([6]), ...noShuffle }, chooser);

    expect(result.state.players[2]?.points).toBe(9);
    expect(result.state.jackpotPoints).toBe(0);
  });

  it("イベントを引かなければ events は空", () => {
    const state = buildState({ drawPile: Array.from({ length: 9 }, () => coin(1)) });

    expect(endRound(state, { ...scriptedRng([]), ...noShuffle }, chooser).events).toEqual([]);
  });
});

describe("スタートプレイヤーの交代（docs/spec.md §3）", () => {
  const noShuffle = { shuffle: <T>(items: readonly T[]): T[] => [...items] };
  const rng = { ...scriptedRng([]), ...noShuffle };
  const plenty = () => Array.from({ length: 20 }, () => coin(1));
  // v0.3 ではスタートプレイヤーという役そのものが無く、先行権の列が代わりになる。
  // 交代の仕組み自体は v0.2 の設定でしか動かないので、明示的に有効にして確かめる
  const rotating = { ...DEFAULT_BALANCE, rotateStartPlayer: true };

  it("ラウンド終了ごとにスタートプレイヤーが次へ回る", () => {
    const state = buildState({ drawPile: plenty(), config: rotating });

    const next = endRound(state, rng, chooser).state;

    expect(next.startPlayerIndex).toBe(1);
    expect(next.currentPlayerIndex).toBe(1);
  });

  it("v0.3 の既定では交代しない（先行権の列が役を兼ねる）", () => {
    const state = buildState({ drawPile: plenty() });

    expect(endRound(state, rng, chooser).state.startPlayerIndex).toBe(0);
  });

  it("最後のプレイヤーまで回ったら先頭へ戻る", () => {
    const state = buildState({
      drawPile: plenty(),
      startPlayerIndex: 2,
      currentPlayerIndex: 2,
      config: rotating,
    });

    expect(endRound(state, rng, chooser).state.startPlayerIndex).toBe(0);
  });

  it("スタートプレイヤーが一周したらラウンド終了になる", () => {
    // このラウンドは B から始まっている。D → B に戻ったらラウンド終了
    const state = buildState({ startPlayerIndex: 1, currentPlayerIndex: 0 });

    expect(endTurn(state).roundEnded).toBe(true);
  });

  it("スタートプレイヤーの手前ではラウンド終了にならない", () => {
    const state = buildState({ startPlayerIndex: 1, currentPlayerIndex: 1 });

    expect(endTurn(state).roundEnded).toBe(false);
  });

  it("config.rotateStartPlayer を false にすると交代しない", () => {
    const base = buildState({ drawPile: plenty() });
    const state = { ...base, config: { ...base.config, rotateStartPlayer: false } };

    const next = endRound(state, rng, chooser).state;

    expect(next.startPlayerIndex).toBe(0);
    expect(next.currentPlayerIndex).toBe(0);
  });

  it("セットアップでは先頭のプレイヤーから始まる（docs/spec.md §2）", () => {
    const state = setupGame(["A", "B", "C"], createRng(1), DEFAULT_BALANCE);

    expect(state.startPlayerIndex).toBe(0);
    expect(state.currentPlayerIndex).toBe(0);
  });
});
