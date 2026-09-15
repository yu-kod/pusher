import type { Card } from "@/lib/types";

type Props = {
  card: Card;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
};

/** 手札の1枚。イベントカードは投入できないので選べない（docs/spec.md ルール解釈メモ） */
export function HandCard({ card, selected, disabled, onSelect }: Props) {
  const playable = card.kind === "coin";

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled || !playable}
      aria-pressed={selected}
      aria-label={playable ? `${card.coins}コイン札` : `イベント: ${card.event}`}
      className={`flex h-20 w-14 flex-col items-center justify-center rounded border-2 ${
        selected ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300"
      } disabled:opacity-40`}
    >
      {playable ? (
        <>
          <span className="text-2xl font-bold">{card.coins}</span>
          <span className="text-[10px]">コイン</span>
        </>
      ) : (
        <span className="text-[10px]">イベント</span>
      )}
    </button>
  );
}
