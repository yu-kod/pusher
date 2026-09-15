import { PlayingCard } from "./PlayingCard";
import { cardLabel } from "@/lib/cards";
import type { Card } from "@/lib/types";

type Props = {
  card: Card;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
};

/**
 * 手札の1枚。手に持っている感じを出すため、選んだ札は持ち上がる。
 *
 * イベントカードは投入できないので選べない（docs/spec.md ルール解釈メモ）。
 */
export function HandCard({ card, selected, disabled, onSelect }: Props) {
  const playable = card.kind === "coin";

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled || !playable}
      aria-pressed={selected}
      aria-label={cardLabel(card)}
      className={`relative rounded-md transition-transform duration-150 ${
        selected ? "z-10 -translate-y-3 ring-2 ring-amber-300" : "hover:-translate-y-1"
      } disabled:opacity-40 disabled:hover:translate-y-0`}
    >
      <PlayingCard faceUp card={card} />
    </button>
  );
}
