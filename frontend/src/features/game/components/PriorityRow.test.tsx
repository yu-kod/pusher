import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PriorityRow } from "./PriorityRow";
import { buildPlayer } from "@/test-utils/game";

const players = [
  buildPlayer({ id: "p1", name: "あき" }),
  buildPlayer({ id: "p2", name: "はると" }),
  buildPlayer({ id: "p3", name: "そら" }),
];

function renderRow(props: Partial<React.ComponentProps<typeof PriorityRow>> = {}) {
  return render(
    <PriorityRow players={players} order={[2, 0, 1]} movingIndex={null} meIndex={0} {...props} />
  );
}

describe("PriorityRow", () => {
  it("解決する順に並べる", () => {
    renderRow();

    const names = screen.getAllByTestId("priority-seat").map((n) => n.textContent);
    expect(names.map((n) => n?.replace(/\d/g, ""))).toEqual(["そら", "あき", "はると"]);
  });

  it("何番目かが分かる", () => {
    renderRow();

    const first = screen.getAllByTestId("priority-seat")[0] as HTMLElement;
    expect(within(first).getByText("1")).toBeInTheDocument();
  });

  it("自分がどこにいるか分かる", () => {
    renderRow();

    const mine = screen.getAllByTestId("priority-seat")[1] as HTMLElement;
    expect(mine).toHaveAttribute("data-me", "true");
  });

  it("いま解決している人が分かる", () => {
    renderRow({ movingIndex: 0 });

    const moving = screen.getAllByTestId("priority-seat")[1] as HTMLElement;
    expect(moving).toHaveAttribute("data-moving", "true");
  });

  it("解決していない間は、誰も動いていない", () => {
    renderRow({ movingIndex: null });

    expect(screen.getAllByTestId("priority-seat").every((n) => n.dataset.moving === "false")).toBe(
      true
    );
  });

  it("何の列かが読み上げで分かる", () => {
    renderRow();

    expect(screen.getByLabelText("先行権の順")).toBeInTheDocument();
  });

  it("卓に居ない席が混ざっていても、残りを並べる", () => {
    renderRow({ order: [2, 9, 0] });

    expect(screen.getAllByTestId("priority-seat")).toHaveLength(2);
  });
});
