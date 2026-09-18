import { laneName } from "@/lib/rules";
import type { PlayerView, TickPlayerView } from "@/lib/types";

type Props = {
  players: readonly PlayerView[];
  /** 席順に並んだ宣言。`players` と同じ並び */
  tick: readonly TickPlayerView[];
};

/**
 * 公開の拍。全員の宣言を**一斉に**開く（docs/realtime.md §8-1）。
 *
 * 伏せていたものがここで初めて見える。投入先も、降りたことも、同じ瞬間に開く。
 * 片方を先に見せると、遅く決めた人ほど得をする（§8-3）。
 *
 * 見えるのは**どのレーンを狙ったか**まで（docs/spec.md §3 ②）。何を投入したかは
 * 続く解決の拍で1人ずつ出る。盤面はまだ動かない。
 */
export function RevealPanel({ players, tick }: Props) {
  return (
    <section
      aria-label="全員の宣言"
      aria-live="polite"
      className="animate-slide-up absolute inset-x-2 bottom-2 mx-auto flex max-w-md flex-col gap-1 rounded-lg bg-black/75 px-3 py-2 backdrop-blur-[2px]"
    >
      {players.map((player, index) => (
        <div
          key={player.id}
          data-testid="reveal-row"
          className="flex items-center gap-2 text-[13px]"
        >
          <span className="w-20 shrink-0 truncate font-medium">{player.name}</span>
          <Declared declaration={tick[index]?.declaration ?? null} />
        </div>
      ))}
    </section>
  );
}

function Declared({ declaration }: { declaration: TickPlayerView["declaration"] }) {
  if (declaration === null) {
    return <span className="text-emerald-50/50">宣言なし</span>;
  }
  if (declaration.kind === "withdraw") {
    return <span className="rounded bg-white/15 px-1.5 py-0.5 text-[11px] font-bold">降りた</span>;
  }
  return (
    <span className="truncate text-emerald-50/80">
      <span className="font-bold text-amber-200">{laneName(declaration.laneIndex)}</span>{" "}
      レーンへ投入
    </span>
  );
}
