import { describe, expect, it } from "vitest";
import { coin } from "../test-utils/cards.js";
import { DEFAULT_BALANCE, withPreset } from "./balance.js";
import { createRng } from "./rng.js";
import { setupGame, type GameState } from "./setup.js";
import { determineWinners, endRound, endTurn } from "./progress.js";

function buildState(overrides?: Partial<GameState>): GameState {
  const base = setupGame(["A", "B", "C"], createRng(1), DEFAULT_BALANCE);
  return {
    ...base,
    players: base.players.map((p) => ({ ...p, hand: [], points: 0 })),
    lanes: base.lanes.map((lane) => ({ ...lane, stock: [], pending: [] })),
    drawPile: [],
    discardPile: [],
    pendingPoints: 0,
    insertionRoundsThisTurn: 0,
    jackpotPoints: 0,
    jackpotCounter: 0,
    ...overrides,
  };
}

describe("endTurn（手番の終了）", () => {
  it("未確定得点を手番プレイヤーの得点に加える（docs/spec.md §3「やめる」）", () => {
    const state = buildState({ pendingPoints: 7 });

    const result = endTurn(state);

    expect(result.state.players[0]?.points).toBe(7);
    expect(result.state.pendingPoints).toBe(0);
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

    expect(state.pendingPoints).toBe(7);
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

  it("各プレイヤーが山札から2枚ドローする（docs/spec.md §3）", () => {
    const state = buildState({
      drawPile: [coin(1), coin(1), coin(2), coin(2), coin(3), coin(3)],
    });

    const result = endRound(state, noShuffle);

    expect(result.state.players.map((p) => p.hand)).toEqual([
      [coin(1), coin(1)],
      [coin(2), coin(2)],
      [coin(3), coin(3)],
    ]);
    expect(result.state.drawPile).toEqual([]);
  });

  it("既存の手札に積み増す", () => {
    const base = buildState({ drawPile: [coin(1), coin(1), coin(1), coin(1), coin(1), coin(1)] });
    const state = { ...base, players: base.players.map((p) => ({ ...p, hand: [coin(3)] })) };

    expect(endRound(state, noShuffle).state.players[0]?.hand).toEqual([coin(3), coin(1), coin(1)]);
  });

  it("ドロー枚数は config.roundDrawCount で変えられる", () => {
    const base = buildState({ drawPile: [coin(1), coin(1), coin(1)] });
    const state = { ...base, config: withPreset("roundDraw1") };

    const result = endRound(state, noShuffle);

    expect(result.state.players.map((p) => p.hand.length)).toEqual([1, 1, 1]);
  });

  it("ラウンド番号を1つ進める", () => {
    const state = buildState({ round: 3, drawPile: [] });

    expect(endRound(state, noShuffle).state.round).toBe(4);
  });

  it("レーンへの補充は行わない（docs/spec.md §4-3）", () => {
    const state = buildState({ drawPile: [coin(1), coin(1), coin(1), coin(1), coin(1), coin(1)] });

    const result = endRound(state, noShuffle);

    expect(result.state.lanes.map((l) => l.stock.length)).toEqual([0, 0, 0]);
  });

  it("元の状態を変更しない", () => {
    const state = buildState({ drawPile: [coin(1), coin(1), coin(1), coin(1), coin(1), coin(1)] });

    endRound(state, noShuffle);

    expect(state.players[0]?.hand).toEqual([]);
    expect(state.drawPile).toHaveLength(6);
  });

  describe("山札が尽きたとき（docs/spec.md §3）", () => {
    it("捨て札をシャッフルして山札とする", () => {
      const state = buildState({
        drawPile: [coin(1)],
        discardPile: [coin(2), coin(2), coin(2), coin(2), coin(2)],
      });

      const result = endRound(state, noShuffle);

      expect(result.state.players[0]?.hand).toEqual([coin(1), coin(2)]);
      expect(result.state.discardPile).toEqual([]);
      expect(result.deckExhausted).toBe(false);
    });

    it("捨て札も尽きたらあるぶんだけ引いて終了を知らせる", () => {
      const state = buildState({ drawPile: [coin(1), coin(1), coin(1)], discardPile: [] });

      const result = endRound(state, noShuffle);

      expect(result.state.players.map((p) => p.hand.length)).toEqual([2, 1, 0]);
      expect(result.deckExhausted).toBe(true);
    });

    it("山札も捨て札も空なら誰も引けない", () => {
      const result = endRound(buildState(), noShuffle);

      expect(result.state.players.every((p) => p.hand.length === 0)).toBe(true);
      expect(result.deckExhausted).toBe(true);
    });

    it("シャッフルには渡された Rng を使う", () => {
      const state = buildState({
        drawPile: [],
        discardPile: [coin(1), coin(2), coin(3), coin(1), coin(2), coin(3)],
      });

      // 逆順に並べ替える Rng
      const reversing = { shuffle: <T>(items: readonly T[]): T[] => [...items].reverse() };

      expect(endRound(state, reversing).state.players[0]?.hand).toEqual([coin(3), coin(2)]);
    });
  });
});

describe("ゲーム終了（docs/spec.md §3）", () => {
  const noShuffle = { shuffle: <T>(items: readonly T[]): T[] => [...items] };

  /** ドローで山札が尽きないよう十分な枚数を積む */
  const plentyDrawPile = () => Array.from({ length: 20 }, () => coin(1));

  it("最終ラウンドの終了でゲームが終わる", () => {
    const state = buildState({ round: DEFAULT_BALANCE.maxRounds, drawPile: plentyDrawPile() });

    const result = endRound(state, noShuffle);

    expect(result.gameOver).toBe(true);
    expect(result.state.phase).toBe("finished");
  });

  it("最終ラウンドまではゲームが続く", () => {
    const state = buildState({ round: DEFAULT_BALANCE.maxRounds - 1, drawPile: plentyDrawPile() });

    const result = endRound(state, noShuffle);

    expect(result.gameOver).toBe(false);
    expect(result.state.phase).toBe("playing");
  });

  it("山札も捨て札も尽きたらその時点で終了する", () => {
    const state = buildState({ round: 2, drawPile: [], discardPile: [] });

    const result = endRound(state, noShuffle);

    expect(result.deckExhausted).toBe(true);
    expect(result.gameOver).toBe(true);
    expect(result.state.phase).toBe("finished");
  });

  it("終了時、カウンターが閾値なら最後に横穴を出したプレイヤーがジャックポットを獲得する（§5）", () => {
    const base = buildState({
      round: DEFAULT_BALANCE.maxRounds,
      drawPile: plentyDrawPile(),
      jackpotCounter: DEFAULT_BALANCE.jackpotThreshold,
      jackpotPoints: 15,
    });
    const state = { ...base, lastSideHolePlayerId: base.players[1]?.id ?? null };

    const result = endRound(state, noShuffle);

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

    const result = endRound(state, noShuffle);

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

    expect(endRound(state, noShuffle).state.jackpotPoints).toBe(15);
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
