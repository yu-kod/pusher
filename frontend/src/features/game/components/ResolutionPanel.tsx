import { laneName } from "@/lib/rules";
import { Die } from "./Die";
import type { ResolutionStepView } from "@/lib/types";

type Props = {
  step: ResolutionStepView;
  /** いま動いている人の名前 */
  name: string;
};

/**
 * 解決の拍の1歩ぶん（docs/realtime.md §8-5）。
 *
 * **出すのは常に1人ぶんだけ。** 全員の解決はもう届いているが、まとめて見せると
 * 「盤面が同時に動く瞬間を作らない」というルール側の解決（docs/turn-structure.md §4-6）が
 * 画面の上で崩れる。誰の番で何が起きたのかを1歩ずつ読ませる。
 */
export function ResolutionPanel({ step, name }: Props) {
  return (
    <section
      data-testid="resolution-step"
      aria-live="polite"
      className="animate-slide-up absolute inset-x-2 bottom-2 mx-auto flex max-w-md items-center gap-3 rounded-lg bg-black/75 px-3 py-2 text-sm backdrop-blur-[2px]"
    >
      <Die value={step.roll} className="animate-die-roll" />

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="truncate font-bold text-amber-200">{name}</span>
          <span className="text-emerald-50/70">{laneName(step.laneIndex)}レーン</span>
        </p>
        <p className="mt-1 text-[12px] text-emerald-50/70">
          押し込み {step.pushedCount}枚 / 落下 {step.droppedCount}枚
        </p>
      </div>

      {step.sideHole ? (
        <span className="shrink-0 rounded bg-red-300 px-1.5 py-0.5 text-[12px] font-bold text-red-950">
          横穴
        </span>
      ) : (
        <span className="shrink-0 font-bold text-amber-200">{step.gainedPoints}点</span>
      )}
    </section>
  );
}
