/**
 * 得点の計算（docs/spec.md §4-2）。
 *
 * v0.2 でカードは得点そのものではなくなり、落下したカードに印字された
 * コイン数が点数として記録される。カードは山札へ戻る。
 */
import { isCoinCard, type Card } from "./deck.js";

/** カード1枚の点数。イベントカードはコイン数が印字されていないので 0 点 */
export function cardPoints(card: Card): number {
  return isCoinCard(card) ? card.coins : 0;
}

/** カードの点数を合計する */
export function totalPoints(cards: readonly Card[]): number {
  return cards.reduce((sum, card) => sum + cardPoints(card), 0);
}
