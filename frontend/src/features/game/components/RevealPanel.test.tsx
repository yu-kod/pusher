import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RevealPanel } from "./RevealPanel";
import type { PlayerView } from "@/lib/types";

function player(name: string, declaration: PlayerView["declaration"]): PlayerView {
  return {
    id: name,
    name,
    points: 0,
    hand: { owner: false, count: 3 },
    declared: true,
    declaration,
  };
}

describe("RevealPanel", () => {
  it("誰がどのレーンを狙ったかを一斉に出す", () => {
    render(
      <RevealPanel
        players={[
          player("あき", {
            kind: "insert",
            laneIndex: 0,
            handIndex: 0,
            card: { kind: "coin", coins: 2 },
          }),
          player("はると", {
            kind: "insert",
            laneIndex: 2,
            handIndex: 1,
            card: { kind: "coin", coins: 3 },
          }),
        ]}
      />
    );

    expect(screen.getByText("あき")).toBeInTheDocument();
    expect(screen.getByText(/左/)).toBeInTheDocument();
    expect(screen.getByText("はると")).toBeInTheDocument();
    expect(screen.getByText(/右/)).toBeInTheDocument();
  });

  it("降りた人も同じ拍で開く", () => {
    render(<RevealPanel players={[player("そら", { kind: "withdraw" })]} />);

    expect(screen.getByText("降りた")).toBeInTheDocument();
  });

  it("投入したカードの中身も開く", () => {
    render(
      <RevealPanel
        players={[
          player("あき", {
            kind: "insert",
            laneIndex: 1,
            handIndex: 0,
            card: { kind: "coin", coins: 2 },
          }),
        ]}
      />
    );

    expect(screen.getByText(/2コイン/)).toBeInTheDocument();
  });

  it("宣言が届いていない人は、間に合わなかったと分かる", () => {
    render(<RevealPanel players={[player("みなと", null)]} />);

    expect(screen.getByText("宣言なし")).toBeInTheDocument();
  });

  it("同じレーンを狙った人が並んでいても、全員ぶん出す", () => {
    const aim: PlayerView["declaration"] = {
      kind: "insert",
      laneIndex: 1,
      handIndex: 0,
      card: { kind: "coin", coins: 1 },
    };
    render(<RevealPanel players={[player("あき", aim), player("はると", aim)]} />);

    expect(screen.getAllByTestId("reveal-row")).toHaveLength(2);
  });
});
