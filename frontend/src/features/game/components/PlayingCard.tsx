import type { CSSProperties } from "react";
import type { Card } from "@/lib/types";

export type CardSize = "sm" | "md";

const SIZES: Record<CardSize, string> = {
  sm: "h-[56px] w-[40px] rounded-[4px] text-[17px]",
  md: "h-[76px] w-[54px] rounded-md text-[26px]",
};

type Props = ({ faceUp: true; card: Card } | { faceUp: false }) & {
  size?: CardSize;
  /** 読み上げ名。省略すると装飾扱いになる（親が意味を持つ場合に使う） */
  label?: string;
  className?: string;
  style?: CSSProperties;
};

/**
 * 机に置かれた1枚のカード。
 *
 * 裏向きのときは `card` を受け取らないので、**中身を持ちようがない**
 * （docs/spec.md §8 の情報設計をそのまま型にしている）。
 *
 * 自分では押せない。押せるのは親（手札のボタン、レーンのボタン）の役目。
 */
export function PlayingCard(props: Props) {
  const { size = "md", label, className = "", style } = props;
  const semantics =
    label === undefined ? { "aria-hidden": true } : { role: "img", "aria-label": label };
  // 位置指定は呼び出し側に任せる。ここで relative を付けると、呼び出し側の
  // absolute と衝突して span が inline のまま（＝幅が効かない）になる
  const box = `${SIZES[size]} shrink-0 select-none border border-black/25 shadow-[0_1px_2px_rgba(0,0,0,0.35)]`;

  if (!props.faceUp) {
    return <span {...semantics} style={style} className={`${box} card-back block ${className}`} />;
  }

  const { card } = props;
  return (
    <span
      {...semantics}
      style={style}
      className={`${box} flex flex-col items-center justify-center bg-[#fdfaf3] text-stone-900 ${className}`}
    >
      {card.kind === "coin" ? (
        <>
          <span className="font-bold leading-none tabular-nums">{card.coins}</span>
          <span className="mt-0.5 leading-none" style={{ fontSize: size === "md" ? 10 : 7 }}>
            {"●".repeat(card.coins)}
          </span>
        </>
      ) : (
        <span
          className="leading-none font-bold text-sky-700"
          style={{ fontSize: size === "md" ? 11 : 8 }}
        >
          イベント
        </span>
      )}
    </span>
  );
}
