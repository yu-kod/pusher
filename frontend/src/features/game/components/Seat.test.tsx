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
      declared={null}
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

  it("宣言の拍では、宣言を済ませた席にそれと分かる印を出す", () => {
    renderSeat({ declared: true });

    expect(screen.getByText("宣言済み")).toBeInTheDocument();
    expect(screen.getByTestId("seat")).toHaveAttribute("data-declared", "true");
  });

  it("まだ宣言していない席は、待っていると分かる", () => {
    renderSeat({ declared: false });

    expect(screen.getByText("考え中")).toBeInTheDocument();
    expect(screen.getByTestId("seat")).toHaveAttribute("data-declared", "false");
  });

  it("宣言の拍でなければ、宣言の印は出さない", () => {
    renderSeat({ declared: null });

    expect(screen.queryByText("宣言済み")).not.toBeInTheDocument();
    expect(screen.queryByText("考え中")).not.toBeInTheDocument();
  });

  it("宣言済みでも、何を宣言したかは席に出さない", () => {
    const { container } = renderSeat({ declared: true });

    // 席が持つのは真偽値だけ（docs/realtime.md §8-3）。投入先も、降りたことも伏せる
    expect(container.textContent).not.toMatch(/レーン|降り/);
  });
});
