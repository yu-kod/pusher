/**
 * カードとデッキ。
 *
 * 枚数・構成比はすべて docs/spec.md §1 とルール解釈メモに基づく暫定値で、
 * シミュレーション（#13）で調整する前提。マジックナンバーを散らさず
 * DEFAULT_DECK_CONFIG に集約する。
 */

/** コインカードに印字されたコイン数。目標値・押し込み枚数・得点を兼ねる（§1） */
export type CoinCount = 1 | 2 | 3;

/** イベントカードの種類（§6） */
export const EVENT_KINDS = [
  /** なだれ */
  "avalanche",
  /** 横穴開放 */
  "openLane",
  /** 投入口増設 */
  "extraSlot",
  /** 抽選抽選 */
  "lottery",
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export type CoinCard = { kind: "coin"; coins: CoinCount };
export type EventCard = { kind: "event"; event: EventKind };
export type Card = CoinCard | EventCard;

export function isCoinCard(card: Card): card is CoinCard {
  return card.kind === "coin";
}

export function isEventCard(card: Card): card is EventCard {
  return card.kind === "event";
}

/** デッキに何をどれだけ入れるか */
export type DeckConfig = {
  coins: Record<CoinCount, number>;
  events: Record<EventKind, number>;
};

/**
 * デッキ構成の既定値（暫定）。
 *
 * 総枚数 200 枚。内訳の根拠は docs/spec.md の「ルール解釈メモ」を参照。
 * - イベント 30 枚（全体の 15%。§1 の比率を優先し、§6 の「各2枚」は物理プロトタイプ向けと解釈）
 * - コイン 170 枚（コイン札の中で 40 / 35 / 25。端数は2コイン札へ寄せた）
 */
export const DEFAULT_DECK_CONFIG: DeckConfig = {
  coins: { 1: 68, 2: 60, 3: 42 },
  events: { avalanche: 8, openLane: 8, extraSlot: 7, lottery: 7 },
};

function assertCount(count: number, label: string): void {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`${label} の枚数は 0 以上の整数である必要がある: ${count}`);
  }
}

/**
 * 設定どおりのデッキを作る。
 *
 * シャッフルはしない。呼び出し側が Rng で行う（エンジンに乱数を持ち込まないため）。
 */
export function createDeck(config: DeckConfig): Card[] {
  const deck: Card[] = [];

  for (const coins of [1, 2, 3] as const) {
    const count = config.coins[coins];
    assertCount(count, `${coins}コイン札`);
    for (let i = 0; i < count; i++) {
      deck.push({ kind: "coin", coins });
    }
  }

  for (const event of EVENT_KINDS) {
    const count = config.events[event];
    assertCount(count, `イベント(${event})`);
    for (let i = 0; i < count; i++) {
      deck.push({ kind: "event", event });
    }
  }

  return deck;
}
