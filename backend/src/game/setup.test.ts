import { describe, expect, it } from "vitest";
import { createDeck } from "./deck.js";
import { createRng } from "./rng.js";
import { DEFAULT_GAME_CONFIG, setupGame, type GameConfig } from "./setup.js";

function buildConfig(overrides?: Partial<GameConfig>): GameConfig {
  return { ...DEFAULT_GAME_CONFIG, ...overrides };
}

const NAMES_3 = ["Alice", "Bob", "Carol"];
const NAMES_4 = [...NAMES_3, "Dave"];

describe("setupGame", () => {
  describe("レーン", () => {
    it("設定した本数のレーンを作る", () => {
      expect(setupGame(NAMES_4, createRng(1), buildConfig()).lanes).toHaveLength(4);
      expect(setupGame(NAMES_4, createRng(1), buildConfig({ laneCount: 3 })).lanes).toHaveLength(3);
    });

    it("各レーンの奥に 5 枚ずつ配る（docs/spec.md §2）", () => {
      const state = setupGame(NAMES_4, createRng(1), buildConfig());

      for (const lane of state.lanes) {
        expect(lane.stock).toHaveLength(5);
      }
    });

    it("滞留エリアは空で始まる", () => {
      const state = setupGame(NAMES_4, createRng(1), buildConfig());

      for (const lane of state.lanes) {
        expect(lane.pending).toEqual([]);
      }
    });

    it("増設マーカーは置かれていない", () => {
      const state = setupGame(NAMES_4, createRng(1), buildConfig());

      for (const lane of state.lanes) {
        expect(lane.hasExtraSlot).toBe(false);
      }
    });
  });

  describe("プレイヤー", () => {
    it("渡した名前のぶんだけプレイヤーを作る", () => {
      expect(setupGame(NAMES_3, createRng(1), buildConfig()).players).toHaveLength(3);
      expect(setupGame(NAMES_4, createRng(1), buildConfig()).players).toHaveLength(4);
    });

    it("名前を保持する", () => {
      const state = setupGame(NAMES_4, createRng(1), buildConfig());

      expect(state.players.map((p) => p.name)).toEqual(NAMES_4);
    });

    it("プレイヤーごとに異なる ID を振る", () => {
      const state = setupGame(NAMES_4, createRng(1), buildConfig());

      expect(new Set(state.players.map((p) => p.id)).size).toBe(4);
    });

    it("各プレイヤーに 5 枚ずつ配る（docs/spec.md §2）", () => {
      const state = setupGame(NAMES_4, createRng(1), buildConfig());

      for (const player of state.players) {
        expect(player.hand).toHaveLength(5);
      }
    });
  });

  describe("場", () => {
    it("ジャックポットカウンターを 0 で始める（docs/spec.md §2）", () => {
      expect(setupGame(NAMES_4, createRng(1), buildConfig()).jackpotCounter).toBe(0);
    });

    it("ジャックポットプールは空で始まる", () => {
      expect(setupGame(NAMES_4, createRng(1), buildConfig()).jackpotPool).toEqual([]);
    });

    it("最初の手番は先頭のプレイヤー", () => {
      expect(setupGame(NAMES_4, createRng(1), buildConfig()).currentPlayerIndex).toBe(0);
    });

    it("ラウンド 1 から始まる", () => {
      expect(setupGame(NAMES_4, createRng(1), buildConfig()).round).toBe(1);
    });

    it("横穴を出したプレイヤーはまだいない", () => {
      expect(setupGame(NAMES_4, createRng(1), buildConfig()).lastSideHolePlayerId).toBeNull();
    });

    it("進行中の状態で始まる", () => {
      expect(setupGame(NAMES_4, createRng(1), buildConfig()).phase).toBe("playing");
    });
  });

  describe("山札", () => {
    it("配った残りが山札になる", () => {
      const config = buildConfig();
      const state = setupGame(NAMES_4, createRng(1), config);

      const dealt = 4 * config.initialLaneCards + 4 * config.initialHandSize;
      expect(state.drawPile).toHaveLength(createDeck(config.deck).length - dealt);
    });

    it("カードが重複も欠落もなくすべて場のどこかにある", () => {
      const config = buildConfig();
      const state = setupGame(NAMES_4, createRng(1), config);

      const all = [
        ...state.drawPile,
        ...state.lanes.flatMap((l) => [...l.stock, ...l.pending.map((p) => p.card)]),
        ...state.players.flatMap((p) => p.hand),
        ...state.jackpotPool,
      ];

      const countOf = (cards: typeof all) => {
        const map = new Map<string, number>();
        for (const c of cards) {
          const key = c.kind === "coin" ? `coin-${c.coins}` : `event-${c.event}`;
          map.set(key, (map.get(key) ?? 0) + 1);
        }
        return map;
      };

      expect(countOf(all)).toEqual(countOf(createDeck(config.deck)));
    });
  });

  describe("再現性", () => {
    it("同じシードなら同じ初期状態になる", () => {
      const config = buildConfig();

      expect(setupGame(NAMES_4, createRng(777), config)).toEqual(
        setupGame(NAMES_4, createRng(777), config)
      );
    });

    it("シードが違えば配られるカードが変わる", () => {
      const config = buildConfig();

      expect(setupGame(NAMES_4, createRng(1), config).players[0]?.hand).not.toEqual(
        setupGame(NAMES_4, createRng(2), config).players[0]?.hand
      );
    });

    it("デッキをシャッフルしている（生成順のまま配らない）", () => {
      const config = buildConfig();
      const state = setupGame(NAMES_4, createRng(1), config);

      // 生成順のままなら最初の 5 枚はすべて 1 コイン札になる
      expect(state.lanes[0]?.stock.every((c) => c.kind === "coin" && c.coins === 1)).toBe(false);
    });
  });

  describe("入力の検証", () => {
    it("3 人未満なら例外を投げる（docs/spec.md 3〜4人用）", () => {
      expect(() => setupGame(["Alice", "Bob"], createRng(1), buildConfig())).toThrow(RangeError);
    });

    it("5 人以上なら例外を投げる", () => {
      expect(() => setupGame([...NAMES_4, "Eve"], createRng(1), buildConfig())).toThrow(RangeError);
    });

    it("デッキが配り切れない枚数なら例外を投げる", () => {
      const tiny = buildConfig({
        deck: {
          coins: { 1: 5, 2: 0, 3: 0 },
          events: { avalanche: 0, openLane: 0, extraSlot: 0, lottery: 0 },
        },
      });

      expect(() => setupGame(NAMES_4, createRng(1), tiny)).toThrow(RangeError);
    });
  });
});

describe("DEFAULT_GAME_CONFIG", () => {
  it("設計書どおりの既定値になっている（docs/spec.md §1 §2 §3）", () => {
    expect(DEFAULT_GAME_CONFIG.laneCount).toBe(4);
    expect(DEFAULT_GAME_CONFIG.initialLaneCards).toBe(5);
    expect(DEFAULT_GAME_CONFIG.initialHandSize).toBe(5);
    expect(DEFAULT_GAME_CONFIG.handLimit).toBe(7);
    expect(DEFAULT_GAME_CONFIG.maxRounds).toBe(12);
  });
});
