import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { STAGE, fieldOutline, placeCoin, project } from "./projection";
import { pusherFace, type Coin, type PusherState } from "./simulation";
import type { Burst } from "./usePusherTable";

type Props = {
  table: PusherState;
  bursts: Burst[];
  /** いま狙っている投入位置（台の座標） */
  aimX: number;
  onAim: (x: number) => void;
  onDrop: (x: number) => void;
};

/** プッシャー板の前面の厚み */
const PLATE_FACE = 5;
/** キーボードで狙いを動かす1回ぶんの幅 */
const AIM_STEP = 4;
/** 横穴の口が台の外へ開いている幅 */
const HOLE_MOUTH = 11;

/**
 * プッシャー台を描く。
 *
 * ここは表示だけを持つ。何が落ちたか・何点かはシミュレーションが決めており、
 * このコンポーネントは渡された状態をそのまま絵にする。
 */
export function PusherStage({ table, bursts, aimX, onAim, onDrop }: Props) {
  const { config } = table;
  const frameRef = useRef<HTMLDivElement>(null);

  /** ポインタの横位置を台の座標へ移す。奥行きは投入口に固定されている */
  const fieldXFrom = (event: ReactPointerEvent<HTMLDivElement>): number | null => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (rect === undefined || rect.width <= 0) return null;
    const ratio = (event.clientX - rect.left) / rect.width;
    return Math.min(Math.max(ratio, 0), 1) * config.width;
  };

  const face = pusherFace(table.time, config);
  const plateBackLeft = project(0, 0, config);
  const plateBackRight = project(config.width, 0, config);
  const plateFrontLeft = project(0, face, config);
  const plateFrontRight = project(config.width, face, config);
  const plateFaceHeight = PLATE_FACE * plateFrontLeft.scale;

  const holeTop = project(0, config.sideHole.from, config);
  const holeBottom = project(0, config.sideHole.to, config);
  const holeTopRight = project(config.width, config.sideHole.from, config);
  const holeBottomRight = project(config.width, config.sideHole.to, config);

  const aim = project(aimX, config.spawnDepth, config);

  // 奥のコインから描くと、手前のコインが上に重なって奥行きが出る
  const ordered = [...table.coins].sort((a, b) => a.y - b.y);

  return (
    <div
      ref={frameRef}
      role="button"
      tabIndex={0}
      aria-label="コインを投入する台。左右キーで狙いを動かし、Enter で投入します"
      className="relative h-full w-full touch-none select-none"
      onPointerMove={(event) => {
        const x = fieldXFrom(event);
        if (x !== null) onAim(x);
      }}
      onPointerDown={(event) => {
        const x = fieldXFrom(event);
        if (x !== null) onDrop(x);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") onAim(Math.max(aimX - AIM_STEP, 0));
        else if (event.key === "ArrowRight") onAim(Math.min(aimX + AIM_STEP, config.width));
        else if (event.key === "Enter" || event.key === " ") onDrop(aimX);
        else return;
        event.preventDefault();
      }}
    >
      <svg
        viewBox={`0 0 ${STAGE.width} ${STAGE.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="pt-field" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b3a33" />
            <stop offset="55%" stopColor="#10564a" />
            <stop offset="100%" stopColor="#0a2f2a" />
          </linearGradient>
          <linearGradient id="pt-plate" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4b5563" />
            <stop offset="100%" stopColor="#1f2937" />
          </linearGradient>
          <linearGradient id="pt-plate-face" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9ca3af" />
            <stop offset="100%" stopColor="#374151" />
          </linearGradient>
          <radialGradient id="pt-coin" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#fff3c4" />
            <stop offset="45%" stopColor="#f2c14e" />
            <stop offset="100%" stopColor="#a9701a" />
          </radialGradient>
          <linearGradient id="pt-tray" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#000000" />
            <stop offset="60%" stopColor="#111827" />
            <stop offset="100%" stopColor="#1f2937" />
          </linearGradient>
        </defs>

        {/* 台の面 */}
        <polygon points={fieldOutline(config)} fill="url(#pt-field)" />
        <polygon
          points={fieldOutline(config)}
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="0.6"
        />

        {/* 横穴。左右の壁が開いていて、押し出されたコインがジャックポットへ落ちる */}
        <polygon
          data-testid="side-hole"
          points={`${holeTop.x},${holeTop.y} ${holeTop.x - HOLE_MOUTH * holeTop.scale},${holeTop.y} ${holeBottom.x - HOLE_MOUTH * holeBottom.scale},${holeBottom.y} ${holeBottom.x},${holeBottom.y}`}
          fill="#04060b"
          stroke="rgba(248,113,113,0.45)"
          strokeWidth="0.5"
        />
        <polygon
          points={`${holeTopRight.x},${holeTopRight.y} ${holeTopRight.x + HOLE_MOUTH * holeTopRight.scale},${holeTopRight.y} ${holeBottomRight.x + HOLE_MOUTH * holeBottomRight.scale},${holeBottomRight.y} ${holeBottomRight.x},${holeBottomRight.y}`}
          fill="#04060b"
          stroke="rgba(248,113,113,0.45)"
          strokeWidth="0.5"
        />
        <text
          x={(holeTop.x + holeBottom.x) / 2 - 5.5}
          y={(holeTop.y + holeBottom.y) / 2}
          textAnchor="middle"
          fontSize="3.4"
          fill="rgba(252,165,165,0.85)"
          transform={`rotate(-90 ${(holeTop.x + holeBottom.x) / 2 - 5.5} ${(holeTop.y + holeBottom.y) / 2})`}
        >
          横穴
        </text>
        <text
          x={(holeTopRight.x + holeBottomRight.x) / 2 + 5.5}
          y={(holeTopRight.y + holeBottomRight.y) / 2}
          textAnchor="middle"
          fontSize="3.4"
          fill="rgba(252,165,165,0.85)"
          transform={`rotate(90 ${(holeTopRight.x + holeBottomRight.x) / 2 + 5.5} ${(holeTopRight.y + holeBottomRight.y) / 2})`}
        >
          横穴
        </text>

        {/* プッシャー板 */}
        <polygon
          data-testid="pusher"
          points={`${plateBackLeft.x},${plateBackLeft.y} ${plateBackRight.x},${plateBackRight.y} ${plateFrontRight.x},${plateFrontRight.y} ${plateFrontLeft.x},${plateFrontLeft.y}`}
          fill="url(#pt-plate)"
        />
        <polygon
          points={`${plateFrontLeft.x},${plateFrontLeft.y} ${plateFrontRight.x},${plateFrontRight.y} ${plateFrontRight.x},${plateFrontRight.y + plateFaceHeight} ${plateFrontLeft.x},${plateFrontLeft.y + plateFaceHeight}`}
          fill="url(#pt-plate-face)"
        />

        {/* コイン */}
        {ordered.map((coin) => (
          <CoinShape key={coin.id} coin={coin} table={table} />
        ))}

        {/* 落下口と受け皿 */}
        <rect x="4" y={STAGE.frontY} width={STAGE.width - 8} height="3.4" fill="#02040a" rx="1" />
        <rect
          x="7"
          y={STAGE.frontY + 4.6}
          width={STAGE.width - 14}
          height={STAGE.height - STAGE.frontY - 8}
          fill="url(#pt-tray)"
          rx="2.5"
        />
        <rect
          x="7"
          y={STAGE.frontY + 4.6}
          width={STAGE.width - 14}
          height="0.9"
          fill="rgba(253,224,71,0.55)"
        />
        <text
          x={STAGE.width / 2}
          y={STAGE.height - 4.5}
          textAnchor="middle"
          fontSize="3.6"
          fill="rgba(253,224,71,0.45)"
          letterSpacing="1"
        >
          受け皿
        </text>

        {/* 投入位置の目安 */}
        <g data-testid="aim">
          <line
            x1={aim.x}
            y1={STAGE.backY - 6}
            x2={aim.x}
            y2={aim.y}
            stroke="rgba(253,224,71,0.5)"
            strokeWidth="0.5"
            strokeDasharray="2 2"
          />
          <ellipse
            cx={aim.x}
            cy={aim.y}
            rx={config.coinRadius * aim.scale * 1.15}
            ry={config.coinRadius * aim.scale * STAGE.squash * 1.15}
            fill="none"
            stroke="rgba(253,224,71,0.85)"
            strokeWidth="0.7"
          />
          <rect
            x={aim.x - 4}
            y={STAGE.backY - 9}
            width="8"
            height="4"
            rx="1"
            fill="#fde047"
            opacity="0.85"
          />
        </g>
      </svg>

      {/* 得点の吹き出し。SVG の外に出して文字を読みやすくする */}
      {bursts.map((burst) => {
        // 得点は落下口、ジャックポットは横穴。落ちた場所に出す
        const depth =
          burst.kind === "scored" ? config.depth : (config.sideHole.from + config.sideHole.to) / 2;
        const at = project(burst.x, depth, config);
        return (
          <span
            key={`${burst.kind}-${burst.id}`}
            className={`pusher-burst pointer-events-none absolute -translate-x-1/2 text-[13px] font-black drop-shadow ${
              burst.kind === "scored" ? "text-amber-200" : "text-rose-300"
            }`}
            style={{
              left: `${(at.x / STAGE.width) * 100}%`,
              top: `${(at.y / STAGE.height) * 100}%`,
              opacity: Math.min(burst.life * 2.5, 1),
            }}
          >
            {burst.kind === "scored" ? `+${burst.value}` : `JP +${burst.value}`}
          </span>
        );
      })}
    </div>
  );
}

function CoinShape({ coin, table }: { coin: Coin; table: PusherState }) {
  const placed = placeCoin(coin, table.config);
  const rx = table.config.coinRadius * placed.scale;
  const ry = rx * STAGE.squash;
  const thickness = ry * 0.5;

  return (
    <g data-testid="coin" opacity={placed.opacity} transform={`translate(${placed.x} ${placed.y})`}>
      {/* コインの厚み */}
      <ellipse cx="0" cy={thickness} rx={rx} ry={ry} fill="#7c4a0d" />
      <ellipse
        cx="0"
        cy="0"
        rx={rx}
        ry={ry}
        fill="url(#pt-coin)"
        stroke="#8a5a11"
        strokeWidth={rx * 0.08}
      />
      {coin.value > 1 && (
        <text
          x="0"
          y={ry * 0.42}
          textAnchor="middle"
          fontSize={rx * 1.1}
          fontWeight="700"
          fill="#6b3f08"
        >
          {coin.value}
        </text>
      )}
    </g>
  );
}
