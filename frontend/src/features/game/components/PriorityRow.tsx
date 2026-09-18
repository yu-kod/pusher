import type { PlayerView } from "@/lib/types";

type Props = {
  players: readonly PlayerView[];
  /** 解決する順に並んだ席の添字。サーバーが決める */
  order: readonly number[];
  /** いま盤面が動いている席。解決の拍以外は null */
  movingIndex: number | null;
  meIndex: number;
};

/**
 * 先行権の列（`docs/spec.md` v0.3）。卓上のプレイヤーカードの列にあたる。
 *
 * **順位はここで計算しない。** 誰が何番目かを決めるのは先行権のルールで、
 * サーバーが持っている（`backend/src/game/priority.ts`）。画面は受け取った順に並べるだけ。
 *
 * 常に出しておく。いちばん要るのは宣言の拍で、「いま降りれば次は何番目か」
 * 「あと1枚のレーンに自分より先に手が届くのは誰か」が読めないと、
 * 早く降りることの値段が分からない。
 */
export function PriorityRow({ players, order, movingIndex, meIndex }: Props) {
  const seats = order.flatMap((index) => {
    const player = players[index];
    return player === undefined ? [] : [{ player, index }];
  });

  return (
    <div
      aria-label="先行権の順"
      className="flex shrink-0 items-center justify-center gap-1 overflow-hidden bg-black/20 px-2 py-0.5"
    >
      {seats.map(({ player, index }, rank) => (
        <span
          key={player.id}
          data-testid="priority-seat"
          data-me={index === meIndex}
          data-moving={index === movingIndex}
          className={`flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap transition ${
            index === movingIndex
              ? "bg-amber-300 font-bold text-amber-950"
              : index === meIndex
                ? "bg-white/15 text-emerald-50"
                : "text-emerald-50/60"
          }`}
        >
          <span className="text-[9px] opacity-70 tabular-nums">{rank + 1}</span>
          <span className="truncate">{player.name}</span>
        </span>
      ))}
    </div>
  );
}
