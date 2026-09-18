import type { PlayerView } from "@/lib/types";

type Props = {
  players: readonly PlayerView[];
  /** 解決する順に並んだプレイヤー id。サーバーが決める */
  order: readonly string[];
  /** いま盤面が動いている人。解決の拍以外は null */
  movingId: string | null;
  meId: string;
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
export function PriorityRow({ players, order, movingId, meId }: Props) {
  const seats = order
    .map((id) => players.find((player) => player.id === id))
    .filter((player): player is PlayerView => player !== undefined);

  return (
    <div
      aria-label="先行権の順"
      className="flex shrink-0 items-center justify-center gap-1 overflow-hidden bg-black/20 px-2 py-0.5"
    >
      {seats.map((player, rank) => (
        <span
          key={player.id}
          data-testid="priority-seat"
          data-me={player.id === meId}
          data-moving={player.id === movingId}
          className={`flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap transition ${
            player.id === movingId
              ? "bg-amber-300 font-bold text-amber-950"
              : player.id === meId
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
