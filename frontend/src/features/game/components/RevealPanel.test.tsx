import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RevealPanel } from "./RevealPanel";
import { buildPlayer, buildTickPlayer } from "@/test-utils/game";
import type { DeclarationView } from "@/lib/types";

const insert = (laneIndex: number): DeclarationView => ({
  kind: "insert",
  laneIndex,
  handIndexes: [0],
});

/** 名前と宣言の組から、席順の並びを2つ作る */
function seats(rows: readonly [string, DeclarationView | null][]) {
  return {
    players: rows.map(([name], i) => buildPlayer({ id: `p${i + 1}`, name })),
    tick: rows.map(([, declaration], i) =>
      buildTickPlayer({ id: `p${i + 1}`, declared: declaration !== null, declaration })
    ),
  };
}

describe("RevealPanel", () => {
  it("誰がどのレーンを狙ったかを一斉に出す", () => {
    render(
      <RevealPanel
        {...seats([
          ["あき", insert(0)],
          ["はると", insert(2)],
        ])}
      />
    );

    expect(screen.getByText("あき")).toBeInTheDocument();
    expect(screen.getByText("左")).toBeInTheDocument();
    expect(screen.getByText("はると")).toBeInTheDocument();
    expect(screen.getByText("右")).toBeInTheDocument();
  });

  it("降りた人も同じ拍で開く", () => {
    render(<RevealPanel {...seats([["そら", { kind: "withdraw" }]])} />);

    expect(screen.getByText("降りた")).toBeInTheDocument();
  });

  it("宣言が届いていない人は、間に合わなかったと分かる", () => {
    render(<RevealPanel {...seats([["みなと", null]])} />);

    expect(screen.getByText("宣言なし")).toBeInTheDocument();
  });

  it("同じレーンを狙った人が並んでいても、全員ぶん出す", () => {
    render(
      <RevealPanel
        {...seats([
          ["あき", insert(1)],
          ["はると", insert(1)],
        ])}
      />
    );

    expect(screen.getAllByTestId("reveal-row")).toHaveLength(2);
  });

  it("席の数より宣言が少なくても、残りは宣言なしとして出す", () => {
    const { players, tick } = seats([
      ["あき", insert(1)],
      ["はると", insert(1)],
    ]);

    render(<RevealPanel players={players} tick={tick.slice(0, 1)} />);

    expect(screen.getByText("宣言なし")).toBeInTheDocument();
  });
});
