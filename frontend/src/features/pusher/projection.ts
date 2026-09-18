import type { Coin, PusherConfig } from "./simulation";

/**
 * シミュレーションの座標を、画面に描く座標へ変換する。
 *
 * 台を斜め上から見ている絵にしたいが、CSS の 3D 変換を掛けると、タップ位置から
 * 投入位置を逆算するのが面倒になる。奥行きを「奥ほど狭い台形」として SVG の中で
 * 作れば、左右の対応は最後まで一次式のままでいられる。
 *
 * ここも I/O を持たない純粋関数にしてある。
 */

/** 画面側の寸法。見た目の調整はここだけを触る */
export const STAGE = {
  /** viewBox の幅。台の手前の辺がちょうどこの幅になる */
  width: 100,
  /** viewBox の高さ */
  height: 164,
  /** 台の奥の辺の y */
  backY: 10,
  /** 台の手前の辺（落下口）の y */
  frontY: 126,
  /** 奥の辺の幅。手前を 1 としたときの比率 */
  backNarrow: 0.62,
  /** 台が viewBox の幅のどれだけを使うか。残りは横穴を描く余白になる */
  fieldSpread: 0.84,
  /** 真上から見た円を、斜めから見た楕円に潰す比率 */
  squash: 0.62,
  /** 落下口から受け皿までの落差 */
  payoutDrop: 26,
  /** 横穴へ吸い込まれるときに横へ逃げる量 */
  sideHoleDrift: 11,
  /** 投入口からコインが降りてくる高さ */
  dropHeight: 40,
} as const;

export type Placed = { x: number; y: number; scale: number; opacity: number };

/** その奥行きでの台の幅の比率。奥（0）が狭く、手前（1）が 1 になる */
export function rowWidth(depthRatio: number): number {
  return STAGE.backNarrow + (1 - STAGE.backNarrow) * depthRatio;
}

export function project(
  x: number,
  y: number,
  config: PusherConfig
): { x: number; y: number; scale: number } {
  const depthRatio = y / config.depth;
  const scale = rowWidth(depthRatio);
  // 手前ほど行の間隔を広げると、奥行きがついて見える
  const eased = depthRatio * (0.74 + 0.26 * depthRatio);

  return {
    x: STAGE.width / 2 + (x - config.width / 2) * scale * STAGE.fieldSpread,
    y: STAGE.backY + (STAGE.frontY - STAGE.backY) * eased,
    scale,
  };
}

/** コインを1枚描くための位置。落ちている途中の演出もここで出す */
export function placeCoin(coin: Coin, config: PusherConfig): Placed {
  const base = project(coin.x, coin.y, config);
  const phase = coin.phase;

  if (phase.kind === "dropping") {
    // 1 → 0。投入口から台まで降りてくる
    const left = phase.remaining / config.dropDuration;
    return {
      x: base.x,
      y: base.y - left * STAGE.dropHeight,
      scale: base.scale * (1 + left * 0.45),
      opacity: 1,
    };
  }

  if (phase.kind === "payout") {
    // 0 → 1。落下口を抜けて受け皿へ
    const gone = 1 - phase.remaining / config.payoutDuration;
    return {
      x: base.x,
      y: base.y + gone * STAGE.payoutDrop,
      scale: base.scale * (1 - gone * 0.35),
      opacity: 1 - gone,
    };
  }

  if (phase.kind === "sidehole") {
    const gone = 1 - phase.remaining / config.payoutDuration;
    const direction = coin.x < config.width / 2 ? -1 : 1;
    return {
      x: base.x + direction * gone * STAGE.sideHoleDrift,
      y: base.y + gone * 8,
      scale: base.scale * (1 - gone * 0.45),
      opacity: 1 - gone,
    };
  }

  return { x: base.x, y: base.y, scale: base.scale, opacity: 1 };
}

/** 台の面を描く台形の頂点 */
export function fieldOutline(config: PusherConfig): string {
  const backLeft = project(0, 0, config);
  const backRight = project(config.width, 0, config);
  const frontRight = project(config.width, config.depth, config);
  const frontLeft = project(0, config.depth, config);
  return [backLeft, backRight, frontRight, frontLeft]
    .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");
}
