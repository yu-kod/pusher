import type { LaneView } from "@/lib/types";
import { PlayingCard } from "./PlayingCard";
import { cardLabel } from "@/lib/cards";

const LANE_NAMES = ["左", "中央", "右"];

/** 奥の山として描く最大枚数。実際の枚数は数字で添える */
const MAX_STOCK_CARDS = 4;
/** 滞留エリアで重ねたカードをずらす量（px） */
const STACK_OFFSET = 9;
/** 奥の山で重ねたカードをずらす量（px）。厚みだけ見せたいので小さく */
const STOCK_OFFSET = 3;
/** 小サイズのカードの高さ（px）。PlayingCard の size="sm" に合わせる */
const SMALL_CARD_HEIGHT = 56;

type Props = {
  lane: LaneView;
  index: number;
  /** 投入カードを選んでいれば、このレーンへ入れたときの目標値 */
  target: number | null;
  /** このレーンだけが横穴になりうるか（レーンごとに危険度が違う設定のときだけ true） */
  risky: boolean;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
};

/**
 * レーン1本を、机に置かれたトレイとして描く。
 *
 * 上から順に `[奥：山] → [滞留エリア] → [末端：落下口]`（docs/spec.md §1）。
 * 滞留の厚みが圧力そのものなので、枚数を数字だけでなくカードの重なりでも
 * 見せる（§4-1）。中身は裏向きなので持たない。
 */
export function Lane({ lane, index, target, risky, selected, disabled, onSelect }: Props) {
  const name = LANE_NAMES[index] ?? String(index);
  const stockCards = Math.min(lane.stockCount, MAX_STOCK_CARDS);
  const pendingHeight = SMALL_CARD_HEIGHT + Math.max(lane.pending.length - 1, 0) * STACK_OFFSET;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${name}レーン`}
      className={`lane-tray flex flex-col items-center gap-1 rounded-lg border-2 px-1.5 pt-1.5 pb-2 transition ${
        selected
          ? "-translate-y-0.5 border-amber-300 ring-2 ring-amber-300/60"
          : "border-black/40 hover:border-amber-200/40"
      } disabled:opacity-70`}
    >
      <span className="text-[11px] font-bold tracking-wider text-emerald-50/80">{name}</span>

      {/* 奥の山（裏向き）。枚数が多いほど厚く見える */}
      <span
        className="relative w-[40px]"
        style={{ height: SMALL_CARD_HEIGHT + (stockCards - 1) * STOCK_OFFSET }}
        aria-hidden="true"
      >
        {Array.from({ length: stockCards }, (_, i) => (
          <PlayingCard
            key={i}
            faceUp={false}
            size="sm"
            className="absolute left-0"
            style={{ top: i * STOCK_OFFSET }}
          />
        ))}
      </span>
      <span className="text-[10px] text-emerald-50/50">奥 {lane.stockCount}枚</span>

      {/* 滞留エリア。上が奥（先に押し込まれる側）、下が落下口に近い側 */}
      <span className="relative w-[30px] rounded-sm bg-black/25" style={{ height: pendingHeight }}>
        {lane.pending.map((entry, i) =>
          entry.faceUp ? (
            <PlayingCard
              key={i}
              faceUp
              card={entry.card}
              label={cardLabel(entry.card)}
              size="sm"
              className="animate-card-drop absolute left-0"
              style={{ top: i * STACK_OFFSET }}
            />
          ) : (
            <PlayingCard
              key={i}
              faceUp={false}
              size="sm"
              className="animate-card-drop absolute left-0"
              style={{ top: i * STACK_OFFSET }}
            />
          )
        )}
      </span>
      <span className="text-[11px] font-medium text-emerald-50">滞留 {lane.pending.length}枚</span>

      {/* 末端の落下口 */}
      <span className="lane-chute h-2.5 w-[46px] rounded-sm" aria-hidden="true" />
      <span className="text-[10px] text-emerald-50/50">落下口</span>

      {lane.hasExtraSlot && (
        <span className="rounded bg-sky-200 px-1 text-[10px] font-bold text-sky-900">
          投入口増設
        </span>
      )}

      {target !== null && (
        <span
          className={`mt-0.5 flex flex-col items-center rounded px-1 py-0.5 text-[11px] font-bold ${
            risky ? "bg-red-200 text-red-900" : "bg-amber-200 text-amber-950"
          }`}
        >
          <span className="whitespace-nowrap">目標値 {target}</span>
          {risky && <span className="text-[9px] font-medium">横穴あり</span>}
        </span>
      )}
    </button>
  );
}
