/**
 * ボール札（`docs/turn-structure.md` §4-3）。
 *
 * レーンの奥の山に1枚だけ混ざる、**位置の見えるカード**。列の中で1枚だけ表向きに
 * 置かれるので、中身は伏せたまま「あと何枚押し込めば落ちるか」だけが公開情報になる。
 * それが「同じレーンを狙う理由」を作る。
 */
import { ball, isBallCard, isDeckCard, type Card, type DeckCard } from "./deck.js";
import type { Lane } from "./setup.js";

/**
 * ボール札が末端から何枚目にあるか。
 *
 * 押し出しは末端（添字 0）から落ちるので、この数がそのまま
 * 「あと何枚押し込めば落ちるか」になる。ボール札が無ければ null。
 */
export function ballIndexOf(lane: Lane): number | null {
  const index = lane.stock.findIndex(isBallCard);
  return index === -1 ? null : index;
}

/** 入れ直しの結果。押し出されたカードは山札へ戻す */
export type RestockResult = {
  stock: Card[];
  /** 入れ直したぶん、レーンから出ていったカード。呼び出し側が山札へ戻す */
  returned: DeckCard[];
};

/**
 * 落ちたカードにボール札があれば、同じ枚数を奥へ入れ直す（§4-3）。
 *
 * **ボール札がレーンから消える経路は1つも作らない。** 落ちる経路は押し出し（§4-2）と
 * 「もう1枚落とす」（§6-3）の2つあり、片方でも入れ直しを忘れると、そのレーンは
 * 二度とボール札を持たない。イベントをよく踏むレーンほど狙う価値が消えていく、という
 * 誰も意図しない偏りになる。だから入れ直しは呼び出し側に任せず、この1か所に置く。
 *
 * ## 厚みを変えないために1枚戻す
 *
 * ボール札が落ちたとき、押し込んだカードはレーンに残っている。そこへ新しいボール札を
 * 足すだけだとレーンが1枚ずつ厚くなり、**ゲームが進むほどレーンが重くなる**
 * （実測では13ラウンドで 6枚 → 9.9枚）。レーンの厚みを一定に保つ（docs/spec.md §4-3）
 * ため、いちばん奥のカードを1枚だけ山札へ戻す。
 */
export function restockBalls(stock: readonly Card[], fallen: readonly Card[]): RestockResult {
  const next = [...stock];
  const returned: DeckCard[] = [];

  for (const _ of fallen.filter(isBallCard)) {
    // 出すのはいちばん奥のカード。ボール札そのものは戻さない（場から減ってしまう）
    const offsetFromEnd = [...next].reverse().findIndex(isDeckCard);
    if (offsetFromEnd !== -1) {
      returned.push(...next.splice(next.length - 1 - offsetFromEnd, 1).filter(isDeckCard));
    }
    next.push(ball());
  }

  return { stock: next, returned };
}
