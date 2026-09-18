import { cardLabel } from "@/lib/cards";
import { laneName } from "@/lib/rules";
import { PlayingCard } from "./PlayingCard";
import type { PlayerView } from "@/lib/types";

type Props = {
  players: readonly PlayerView[];
};

/**
 * 公開の拍。全員の宣言を**一斉に**開く（docs/realtime.md §8-1）。
 *
 * 伏せていたものがここで初めて見える。投入先も、降りたことも、同じ瞬間に開く。
 * 片方を先に見せると、遅く決めた人ほど得をする（§8-3）。
 *
 * 盤面はまだ動かない。動くのは次の解決の拍で、そこでは1人ずつしか動かない。
 */
export function RevealPanel({ players }: Props) {
  return (
    <section
      aria-label="全員の宣言"
      aria-live="polite"
      className="animate-slide-up absolute inset-x-2 bottom-2 mx-auto flex max-w-md flex-col gap-1 rounded-lg bg-black/75 px-3 py-2 backdrop-blur-[2px]"
    >
      {players.map((player) => (
        <div
          key={player.id}
          data-testid="reveal-row"
          className="flex items-center gap-2 text-[13px]"
        >
          <span className="w-20 shrink-0 truncate font-medium">{player.name}</span>
          {player.declaration == null ? (
            <span className="text-emerald-50/50">宣言なし</span>
          ) : player.declaration.kind === "withdraw" ? (
            <span className="rounded bg-white/15 px-1.5 py-0.5 text-[11px] font-bold">降りた</span>
          ) : (
            <span className="flex min-w-0 items-center gap-2">
              <PlayingCard faceUp card={player.declaration.card} size="sm" />
              <span className="truncate text-emerald-50/80">
                {laneName(player.declaration.laneIndex)}へ {cardLabel(player.declaration.card)}
              </span>
            </span>
          )}
        </div>
      ))}
    </section>
  );
}
