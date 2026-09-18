import type { TickPhase } from "@/lib/types";

/** ここを切ったら急かす（秒）。締め切りそのものはサーバーが持つ */
const URGENT_FROM = 5;

const PHASE_LABEL: Record<TickPhase, string> = {
  declaring: "宣言",
  revealing: "一斉公開",
  resolving: "解決",
};

const PHASE_HINT: Record<TickPhase, string> = {
  declaring: "レーンと手札を選ぶ、または降りる",
  revealing: "全員の狙いが開く",
  resolving: "先行権の順に1人ずつ",
};

type Props = {
  phase: TickPhase;
  /** 宣言の締め切りまでの残り秒 */
  secondsLeft: number;
  declaredCount: number;
  playerCount: number;
  /** 解決の拍で、いま盤面が動いている人の名前。再生しきったら null */
  resolving: string | null;
};

/**
 * いまどの拍かを常に出しておく帯（docs/realtime.md §8-1）。
 *
 * 同時進行でいちばん心配されるのは「何が起きているか分からなくなること」で、
 * ルール側はそれを「盤面が同時に動く瞬間を作らない」ことで解いている。
 * **画面の側の受け持ちは、その拍を隠さずに出し続けること。**
 * どの拍かを推測させない。
 */
export function TickBanner({ phase, secondsLeft, declaredCount, playerCount, resolving }: Props) {
  const urgent = phase === "declaring" && secondsLeft <= URGENT_FROM;

  return (
    <div
      data-testid="tick-banner"
      data-phase={phase}
      data-urgent={urgent}
      aria-live="polite"
      className={`flex shrink-0 items-center justify-between gap-2 px-3 py-1 text-[12px] transition-colors ${
        urgent ? "bg-red-500/30 text-red-50" : "bg-black/40 text-emerald-50/80"
      }`}
    >
      <span className="flex items-center gap-2">
        <span className="rounded bg-emerald-300 px-1.5 py-0.5 text-[11px] font-bold text-emerald-950">
          {PHASE_LABEL[phase]}
        </span>
        <span className="truncate">{PHASE_HINT[phase]}</span>
      </span>

      {phase === "declaring" && (
        <span className="flex shrink-0 items-center gap-2 tabular-nums">
          <span>
            {declaredCount}/{playerCount}人
          </span>
          <span className={`font-bold ${urgent ? "text-red-100" : "text-amber-200"}`}>
            残り{secondsLeft}秒
          </span>
        </span>
      )}

      {phase === "resolving" && resolving !== null && (
        <span className="shrink-0 font-bold text-amber-200">{resolving}</span>
      )}
    </div>
  );
}
