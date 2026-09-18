/**
 * カードが動く向き。
 *
 * 卓の上でカードが動くのをそのまま写すための値で、**独自の物理は持たない**。
 * 投入したカードは手札からレーンへ入り、落ちたカードは落下口から手前へ出てくる。
 * それだけを、どちらの向きから／どちらの向きへ、という形で表す。
 *
 * DOM を測らずに済むように、手札とレーンの位置関係だけから決めている。
 */

export type Offset = { x: number; y: number };

/** レーン1本ぶんの間隔の目安（px） */
const LANE_PITCH = 62;
/** 手札からレーンまでの高さの目安（px） */
const TOSS_HEIGHT = 240;

/**
 * 投入したカードが、レーンへ入ってくる開始位置。
 *
 * 手札は卓の手前の中央にあるので、端のレーンほど斜めに入ってくる。
 */
export function tossFrom(laneIndex: number, laneCount: number): Offset {
  const center = (laneCount - 1) / 2;
  return { x: (center - laneIndex) * LANE_PITCH, y: TOSS_HEIGHT };
}

/**
 * 落下口から出た得点が、手元へ流れてくる先。
 *
 * 何枚落ちたかはサーバーしか知らない（§4-1）。枚数をクライアントで数え直すと
 * ルールの二重実装になるので、**動かすのは得点そのもの**にしている。
 *
 * いま画面に出せるのは自分が押し出した結果だけなので、行き先は自分の手元しかない。
 * 他のプレイヤーの押し出しも見えるようになったら（WebSocket 同期・#15）、
 * ここに席の向きが要る。
 */
export const PAYOUT_DRIFT: Offset = { x: 0, y: 150 };
