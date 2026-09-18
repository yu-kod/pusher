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

/**
 * ボール札（`docs/turn-structure.md` §4-3）。
 *
 * **デッキには入らない。** レーンの奥の山にだけ1枚ずつ置かれ、落ちたらその場で
 * 入れ替わる。手札にも山札にも捨て札にも現れないので、`createDeck` は関わらない。
 *
 * 得点は `balance.ballPoints` が持つ。カードに刻むと、調整のたびに場の全カードを
 * 書き換えることになる。
 */
export type BallCard = { kind: "ball" };

/**
 * 山札・手札・捨て札に入りうるカード。
 *
 * ボール札は含まれない。**レーンの中にしか存在しない**ので、山札から引かれることも
 * 手札に来ることもない。型で言い切っておけば、引いたカードを分岐するたびに
 * 「ボール札だったら」を考えずに済む。
 */
export type DeckCard = CoinCard | EventCard;

/** 場に存在しうるカード全部。レーンの中だけボール札が混ざる */
export type Card = DeckCard | BallCard;

export function isCoinCard(card: Card): card is CoinCard {
  return card.kind === "coin";
}

export function isEventCard(card: Card): card is EventCard {
  return card.kind === "event";
}

export function isBallCard(card: Card): card is BallCard {
  return card.kind === "ball";
}

/** 山札へ戻せるカードか（ボール札はレーンの中にしか存在しない） */
export function isDeckCard(card: Card): card is DeckCard {
  return !isBallCard(card);
}

export const ball = (): BallCard => ({ kind: "ball" });

/** デッキに何をどれだけ入れるか */
export type DeckConfig = {
  coins: Record<CoinCount, number>;
  events: Record<EventKind, number>;
};

/**
 * デッキ構成の既定値（暫定）。
 *
 * 総枚数 90 枚（docs/spec.md §1）。
 * ポイント制により落下カードが山札へ戻るため、場に出ている枚数
 * （レーン 3×5 + 滞留 3×5 + 手札 4×5 = 50枚）の約2倍で足りる。
 *
 * - イベント 14 枚（全体の約 15%）。4種に 4/4/3/3
 * - コイン 76 枚（コイン札の中で 46.1 / 39.5 / 14.5）
 *
 * 3コイン札の比率は #53 のシミュレーションで 25% → 14.5% に下げた。
 * デッキの平均点が下がることで投入1枚あたりの回収が抑えられ、滞留も育ちやすくなる
 * （§7 次点「必要なら3コイン札の比率を15%まで下げる」）。
 * → プリセット coin3Ratio25 で以前の構成に戻せる。
 */
export const DEFAULT_DECK_CONFIG: DeckConfig = {
  coins: { 1: 40, 2: 35, 3: 13 },
  events: { avalanche: 5, openLane: 5, extraSlot: 3, lottery: 3 },
};

/**
 * v0.2 のデッキ90枚（`docs/spec.md` §1「v0.2 の 90枚から14枚増やした」）。
 *
 * 比率は v0.3 と同じで、増やしたぶんはレーンを深くするために使っている。
 * §9 の段階測定を回し直すときの土台として残してある。
 */
export const DECK_CONFIG_V02: DeckConfig = {
  coins: { 1: 35, 2: 30, 3: 11 },
  events: { avalanche: 4, openLane: 4, extraSlot: 3, lottery: 3 },
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
export function createDeck(config: DeckConfig): DeckCard[] {
  const deck: DeckCard[] = [];

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
