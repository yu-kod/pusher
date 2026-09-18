/**
 * 縦が足りないときに卓を縮める倍率。
 *
 * 卓上のゲームなので、画面が小さいことは**卓から少し離れて見ている**ことにあたる。
 * 盤面の比率はそのままに、丸ごと縮める。カードの大小関係も、ボール札が奥の山の
 * どこにあるかの読みやすさも、縮めても変わらない。
 */

/** これ以上は縮めない。読めない卓になるくらいなら、はみ出したほうがまし */
const MIN_SCALE = 0.5;

/**
 * 使える高さに対して、卓の本来の高さをどこまで縮めるか。
 *
 * 引き伸ばしはしない。余白があるからといって卓が大きくなると、人数やレーンの
 * 深さで卓の大きさが変わってしまう。
 */
export function fitScale(available: number, natural: number): number {
  if (available <= 0 || natural <= 0) {
    return 1;
  }
  return Math.max(MIN_SCALE, Math.min(1, available / natural));
}
