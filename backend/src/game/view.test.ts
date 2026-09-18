import { describe, expect, it } from "vitest";
import { coin, faceDown, faceUp } from "../test-utils/cards.js";
import { DEFAULT_BALANCE, withPreset } from "./balance.js";
import { createRng } from "./rng.js";
import { setupGame, type GameState } from "./setup.js";
import { splitOverrides, withPendingPoints, type StateOverrides } from "../test-utils/state.js";
import { viewFor } from "./view.js";

function buildState(overrides?: StateOverrides): GameState {
  const { pendingPoints, rest } = splitOverrides(overrides);
  const base = setupGame(["A", "B", "C"], createRng(1), DEFAULT_BALANCE);
  return withPendingPoints({ ...base, ...rest }, pendingPoints);
}

/** ビューを JSON にして、カードのコイン数が現れるかを見る */
function jsonOf(value: unknown): string {
  return JSON.stringify(value);
}

describe("viewFor（クライアントへ返す状態・docs/spec.md §8）", () => {
  describe("レーン", () => {
    it("奥の山は枚数だけを返し、中身は返さない", () => {
      const base = buildState();
      const state = {
        ...base,
        lanes: base.lanes.map((lane) => ({ ...lane, stock: [coin(3), coin(3), coin(3)] })),
      };

      const view = viewFor(state, "p1");

      expect(view.lanes[0]?.stockCount).toBe(3);
      expect(jsonOf(view.lanes)).not.toContain('"coins":3');
    });

    it("裏向きの滞留は枚数だけを返す", () => {
      const base = buildState();
      const state = {
        ...base,
        lanes: base.lanes.map((lane) => ({ ...lane, pending: faceDown([coin(2), coin(3)]) })),
      };

      const view = viewFor(state, "p1");

      expect(view.lanes[0]?.pending).toEqual([{ faceUp: false }, { faceUp: false }]);
    });

    it("「横穴開放」で公開された滞留は中身を返す（docs/spec.md §6）", () => {
      const base = buildState();
      const state = {
        ...base,
        lanes: base.lanes.map((lane, i) =>
          i === 0 ? { ...lane, pending: faceUp([coin(2), coin(3)]) } : lane
        ),
      };

      const view = viewFor(state, "p1");

      expect(view.lanes[0]?.pending).toEqual([
        { faceUp: true, card: coin(2) },
        { faceUp: true, card: coin(3) },
      ]);
    });

    it("表向きと裏向きが混ざっていても正しく分ける", () => {
      const base = buildState();
      const state = {
        ...base,
        lanes: base.lanes.map((lane, i) =>
          i === 0 ? { ...lane, pending: [...faceUp([coin(2)]), ...faceDown([coin(3)])] } : lane
        ),
      };

      expect(viewFor(state, "p1").lanes[0]?.pending).toEqual([
        { faceUp: true, card: coin(2) },
        { faceUp: false },
      ]);
    });

    it("増設マーカーは公開情報として返す（docs/spec.md §6）", () => {
      const base = buildState();
      const state = {
        ...base,
        lanes: base.lanes.map((lane, i) => (i === 1 ? { ...lane, hasExtraSlot: true } : lane)),
      };

      expect(viewFor(state, "p1").lanes.map((l) => l.hasExtraSlot)).toEqual([false, true, false]);
    });
  });

  describe("手札", () => {
    it("自分の手札は中身が見える", () => {
      const base = buildState();
      const state = {
        ...base,
        players: base.players.map((p, i) => (i === 0 ? { ...p, hand: [coin(3), coin(1)] } : p)),
      };

      const view = viewFor(state, "p1");

      expect(view.players[0]?.hand).toEqual({ owner: true, cards: [coin(3), coin(1)] });
    });

    it("他プレイヤーの手札は枚数だけを返す", () => {
      const base = buildState();
      const state = {
        ...base,
        players: base.players.map((p, i) => (i === 1 ? { ...p, hand: [coin(3), coin(1)] } : p)),
      };

      const view = viewFor(state, "p1");

      expect(view.players[1]?.hand).toEqual({ owner: false, count: 2 });
    });

    it("誰向けのビューかによって見える手札が変わる", () => {
      const base = buildState();
      const state = {
        ...base,
        players: base.players.map((p, i) =>
          i === 1 ? { ...p, hand: [coin(3)] } : { ...p, hand: [] }
        ),
      };

      expect(viewFor(state, "p1").players[1]?.hand).toEqual({ owner: false, count: 1 });
      expect(viewFor(state, "p2").players[1]?.hand).toEqual({ owner: true, cards: [coin(3)] });
    });

    it("誰向けのビューかを型に含める", () => {
      expect(viewFor(buildState(), "p2").viewerId).toBe("p2");
    });

    it("卓にいないプレイヤー向けなら誰の手札も見えない（観戦者）", () => {
      const base = buildState();
      const state = {
        ...base,
        players: base.players.map((p) => ({ ...p, hand: [coin(3)] })),
      };

      const view = viewFor(state, "unknown");

      expect(view.players.every((p) => p.hand.owner === false)).toBe(true);
    });
  });

  describe("公開情報", () => {
    it("得点・ジャックポット・カウンターをそのまま返す", () => {
      const base = buildState({ jackpotPoints: 12, jackpotCounter: 3, pendingPoints: 4 });
      const state = { ...base, players: base.players.map((p) => ({ ...p, points: 7 })) };

      const view = viewFor(state, "p1");

      expect(view.players.map((p) => p.points)).toEqual([7, 7, 7]);
      expect(view.jackpotPoints).toBe(12);
      expect(view.jackpotCounter).toBe(3);
      expect(view.pendingPoints).toBe(4);
    });

    it("手番・ラウンド・スタートプレイヤーを返す", () => {
      const state = buildState({ currentPlayerIndex: 2, startPlayerIndex: 1, round: 4 });

      const view = viewFor(state, "p1");

      expect(view.currentPlayerIndex).toBe(2);
      expect(view.startPlayerIndex).toBe(1);
      expect(view.round).toBe(4);
      expect(view.phase).toBe("playing");
    });

    it("プレイヤーの id と名前を返す", () => {
      const view = viewFor(buildState(), "p1");

      expect(view.players.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
      expect(view.players.map((p) => p.name)).toEqual(["A", "B", "C"]);
    });
  });

  describe("山札と捨て札", () => {
    it("枚数だけを返し、中身は返さない", () => {
      const state = buildState({
        drawPile: [coin(3), coin(3)],
        discardPile: [{ kind: "event", event: "avalanche" }],
      });

      const view = viewFor(state, "p1");

      expect(view.drawPileCount).toBe(2);
      expect(view.discardPileCount).toBe(1);
      expect(jsonOf(view)).not.toContain("avalanche");
    });
  });

  describe("ルール", () => {
    it("表示に必要な調整値だけを返す", () => {
      const view = viewFor(buildState(), "p1");

      expect(view.rules).toEqual({
        laneCount: DEFAULT_BALANCE.laneCount,
        maxLanesPerRound: DEFAULT_BALANCE.maxLanesPerRound,
        maxRounds: DEFAULT_BALANCE.maxRounds,
        jackpotThreshold: DEFAULT_BALANCE.jackpotThreshold,
        sideHole: DEFAULT_BALANCE.sideHole,
      });
    });

    it("デッキ構成や押し込み枚数の式は返さない", () => {
      const json = jsonOf(viewFor(buildState(), "p1"));

      expect(json).not.toContain("deck");
      expect(json).not.toContain("pushCount");
    });
  });

  describe("裏向き情報が漏れていないこと（docs/spec.md §8）", () => {
    it("ビューを JSON 化しても、裏向きのカードの中身は現れない", () => {
      // 場のすべてのカードを 3コイン札にし、公開されうる場所からは取り除く
      const base = buildState();
      const state: GameState = {
        ...base,
        lanes: base.lanes.map((lane) => ({
          ...lane,
          stock: [coin(3), coin(3)],
          pending: faceDown([coin(3)]),
        })),
        players: base.players.map((p, i) => ({ ...p, hand: i === 0 ? [] : [coin(3)] })),
        drawPile: [coin(3)],
        discardPile: [coin(3)],
      };

      // 自分の手札は空なので、3コイン札はどこにも現れてはいけない
      expect(jsonOf(viewFor(state, "p1"))).not.toContain('"coins":3');
    });

    it("ビューは JSON 化できる（関数を含まない）", () => {
      const view = viewFor(buildState(), "p1");

      expect(() => JSON.stringify(view)).not.toThrow();
      expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    });
  });
});

describe("ボール札の位置（docs/turn-structure.md §4-3）", () => {
  it("奥の山で唯一の公開情報として出す", () => {
    const state = setupGame(["A", "B", "C"], createRng(1), withPreset("ballCards"));

    const view = viewFor(state, "p1");

    // いちばん奥に置かれるので、レーンの厚みぶん押し込まないと落ちない
    expect(view.lanes[0]?.ballIndex).toBe(DEFAULT_BALANCE.initialLaneCards);
  });

  it("ボール札を使わない設定では null", () => {
    const state = setupGame(["A", "B", "C"], createRng(1), DEFAULT_BALANCE);

    expect(viewFor(state, "p1").lanes.every((lane) => lane.ballIndex === null)).toBe(true);
  });

  it("中身までは見せない（枚数とボール札の位置だけ）", () => {
    const state = setupGame(["A", "B", "C"], createRng(1), withPreset("ballCards"));

    const lane = viewFor(state, "p1").lanes[0];

    expect(Object.keys(lane ?? {}).sort()).toEqual(
      ["ballIndex", "hasExtraSlot", "pending", "stockCount"].sort()
    );
  });
});
