import { useEffect, useState } from "react";
import { fitScale } from "./fitScale";

/**
 * 卓が使える高さに収まる倍率を測る。
 *
 * レーンの深さも滞留の枚数も人数も、遊んでいる間に変わる。だから倍率を
 * 画面の高さから決め打ちせず、**実際の卓の高さを測って**決める。
 * 深さが変わるたびに調整値を直さずに済む。
 *
 * 返すのは「使える高さの箱」につける ref と、その中身にかける倍率。
 * 倍率は transform でかけるので、測る対象の高さ（レイアウト）は変わらない。
 * 測り直しが自分の結果に引きずられることがない。
 */
export function useFitScale(): [(node: HTMLDivElement | null) => void, number] {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (box === null) {
      return;
    }

    // observe した時点で1回呼ばれるので、ここでは測らない
    const observer = new ResizeObserver(() => {
      const content = box.firstElementChild;
      setScale(
        content === null ? 1 : fitScale(box.clientHeight, (content as HTMLElement).offsetHeight)
      );
    });
    observer.observe(box);

    return () => observer.disconnect();
  }, [box]);

  return [setBox, scale];
}
