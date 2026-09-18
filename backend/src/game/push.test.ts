import { describe, expect, it } from "vitest";
import type { Card } from "./deck.js";
import { createRng } from "./rng.js";
import { withPreset } from "./balance.js";
import { setupGame, type GameState } from "./setup.js";
import { coin, faceDown } from "../test-utils/cards.js";
import { bankPendingPoints, collectFallenCards, resolvePush } from "./push.js";
import { pendingPointsOf } from "./push.js";
import { withPendingPoints } from "../test-utils/state.js";

/**
 * レーン0 の中身と滞留、山札を指定した状態を作る。
 *
 * 押し込み枚数の**式**は調整値なので balance.test.ts で検証する。ここでは
 * 「投入コイン数 = 押し込み枚数」に固定して、押し込みと落下の**順序と枚数の対応**だけを見る。
 */
function buildState(options: { stock?: Card[]; pending?: Card[]; drawPile?: Card[] }): GameState {
  const base = setupGame(["A", "B", "C"], createRng(1), withPreset("pushFull"));
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

  describe("4-3. 補充は行わない（docs/spec.md §4-3）", () => {
    it("押し出しでは山札が減らない", () => {
      const state = buildState({
        stock: [coin(1), coin(1)],
        pending: [coin(2), coin(2)],
        drawPile: [coin(3), coin(3), coin(3)],
      });

      const result = resolvePush(state, 0, 2);

      expect(result.state.drawPile).toEqual([coin(3), coin(3), coin(3)]);
    });

    it("山札が空でも押し出しが成立する", () => {
      const state = buildState({
        stock: [coin(1), coin(1)],
        pending: [coin(2), coin(2)],
        drawPile: [],
      });

      const result = resolvePush(state, 0, 2);

      expect(result.fallenCards).toEqual([coin(1), coin(1)]);
    });
  });

  describe("レーンの厚み", () => {
    it("押し出しの前後でレーンの中身は増えも減りもしない（docs/spec.md §4-3）", () => {
      const state = buildState({
        stock: [coin(1), coin(1), coin(1)],
        pending: [coin(2), coin(2)],
        drawPile: [coin(3), coin(3)],
      });

      const result = resolvePush(state, 0, 2);

      // 3 + 2(押し込み) - 2(落下) = 3
      expect(result.state.lanes[0]?.stock).toHaveLength(3);
    });

    it("何度押し出してもレーンの厚みは変わらない", () => {
      let state = buildState({
        stock: [coin(1), coin(1), coin(1)],
        pending: [coin(2), coin(2), coin(2), coin(2)],
        drawPile: [coin(3), coin(3), coin(3)],
      });

      for (let i = 0; i < 2; i++) {
        state = resolvePush(state, 0, 2).state;
        expect(state.lanes[0]?.stock).toHaveLength(3);
      }
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
        s.discardPile.length +
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

describe("collectFallenCards", () => {
  it("落ちたコインカードの点数を未確定得点に加える（docs/spec.md §4-2）", () => {
    const state = buildState({});

    expect(pendingPointsOf(collectFallenCards(state, [coin(2), coin(3)]))).toBe(5);
  });

  it("落ちたコインカードを山札の底へ戻す（docs/spec.md ルール解釈メモ）", () => {
    const state = buildState({ drawPile: [coin(1)] });

    expect(collectFallenCards(state, [coin(2), coin(3)]).drawPile).toEqual([
      coin(1),
      coin(2),
      coin(3),
    ]);
  });

  it("イベントカードは 0 点で捨て札へ入り、山札へ戻らない（docs/spec.md §6）", () => {
    const state = buildState({ drawPile: [] });
    const event = { kind: "event", event: "avalanche" } as const;

    const next = collectFallenCards(state, [coin(2), event]);

    expect(pendingPointsOf(next)).toBe(2);
    expect(next.drawPile).toEqual([coin(2)]);
    expect(next.discardPile).toEqual([event]);
  });

  it("既存の未確定得点に積み増す", () => {
    const state = withPendingPoints(buildState({}), 4);

    expect(pendingPointsOf(collectFallenCards(state, [coin(3)]))).toBe(7);
  });

  it("手札は増えない（v0.2 で獲得は点数になった）", () => {
    const state = buildState({});

    expect(collectFallenCards(state, [coin(2)]).players[0]?.hand).toEqual([]);
  });

  it("空配列を渡しても壊れない", () => {
    const state = buildState({});

    expect(pendingPointsOf(collectFallenCards(state, []))).toBe(0);
  });

  it("元の状態を変更しない", () => {
    const state = buildState({});

    collectFallenCards(state, [coin(2)]);

    expect(pendingPointsOf(state)).toBe(0);
    expect(state.drawPile).toEqual([]);
  });
});

describe("bankPendingPoints", () => {
  it("未確定得点を手番プレイヤーの得点に加える（docs/spec.md §3）", () => {
    const state = withPendingPoints(buildState({}), 7);

    const next = bankPendingPoints(state);

    expect(next.players[0]?.points).toBe(7);
    expect(pendingPointsOf(next)).toBe(0);
  });

  it("既存の得点に積み増す", () => {
    const base = buildState({});
    const state = {
      ...base,
      players: base.players.map((p, i) => (i === 0 ? { ...p, points: 10, pendingPoints: 4 } : p)),
    };

    expect(bankPendingPoints(state).players[0]?.points).toBe(14);
  });

  it("手番プレイヤー以外の得点は変わらない", () => {
    const state = withPendingPoints(buildState({}), 7);

    expect(bankPendingPoints(state).players[1]?.points).toBe(0);
  });

  it("未確定得点が 0 でも壊れない", () => {
    expect(bankPendingPoints(buildState({})).players[0]?.points).toBe(0);
  });

  it("元の状態を変更しない", () => {
    const state = withPendingPoints(buildState({}), 7);

    bankPendingPoints(state);

    expect(pendingPointsOf(state)).toBe(7);
    expect(state.players[0]?.points).toBe(0);
  });

  it("手番プレイヤーの添字が範囲外なら例外を投げる", () => {
    const state = { ...buildState({}), currentPlayerIndex: 99 };

    expect(() => bankPendingPoints(state)).toThrow(RangeError);
  });
});

describe("bankPendingPoints — 手番終了時のリセット", () => {
  it("「やめる」で投入ラウンド数を戻す（docs/spec.md §3）", () => {
    const state = { ...buildState({}), pendingPoints: 4, insertionRoundsThisTurn: 3 };

    expect(bankPendingPoints(state).insertionRoundsThisTurn).toBe(0);
  });
});

describe("未確定得点をプレイヤーごとに持つ（#88）", () => {
  it("落下分は手番プレイヤーの未確定得点に積み上がり、他のプレイヤーには影響しない", () => {
    const state = buildState({});

    const next = collectFallenCards(state, [coin(3), coin(2)]);

    expect(next.players[0]?.pendingPoints).toBe(5);
    expect(next.players[1]?.pendingPoints).toBe(0);
    expect(next.players[2]?.pendingPoints).toBe(0);
  });

  it("別々のプレイヤーが同時に未確定得点を抱えられる", () => {
    const base = buildState({});

    // A が3点を積んだあと、手番を B に移して B が2点を積む
    const afterA = collectFallenCards(base, [coin(3)]);
    const afterB = collectFallenCards({ ...afterA, currentPlayerIndex: 1 }, [coin(2)]);

    expect(afterB.players[0]?.pendingPoints).toBe(3);
    expect(afterB.players[1]?.pendingPoints).toBe(2);
  });

  it("確定させるのは手番プレイヤーのぶんだけで、他の人の未確定得点は残る", () => {
    const base = buildState({});
    const state = {
      ...base,
      players: base.players.map((p, i) => ({ ...p, pendingPoints: i === 0 ? 7 : 4 })),
    };

    const next = bankPendingPoints(state);

    expect(next.players[0]?.points).toBe(7);
    expect(next.players[0]?.pendingPoints).toBe(0);
    expect(next.players[1]?.points).toBe(0);
    expect(next.players[1]?.pendingPoints).toBe(4);
  });
});
