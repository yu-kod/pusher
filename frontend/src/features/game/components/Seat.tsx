import type { SeatPosition } from "../seating";

/** 束として描く最大枚数。実際の枚数は数字で添える */
const MAX_BACKS = 5;

type Props = {
  name: string;
  points: number;
  handCount: number;
  position: SeatPosition;
  /** この席が手番か */
  current: boolean;
  isMe: boolean;
};

/**
 * 卓を囲むプレイヤー1人ぶんの席。
 *
 * 手札は裏向きの束と枚数だけで、**中身は一切持たない**（`docs/spec.md` §8）。
 * 枚数だけが公開情報なので、それ以上は画面にも渡さない。
 */
export function Seat({ name, points, handCount, position, current, isMe }: Props) {
  const backs = Math.min(handCount, MAX_BACKS);
  const sideways = position === "left" || position === "right";

  return (
    <div
      data-testid="seat"
      aria-label={`${name}の席`}
      data-position={position}
      data-current={current}
      className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 backdrop-blur-[1px] transition ${
        current
          ? "border-amber-300 bg-amber-300/15 shadow-[0_0_0_2px_rgba(252,211,77,0.35)]"
          : "border-white/10 bg-black/35"
      } ${sideways ? "flex-col" : ""}`}
    >
      <span className="flex min-w-0 flex-col items-center leading-tight">
        <span className="flex items-center gap-1">
          <span className="max-w-[7rem] truncate text-[13px] font-medium">{name}</span>
          {isMe && <span className="text-[10px] text-emerald-50/50">あなた</span>}
        </span>
        <span className="text-[15px] font-bold text-amber-200 tabular-nums">{points}点</span>
      </span>

      <span className={`flex items-center gap-1 ${sideways ? "flex-col" : ""}`}>
        {backs > 0 && (
          <span
            className={`relative ${sideways ? "h-[26px] w-[30px]" : "h-[30px] w-[26px]"}`}
            aria-hidden="true"
          >
            {Array.from({ length: backs }, (_, i) => (
              <span
                key={i}
                data-testid="seat-card-back"
                className="card-back absolute h-[26px] w-[18px] rounded-[2px] border border-black/30"
                style={sideways ? { left: i * 3, top: 0 } : { left: i * 2, top: i * 2 }}
              />
            ))}
          </span>
        )}
        <span className="text-[10px] whitespace-nowrap text-emerald-50/55">手札{handCount}</span>
      </span>

      {current && (
        <span className="rounded bg-amber-300 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
          手番
        </span>
      )}
    </div>
  );
}
