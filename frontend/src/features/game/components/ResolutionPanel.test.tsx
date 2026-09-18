import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResolutionPanel } from "./ResolutionPanel";
import type { ResolutionStepView } from "@/lib/types";

const step: ResolutionStepView = {
  playerId: "p1",
  laneIndex: 1,
  roll: 4,
  pushedCount: 2,
  droppedCount: 1,
  gainedPoints: 3,
  sideHole: false,
};

describe("ResolutionPanel", () => {
  it("いま動いている人と、そのレーンを出す", () => {
    render(<ResolutionPanel step={step} name="はると" />);

    expect(screen.getByText("はると")).toBeInTheDocument();
    expect(screen.getByText(/中央/)).toBeInTheDocument();
  });

  it("出目と、押し込んだ枚数と、落ちた枚数を出す", () => {
    render(<ResolutionPanel step={step} name="はると" />);

    expect(screen.getByLabelText("出目 4")).toBeInTheDocument();
    expect(screen.getByText(/押し込み 2枚/)).toBeInTheDocument();
    expect(screen.getByText(/落下 1枚/)).toBeInTheDocument();
  });

  it("得点を出す", () => {
    render(<ResolutionPanel step={step} name="はると" />);

    expect(screen.getByText("3点")).toBeInTheDocument();
  });

  it("横穴なら、それと分かる", () => {
    render(<ResolutionPanel step={{ ...step, sideHole: true, gainedPoints: 0 }} name="そら" />);

    expect(screen.getByText(/横穴/)).toBeInTheDocument();
  });

  it("横穴でなければ、横穴とは出さない", () => {
    render(<ResolutionPanel step={step} name="はると" />);

    expect(screen.queryByText(/横穴/)).not.toBeInTheDocument();
  });

  it("1歩ずつ動いていると分かるよう、そのステップだけを出す", () => {
    render(<ResolutionPanel step={step} name="はると" />);

    expect(screen.getAllByTestId("resolution-step")).toHaveLength(1);
  });
});
