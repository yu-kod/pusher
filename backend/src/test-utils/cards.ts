import type { Card, CoinCount } from "../game/deck.js";
import type { PendingCard } from "../game/setup.js";

export const coin = (coins: CoinCount): Card => ({ kind: "coin", coins });

/** 裏向きの滞留カードに包む（通常の投入で入るのは裏向き） */
export const faceDown = (cards: readonly Card[]): PendingCard[] =>
  cards.map((card) => ({ card, faceUp: false }));

/** 表向きの滞留カードに包む（「横穴開放」で公開されたあとの状態） */
export const faceUp = (cards: readonly Card[]): PendingCard[] =>
  cards.map((card) => ({ card, faceUp: true }));
