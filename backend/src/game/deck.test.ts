import { describe, expect, it } from "vitest";
import {
  DECK_CONFIG_V02,
  DEFAULT_DECK_CONFIG,
  EVENT_KINDS,
  createDeck,
  isCoinCard,
  isEventCard,
  type DeckConfig,
} from "./deck.js";

/** テスト用の小さなデッキ設定 */
function buildConfig(overrides?: Partial<DeckConfig>): DeckConfig {
  return {
    coins: { 1: 2, 2: 1, 3: 1 },
    events: { avalanche: 1, openLane: 1, extraSlot: 0, lottery: 0 },
    ...overrides,
  };
}

describe("createDeck", () => {
  it("設定した枚数ぶんのコインカードを含む", () => {
    const deck = createDeck(buildConfig());

    const coins = deck.filter(isCoinCard);
    expect(coins.filter((c) => c.coins === 1)).toHaveLength(2);
    expect(coins.filter((c) => c.coins === 2)).toHaveLength(1);
    expect(coins.filter((c) => c.coins === 3)).toHaveLength(1);
  });

  it("設定した枚数ぶんのイベントカードを含む", () => {
    const deck = createDeck(buildConfig());

    const events = deck.filter(isEventCard);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.event).sort()).toEqual(["avalanche", "openLane"]);
  });

  it("総枚数が設定の合計と一致する", () => {
    expect(createDeck(buildConfig())).toHaveLength(6);
  });

  it("枚数 0 の種別は1枚も含まない", () => {
    const deck = createDeck(buildConfig({ coins: { 1: 0, 2: 0, 3: 3 } }));

    expect(deck.filter(isCoinCard).every((c) => c.coins === 3)).toBe(true);
    expect(deck.filter(isCoinCard)).toHaveLength(3);
  });

  it("シャッフルしない（呼び出し側が Rng で行う）", () => {
    const a = createDeck(buildConfig());
    const b = createDeck(buildConfig());

    expect(a).toEqual(b);
  });

  it("負の枚数を指定すると例外を投げる", () => {
    expect(() => createDeck(buildConfig({ coins: { 1: -1, 2: 0, 3: 0 } }))).toThrow(RangeError);
    expect(() =>
      createDeck(buildConfig({ events: { avalanche: -1, openLane: 0, extraSlot: 0, lottery: 0 } }))
    ).toThrow(RangeError);
  });

  it("整数でない枚数を指定すると例外を投げる", () => {
    expect(() => createDeck(buildConfig({ coins: { 1: 1.5, 2: 0, 3: 0 } }))).toThrow(RangeError);
  });
});

describe("DEFAULT_DECK_CONFIG", () => {
  const deck = createDeck(DEFAULT_DECK_CONFIG);

  it("総枚数が 104 枚になる（docs/spec.md §1）", () => {
    expect(deck).toHaveLength(104);
  });

  it("イベントカードがデッキ全体の約 15% を占める（docs/spec.md §1）", () => {
    expect(deck.filter(isEventCard)).toHaveLength(16);
    expect(deck.filter(isEventCard).length / deck.length).toBeCloseTo(0.15, 1);
  });

  it("イベント4種をすべて含む", () => {
    const events = deck.filter(isEventCard);

    for (const kind of EVENT_KINDS) {
      expect(events.filter((e) => e.event === kind).length).toBeGreaterThan(0);
    }
  });

  it("コインカードの構成比が 46 / 39 / 15 に近い（docs/spec.md §1）", () => {
    const coins = deck.filter(isCoinCard);
    expect(coins).toHaveLength(88);

    // 3コイン札は #53 のシミュレーションで 25% → 15% に下げた
    const ratio = (n: 1 | 2 | 3) => coins.filter((c) => c.coins === n).length / coins.length;
    expect(ratio(1)).toBeCloseTo(0.46, 1);
    expect(ratio(2)).toBeCloseTo(0.39, 1);
    expect(ratio(3)).toBeCloseTo(0.15, 1);
  });

  it("セットアップで配りきってもまだ山札が残る（docs/spec.md §1）", () => {
    // v0.3 で場に出るのは レーン 3×12 + 滞留 3×9 + 手札 (5+6+7+8) = 89 枚
    // （ボール札はデッキに入らない）。v0.2 の「場に出る枚数の2倍」は、レーンを
    // 深くしたぶん場に留まるカードが増えたので満たせなくなった。深さの代償として
    // 受け入れている。落下カードは山札へ戻り、尽きたら捨て札を混ぜ直す（§3）ので、
    // 必要なのは「配りきれること」であって2倍の余裕ではない
    const onTable = 3 * 12 + 3 * 9 + (5 + 6 + 7 + 8);

    expect(deck.length).toBeGreaterThan(onTable);
  });
});

describe("DECK_CONFIG_V02", () => {
  it("v0.2 の90枚のまま残してある（§9 の段階測定を回し直すため）", () => {
    const v02 = createDeck(DECK_CONFIG_V02);

    expect(v02).toHaveLength(90);
    expect(v02.filter(isEventCard)).toHaveLength(14);
  });
});

describe("型ガード", () => {
  it("isCoinCard はコインカードだけを true にする", () => {
    expect(isCoinCard({ kind: "coin", coins: 2 })).toBe(true);
    expect(isCoinCard({ kind: "event", event: "avalanche" })).toBe(false);
  });

  it("isEventCard はイベントカードだけを true にする", () => {
    expect(isEventCard({ kind: "event", event: "avalanche" })).toBe(true);
    expect(isEventCard({ kind: "coin", coins: 2 })).toBe(false);
  });
});
