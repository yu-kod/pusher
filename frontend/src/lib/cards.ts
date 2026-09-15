import type { Card } from "./types";

/** カードの呼び名。手札のボタン名にもレーンの公開札にも使う */
export function cardLabel(card: Card): string {
  return card.kind === "coin" ? `${card.coins}コイン札` : `イベント: ${card.event}`;
}
