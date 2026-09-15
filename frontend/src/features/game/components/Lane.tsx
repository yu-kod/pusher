import type { LaneView } from "@/lib/types";

const LANE_NAMES = ["左", "中央", "右"];

type Props = {
  lane: LaneView;
  index: number;
  /** 投入カードを選んでいれば、このレーンへ入れたときの目標値 */
  target: number | null;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
};

/**
 * レーン1本。
 *
 * 滞留の厚みが圧力そのものなので、枚数を数字だけでなく積み重ねでも見せる
 * （docs/spec.md §4-1）。中身は裏向きなので出さない。
 */
export function Lane({ lane, index, target, selected, disabled, onSelect }: Props) {
  // 表向きのカードだけ中身が見える（§6「横穴開放」のあと）
  const revealed = lane.pending.flatMap((p) => (p.faceUp ? [p.card] : []));
  // 目標値6以上なら出目6が横穴になる（§5）
  const risky = target !== null && target >= 6;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${LANE_NAMES[index] ?? String(index)}レーン`}
      className={`flex flex-col items-center gap-2 rounded border-2 px-3 py-4 transition ${
        selected ? "border-gray-900 bg-gray-50" : "border-gray-200"
      } disabled:opacity-60`}
    >
      <span className="text-xs font-medium text-gray-500">{LANE_NAMES[index] ?? index}</span>

      <span className="text-xs text-gray-400">奥 {lane.stockCount}枚</span>

      {/* 滞留の厚みを積み重ねで見せる */}
      <span className="flex flex-col-reverse gap-0.5" aria-hidden="true">
        {lane.pending.map((card, i) => (
          <span
            key={i}
            className={`h-1.5 w-10 rounded-sm ${card.faceUp ? "bg-amber-400" : "bg-gray-400"}`}
          />
        ))}
      </span>
      <span className="text-sm font-medium">滞留 {lane.pending.length}枚</span>

      {revealed.length > 0 && (
        <span className="text-xs text-amber-700">
          公開 {revealed.map((card) => (card.kind === "coin" ? String(card.coins) : "?")).join(" ")}
        </span>
      )}

      {lane.hasExtraSlot && <span className="text-xs text-blue-700">投入口増設</span>}

      {target !== null && (
        <span
          className={`flex flex-col items-center text-sm font-bold ${
            risky ? "text-red-700" : "text-gray-900"
          }`}
        >
          <span className="whitespace-nowrap">目標値 {target}</span>
          {risky && <span className="text-[10px] font-medium">横穴あり</span>}
        </span>
      )}
    </button>
  );
}
