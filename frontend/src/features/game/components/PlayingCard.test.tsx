import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlayingCard } from "./PlayingCard";
import { coin, eventCard } from "@/test-utils/game";

describe("PlayingCard", () => {
  it("表向きのコイン札はコイン数を見せる", () => {
    render(<PlayingCard faceUp card={coin(3)} label="3コイン札" />);

    expect(screen.getByRole("img", { name: "3コイン札" })).toHaveTextContent("3");
  });

  it("裏向きのカードは中身を持たない", () => {
    const { container } = render(<PlayingCard faceUp={false} label="裏向きのカード" />);

    expect(screen.getByRole("img", { name: "裏向きのカード" })).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/\d/);
  });

  it("ラベルがなければ装飾として扱う（親が意味を持つ）", () => {
    const { container } = render(<PlayingCard faceUp={false} />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });

  it("表向きのイベント札はコイン数を持たない", () => {
    const { container } = render(
      <PlayingCard faceUp card={eventCard("avalanche")} label="イベント: avalanche" size="sm" />
    );

    expect(screen.getByRole("img", { name: "イベント: avalanche" })).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/\d/);
  });
});
