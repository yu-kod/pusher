import { describe, expect, it } from "vitest";
import type { Card } from "./deck.js";
import { createRng } from "./rng.js";
import { DEFAULT_BALANCE } from "./balance.js";
import { setupGame, type GameState } from "./setup.js";
import { coin, faceDown } from "../test-utils/cards.js";
import { addToHand, resolvePush } from "./push.js";

/** レーン0 の中身と滞留、山札を指定した状態を作る */
function buildState(options: { stock?: Card[]; pending?: Card[]; drawPile?: Card[] }): GameState {
  const base = setupGame(["A", "B", "C"], createRng(1), DEFAULT_BALANCE);
  return {
    ...base,
    lanes: base.lanes.map((lane, i) =>
      i === 0
        ? { ...lane, stock: options.stock ?? [], pending: faceDown(options.pending ?? []) }
        : { ...lane, stock: [], pending: [] }
    ),
    drawPile: options.drawPile ?? [],
    players: base.players.map((p) => ({ ...p, hand: [] })),
  };
}

describe("resolvePush", () => {
  describe("4-1. 押し込み", () => {
    it("投入カードのコイン数ぶんの枚数を滞留から押し込む（docs/spec.md §4-1）", () => {
      // 滞留が4枚ある状態に2コイン札を投入して成功 → 押し込めるのは2枚
      const state = buildState({
        stock: [coin(3), coin(3), coin(3)],
        pending: [coin(1), coin(1), coin(1), coin(1), coin(2)],
      });

      const result = resolvePush(state, 0, 2);

      expect(result.pushedCount).toBe(2);
    });

    it("滞留エリアの奥側（先に入ったカード）から押し込む", () => {
      const state = buildState({
        stock: [coin(3)],
        pending: [coin(1), coin(2), coin(3)],
      });

      const result = resolvePush(state, 0, 2);

      // 先頭2枚が押し込まれ、残りは最後の1枚
      expect(result.state.lanes[0]?.pending).toEqual(faceDown([coin(3)]));
    });

    it("§4-1 の例どおり滞留に3枚が残る", () => {
      // 既存4枚 + 投入1枚 = 5枚。2枚押し込んで3枚残る
      const state = buildState({
        stock: [coin(3), coin(3)],
        pending: [coin(1), coin(1), coin(1), coin(1), coin(2)],
      });

      expect(resolvePush(state, 0, 2).state.lanes[0]?.pending).toHaveLength(3);
    });

    it("滞留が押し込み枚数に満たなければ、あるぶんだけ押し込む", () => {
      // 滞留1枚（投入分のみ）に3コイン札
      const state = buildState({ stock: [coin(1), coin(1)], pending: [coin(3)] });

      const result = resolvePush(state, 0, 3);

      expect(result.pushedCount).toBe(1);
      expect(result.state.lanes[0]?.pending).toEqual([]);
    });

    it("滞留が空なら何も押し込まず何も落ちない", () => {
      const state = buildState({ stock: [coin(1), coin(1)], pending: [] });

      const result = resolvePush(state, 0, 2);

      expect(result.pushedCount).toBe(0);
      expect(result.fallenCards).toEqual([]);
    });
  });

  describe("4-2. 落下", () => {
    it("押し込んだ枚数と同数がレーンの末端から落ちる（docs/spec.md §4-2）", () => {
      const state = buildState({
        stock: [coin(1), coin(2), coin(3)],
        pending: [coin(1), coin(1)],
      });

      const result = resolvePush(state, 0, 2);

      expect(result.fallenCards).toHaveLength(2);
    });

    it("レーンの末端側（先に入ったカード）から落ちる", () => {
      const state = buildState({
        stock: [coin(1), coin(2), coin(3)],
        pending: [coin(1), coin(1)],
      });

      const result = resolvePush(state, 0, 2);

      expect(result.fallenCards).toEqual([coin(1), coin(2)]);
    });

    it("押し込んだカードはレーンの奥に入り、すぐには落ちない", () => {
      const pushed = [coin(1), coin(1)];
      const state = buildState({ stock: [coin(3), coin(3), coin(3)], pending: pushed });

      const result = resolvePush(state, 0, 2);

      expect(result.fallenCards).toEqual([coin(3), coin(3)]);
      // 残ったレーンの奥側に押し込んだカードがある
      expect(result.state.lanes[0]?.stock.slice(-2)).toEqual(pushed);
    });

    it("レーンが空なら押し込んだカードがそのまま落ちる", () => {
      const state = buildState({ stock: [], pending: [coin(2), coin(3)] });

      const result = resolvePush(state, 0, 2);

      expect(result.fallenCards).toEqual([coin(2), coin(3)]);
    });
  });

  describe("4-3. 補充", () => {
    it("落下した枚数ぶん山札からレーンの奥へ補充する（docs/spec.md §4-3）", () => {
      const state = buildState({
        stock: [coin(1), coin(1)],
        pending: [coin(2), coin(2)],
        drawPile: [coin(3), coin(3), coin(3)],
      });

      const result = resolvePush(state, 0, 2);

      expect(result.state.drawPile).toEqual([coin(3)]);
      expect(result.state.lanes[0]?.stock.slice(-2)).toEqual([coin(3), coin(3)]);
    });

    it("山札が足りなければあるぶんだけ補充する", () => {
      const state = buildState({
        stock: [coin(1), coin(1)],
        pending: [coin(2), coin(2)],
        drawPile: [coin(3)],
      });

      const result = resolvePush(state, 0, 2);

      expect(result.state.drawPile).toEqual([]);
      expect(result.state.lanes[0]?.stock.slice(-1)).toEqual([coin(3)]);
    });

    it("山札が空でも例外にならない", () => {
      const state = buildState({
        stock: [coin(1), coin(1)],
        pending: [coin(2), coin(2)],
        drawPile: [],
      });

      expect(() => resolvePush(state, 0, 2)).not.toThrow();
    });
  });

  describe("レーンの増減", () => {
    it("成功のたびレーンの中身は押し込み枚数ぶん増える（docs/spec.md ルール解釈メモ）", () => {
      const state = buildState({
        stock: [coin(1), coin(1), coin(1)],
        pending: [coin(2), coin(2)],
        drawPile: [coin(3), coin(3)],
      });

      const result = resolvePush(state, 0, 2);

      // 3 + 2(押し込み) - 2(落下) + 2(補充) = 5
      expect(result.state.lanes[0]?.stock).toHaveLength(5);
    });
  });

  describe("不変性とカードの保存", () => {
    it("元の状態を変更しない", () => {
      const state = buildState({
        stock: [coin(1), coin(1)],
        pending: [coin(2), coin(2)],
        drawPile: [coin(3)],
      });

      resolvePush(state, 0, 2);

      expect(state.lanes[0]?.stock).toHaveLength(2);
      expect(state.lanes[0]?.pending).toHaveLength(2);
      expect(state.drawPile).toHaveLength(1);
    });

    it("カードが増えも減りもしない", () => {
      const state = buildState({
        stock: [coin(1), coin(1)],
        pending: [coin(2), coin(2), coin(3)],
        drawPile: [coin(3), coin(1)],
      });

      const result = resolvePush(state, 0, 2);

      const countAll = (s: GameState, extra: Card[] = []) =>
        s.drawPile.length +
        s.lanes.reduce((n, l) => n + l.stock.length + l.pending.length, 0) +
        s.players.reduce((n, p) => n + p.hand.length, 0) +
        s.jackpotPool.length +
        extra.length;

      expect(countAll(result.state, result.fallenCards)).toBe(countAll(state));
    });

    it("他のレーンには影響しない", () => {
      const state = buildState({ stock: [coin(1)], pending: [coin(2)], drawPile: [coin(3)] });

      const result = resolvePush(state, 0, 1);

      expect(result.state.lanes[1]).toEqual(state.lanes[1]);
    });
  });

  describe("入力の検証", () => {
    it("存在しないレーンなら例外を投げる", () => {
      expect(() => resolvePush(buildState({}), 9, 1)).toThrow(RangeError);
    });

    it("押し込み枚数が 1 未満なら例外を投げる", () => {
      expect(() => resolvePush(buildState({}), 0, 0)).toThrow(RangeError);
      expect(() => resolvePush(buildState({}), 0, 1.5)).toThrow(RangeError);
    });
  });
});

describe("addToHand", () => {
  it("落ちたカードを手番プレイヤーの手札に加える（docs/spec.md §4-2）", () => {
    const state = buildState({});

    const next = addToHand(state, [coin(2), coin(3)]);

    expect(next.players[0]?.hand).toEqual([coin(2), coin(3)]);
  });

  it("既存の手札の後ろに加える", () => {
    const base = buildState({});
    const state = {
      ...base,
      players: base.players.map((p, i) => (i === 0 ? { ...p, hand: [coin(1)] } : p)),
    };

    expect(addToHand(state, [coin(2)]).players[0]?.hand).toEqual([coin(1), coin(2)]);
  });

  it("手番プレイヤー以外の手札は変わらない", () => {
    const state = buildState({});

    const next = addToHand(state, [coin(2)]);

    expect(next.players[1]?.hand).toEqual([]);
  });

  it("元の状態を変更しない", () => {
    const state = buildState({});

    addToHand(state, [coin(2)]);

    expect(state.players[0]?.hand).toEqual([]);
  });

  it("空配列を渡しても壊れない", () => {
    const state = buildState({});

    expect(addToHand(state, []).players[0]?.hand).toEqual([]);
  });

  it("手番プレイヤーの添字が範囲外なら例外を投げる", () => {
    const state = { ...buildState({}), currentPlayerIndex: 99 };

    expect(() => addToHand(state, [coin(2)])).toThrow(RangeError);
  });
});
