import { describe, expect, it } from "vitest";
import { createDeck, isCoinCard, isEventCard } from "./deck.js";
import { createRng } from "./rng.js";
import { DEFAULT_BALANCE, type Balance } from "./balance.js";
import { setupGame } from "./setup.js";

function buildConfig(overrides?: Partial<Balance>): Balance {
  return { ...DEFAULT_BALANCE, ...overrides };
}

const NAMES_3 = ["Alice", "Bob", "Carol"];
const NAMES_4 = [...NAMES_3, "Dave"];

describe("setupGame", () => {
  describe("レーン", () => {
    it("設定した本数のレーンを作る", () => {
      expect(setupGame(NAMES_4, createRng(1), buildConfig()).lanes).toHaveLength(3);
      expect(setupGame(NAMES_4, createRng(1), buildConfig({ laneCount: 4 })).lanes).toHaveLength(4);
    });

    it("各レーンの奥に 5 枚ずつ配る（docs/spec.md §2）", () => {
      const state = setupGame(NAMES_4, createRng(1), buildConfig());

      for (const lane of state.lanes) {
        expect(lane.stock).toHaveLength(5);
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

    it("得点 0 で始まる（docs/spec.md §2）", () => {
      const state = setupGame(NAMES_4, createRng(1), buildConfig());

      expect(state.players.every((p) => p.points === 0)).toBe(true);
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

    it("ジャックポットの点数は 0 で始まる", () => {
      expect(setupGame(NAMES_4, createRng(1), buildConfig()).jackpotPoints).toBe(0);
    });

    it("未確定得点は 0 で始まる（docs/spec.md §3）", () => {
      expect(setupGame(NAMES_4, createRng(1), buildConfig()).pendingPoints).toBe(0);
    });

    it("捨て札は空で始まる", () => {
      expect(setupGame(NAMES_4, createRng(1), buildConfig()).discardPile).toEqual([]);
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

  describe("滞留エリアの初期配置（docs/spec.md §2）", () => {
    it("各レーンの滞留に initialPendingCards 枚ずつ置く", () => {
      const state = setupGame(NAMES_4, createRng(1), buildConfig());

      expect(state.lanes.map((l) => l.pending.length)).toEqual([5, 5, 5]);
    });

    it("裏向きで置く（中身は誰にも見えない・docs/spec.md §8）", () => {
      const state = setupGame(NAMES_4, createRng(1), buildConfig());

      expect(state.lanes.every((l) => l.pending.every((p) => !p.faceUp))).toBe(true);
    });

    it("0 枚にすれば滞留が空の状態から始まる", () => {
      const config = { ...buildConfig(), initialPendingCards: 0 };

      expect(
        setupGame(NAMES_4, createRng(1), config).lanes.every((l) => l.pending.length === 0)
      ).toBe(true);
    });

    it("奥の山と滞留は別のカードになる", () => {
      const state = setupGame(NAMES_4, createRng(1), buildConfig());
      const lane = state.lanes[0];

      expect(lane?.stock).toHaveLength(5);
      expect(lane?.pending).toHaveLength(5);
    });
  });

  describe("山札", () => {
    it("配った残りが山札になる", () => {
      const config = buildConfig();
      const state = setupGame(NAMES_4, createRng(1), config);

      const dealt =
        config.laneCount * (config.initialLaneCards + config.initialPendingCards) +
        4 * config.initialHandSize;
      expect(state.drawPile).toHaveLength(createDeck(config.deck).length - dealt);
    });

    it("カードが重複も欠落もなくすべて場のどこかにある", () => {
      const config = buildConfig();
      const state = setupGame(NAMES_4, createRng(1), config);

      const all = [
        ...state.drawPile,
        ...state.lanes.flatMap((l) => [...l.stock, ...l.pending.map((p) => p.card)]),
        ...state.players.flatMap((p) => p.hand),
        ...state.discardPile,
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

describe("配布でイベントカードを引き直す（docs/spec.md ルール解釈メモ）", () => {
  /** イベントの比率を上げて、引き直しが必ず起きる状況を作る */
  const eventHeavy = buildConfig({
    deck: { coins: { 1: 60, 2: 0, 3: 0 }, events: { ...DEFAULT_BALANCE.deck.events } },
  });

  it("どのプレイヤーの手札にもイベントカードが入らない", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const state = setupGame(NAMES_4, createRng(seed), DEFAULT_BALANCE);

      expect(state.players.flatMap((p) => p.hand).every(isCoinCard)).toBe(true);
    }
  });

  it("イベントが多いデッキでも手札はコインカードだけになる", () => {
    const state = setupGame(NAMES_4, createRng(1), eventHeavy);

    expect(state.players.flatMap((p) => p.hand).every(isCoinCard)).toBe(true);
  });

  it("引き直したイベントカードは山札に残る（総枚数が変わらない）", () => {
    const config = buildConfig();
    const state = setupGame(NAMES_4, createRng(3), config);

    const all = [
      ...state.drawPile,
      ...state.lanes.flatMap((l) => [...l.stock, ...l.pending.map((p) => p.card)]),
      ...state.players.flatMap((p) => p.hand),
      ...state.discardPile,
    ];

    expect(all).toHaveLength(createDeck(config.deck).length);
  });

  it("レーンにはイベントカードが入りうる（引き直すのは手札だけ）", () => {
    // レーンと滞留は引き直さないので、多数のシードのどこかで必ずイベントが入る
    const inLanes = Array.from({ length: 30 }, (_, i) =>
      setupGame(NAMES_4, createRng(i + 1), DEFAULT_BALANCE).lanes.flatMap((l) => [
        ...l.stock,
        ...l.pending.map((p) => p.card),
      ])
    ).flat();

    expect(inLanes.some(isEventCard)).toBe(true);
  });

  it("配る枚数は変わらない", () => {
    const state = setupGame(NAMES_4, createRng(1), eventHeavy);

    expect(state.players.map((p) => p.hand.length)).toEqual([5, 5, 5, 5]);
  });

  it("コインカードが足りなければ例外を投げる", () => {
    // 総枚数 55 は配布に足りる（50枚）が、コインは 15枚しかない。
    // レーンと滞留に 30枚使ったあと、手札 20枚ぶんのコインは必ず尽きる
    const noCoins = buildConfig({
      deck: {
        coins: { 1: 15, 2: 0, 3: 0 },
        events: { avalanche: 10, openLane: 10, extraSlot: 10, lottery: 10 },
      },
    });

    expect(() => setupGame(NAMES_4, createRng(1), noCoins)).toThrow(/コインカードが足りない/);
  });
});

describe("DEFAULT_BALANCE", () => {
  it("設計書どおりの既定値になっている（docs/spec.md §1 §2 §3）", () => {
    expect(DEFAULT_BALANCE.laneCount).toBe(3);
    expect(DEFAULT_BALANCE.initialLaneCards).toBe(5);
    expect(DEFAULT_BALANCE.initialPendingCards).toBe(5);
    expect(DEFAULT_BALANCE.initialHandSize).toBe(5);
    expect(DEFAULT_BALANCE.handLimit).toBeNull();
    expect(DEFAULT_BALANCE.maxRounds).toBe(13);
  });
});
