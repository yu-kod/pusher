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
    <PriorityRow
      players={players}
      order={["p3", "p1", "p2"]}
      movingId={null}
      meId="p1"
      {...props}
    />
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
    renderRow({ movingId: "p1" });

    const moving = screen.getAllByTestId("priority-seat")[1] as HTMLElement;
    expect(moving).toHaveAttribute("data-moving", "true");
  });

  it("解決していない間は、誰も動いていない", () => {
    renderRow({ movingId: null });

    expect(screen.getAllByTestId("priority-seat").every((n) => n.dataset.moving === "false")).toBe(
      true
    );
  });

  it("何の列かが読み上げで分かる", () => {
    renderRow();

    expect(screen.getByLabelText("先行権の順")).toBeInTheDocument();
  });

  it("卓から外れた id が混ざっていても、残りを並べる", () => {
    renderRow({ order: ["p3", "居ない人", "p1"] });

    expect(screen.getAllByTestId("priority-seat")).toHaveLength(2);
  });
});
