import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Seat } from "./Seat";

function renderSeat(props: Partial<React.ComponentProps<typeof Seat>> = {}) {
  return render(
    <Seat
      name="はると"
      points={12}
      handCount={4}
      position="top"
      current={false}
      isMe={false}
      {...props}
    />
  );
}

describe("Seat", () => {
  it("名前と得点と手札の枚数を出す", () => {
    renderSeat();

    expect(screen.getByText("はると")).toBeInTheDocument();
    expect(screen.getByText("12点")).toBeInTheDocument();
    expect(screen.getByText("手札4")).toBeInTheDocument();
  });

  it("誰の席かを読み上げられる", () => {
    renderSeat();

    expect(screen.getByLabelText("はるとの席")).toBeInTheDocument();
  });

  it("どこに座っているかを持つ", () => {
    renderSeat({ position: "left" });

    expect(screen.getByTestId("seat")).toHaveAttribute("data-position", "left");
  });

  it("手番の席はそれと分かる", () => {
    renderSeat({ current: true });

    expect(screen.getByTestId("seat")).toHaveAttribute("data-current", "true");
    expect(screen.getByText("手番")).toBeInTheDocument();
  });

  it("手番でない席には印を出さない", () => {
    renderSeat({ current: false });

    expect(screen.queryByText("手番")).not.toBeInTheDocument();
  });

  it("自分の席だと分かる", () => {
    renderSeat({ isMe: true });

    expect(screen.getByText("あなた")).toBeInTheDocument();
  });

  it("手札は裏向きの束として見せる（中身は持たない）", () => {
    renderSeat({ handCount: 3 });

    expect(screen.getAllByTestId("seat-card-back")).toHaveLength(3);
  });

  it("手札が多くても束の見た目は増やしすぎない", () => {
    renderSeat({ handCount: 12 });

    expect(screen.getAllByTestId("seat-card-back").length).toBeLessThanOrEqual(5);
    expect(screen.getByText("手札12")).toBeInTheDocument();
  });

  it("手札がなければ束も出さない", () => {
    renderSeat({ handCount: 0 });

    expect(screen.queryByTestId("seat-card-back")).not.toBeInTheDocument();
  });
});
