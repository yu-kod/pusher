import { pipCells } from "@/lib/dice";

/** 面を3x3のグリッドで描く。セル番号は左上の1から右下の9まで */
const CELLS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

type Props = { value: number; className?: string };

/** 振られた d6。文字ではなく面として見せる（docs/spec.md §1） */
export function Die({ value, className = "" }: Props) {
  const pips = pipCells(value);

  return (
    <span
      role="img"
      aria-label={`出目 ${value}`}
      className={`inline-grid h-11 w-11 shrink-0 grid-cols-3 grid-rows-3 place-items-center rounded-lg border border-black/20 bg-[#fdfaf3] p-1 shadow-[0_2px_4px_rgba(0,0,0,0.4)] ${className}`}
    >
      {CELLS.map((cell) => (
        <span
          key={cell}
          className={`h-1.5 w-1.5 rounded-full ${pips.includes(cell) ? "bg-stone-900" : ""}`}
        />
      ))}
    </span>
  );
}
