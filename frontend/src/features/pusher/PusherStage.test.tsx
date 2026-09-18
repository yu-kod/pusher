import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PusherStage } from "./PusherStage";
import { DEFAULT_CONFIG, createTable, type PusherState } from "./simulation";
import type { Burst } from "./usePusherTable";

function buildTable(overrides?: Partial<PusherState>): PusherState {
  return { ...createTable({ rng: () => 0.5, initialCoins: 0 }), ...overrides };
}

function renderStage(props?: {
  table?: PusherState;
  bursts?: Burst[];
  aimX?: number;
  onAim?: (x: number) => void;
  onDrop?: (x: number) => void;
}) {
  return render(
    <PusherStage
      table={props?.table ?? buildTable()}
      bursts={props?.bursts ?? []}
      aimX={props?.aimX ?? 50}
      onAim={props?.onAim ?? (() => {})}
      onDrop={props?.onDrop ?? (() => {})}
    />
  );
}

/** jsdom は要素の大きさを持たないので、投入位置を計算できるよう寸法を与える */
function giveSize(element: Element, left = 0, width = 400) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    left,
    width,
    top: 0,
    height: 300,
    right: left + width,
    bottom: 300,
    x: left,
    y: 0,
    toJSON: () => ({}),
  });
}

describe("PusherStage", () => {
  it("台の上のコインを枚数ぶん描く", () => {
    const table = buildTable({ coins: createTable({ rng: () => 0.4, initialCoins: 7 }).coins });
    renderStage({ table });
    expect(screen.getAllByTestId("coin")).toHaveLength(7);
  });

  it("投入位置の目安を出す", () => {
    renderStage({ aimX: 20 });
    expect(screen.getByTestId("aim")).toBeInTheDocument();
  });

  it("台をクリックするとその位置に投入する", async () => {
    const onDrop = vi.fn();
    const user = userEvent.setup();
    renderStage({ onDrop });

    const stage = screen.getByRole("button", { name: /コインを投入/ });
    giveSize(stage);
    await user.pointer({
      target: stage,
      keys: "[MouseLeft]",
      coords: { clientX: 300, clientY: 100 },
    });

    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith(75);
  });

  it("台の上でポインタを動かすと狙いが動く", async () => {
    const onAim = vi.fn();
    const user = userEvent.setup();
    renderStage({ onAim });

    const stage = screen.getByRole("button", { name: /コインを投入/ });
    giveSize(stage);
    await user.pointer({ target: stage, coords: { clientX: 100, clientY: 100 } });

    expect(onAim).toHaveBeenCalledWith(25);
  });

  it("大きさが取れないうちは狙いも動かさない", async () => {
    const onAim = vi.fn();
    const user = userEvent.setup();
    renderStage({ onAim });

    const stage = screen.getByRole("button", { name: /コインを投入/ });
    await user.pointer({ target: stage, coords: { clientX: 100, clientY: 100 } });

    expect(onAim).not.toHaveBeenCalled();
  });

  it("大きさが取れないうちは投入しない", async () => {
    const onDrop = vi.fn();
    const user = userEvent.setup();
    renderStage({ onDrop });

    // jsdom の既定では幅が 0 なので、位置を決められない
    const stage = screen.getByRole("button", { name: /コインを投入/ });
    await user.pointer({
      target: stage,
      keys: "[MouseLeft]",
      coords: { clientX: 100, clientY: 10 },
    });

    expect(onDrop).not.toHaveBeenCalled();
  });

  it("キーボードでも狙いを動かして投入できる", async () => {
    const onAim = vi.fn();
    const onDrop = vi.fn();
    const user = userEvent.setup();
    renderStage({ aimX: 50, onAim, onDrop });

    const stage = screen.getByRole("button", { name: /コインを投入/ });
    stage.focus();

    await user.keyboard("{ArrowLeft}");
    expect(onAim).toHaveBeenLastCalledWith(46);

    await user.keyboard("{ArrowRight}");
    expect(onAim).toHaveBeenLastCalledWith(54);

    await user.keyboard("{Enter}");
    expect(onDrop).toHaveBeenCalledWith(50);
  });

  it("狙いは台の端を越えない", async () => {
    const onAim = vi.fn();
    const user = userEvent.setup();
    const { rerender } = renderStage({ aimX: 0, onAim });
    screen.getByRole("button", { name: /コインを投入/ }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(onAim).toHaveBeenLastCalledWith(0);

    rerender(
      <PusherStage
        table={buildTable()}
        bursts={[]}
        aimX={DEFAULT_CONFIG.width}
        onAim={onAim}
        onDrop={() => {}}
      />
    );
    screen.getByRole("button", { name: /コインを投入/ }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onAim).toHaveBeenLastCalledWith(DEFAULT_CONFIG.width);
  });

  it("関係のないキーは無視する", async () => {
    const onAim = vi.fn();
    const onDrop = vi.fn();
    const user = userEvent.setup();
    renderStage({ onAim, onDrop });
    screen.getByRole("button", { name: /コインを投入/ }).focus();

    await user.keyboard("a");

    expect(onAim).not.toHaveBeenCalled();
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("得点したコインの吹き出しを出す", () => {
    const bursts: Burst[] = [{ id: 1, kind: "scored", value: 3, x: 40, life: 0.5 }];
    renderStage({ bursts });
    expect(screen.getByText("+3")).toBeInTheDocument();
  });

  it("横穴に落ちたコインはジャックポット側の吹き出しになる", () => {
    const bursts: Burst[] = [{ id: 2, kind: "swallowed", value: 2, x: 0, life: 0.5 }];
    renderStage({ bursts });
    expect(screen.getByText("JP +2")).toBeInTheDocument();
  });

  it("プッシャー板の位置が時間で変わる", () => {
    const { rerender } = renderStage({ table: buildTable({ time: 0 }) });
    const home = screen.getByTestId("pusher").getAttribute("points");

    rerender(
      <PusherStage
        table={buildTable({ time: DEFAULT_CONFIG.pusherPeriod / 2 })}
        bursts={[]}
        aimX={50}
        onAim={() => {}}
        onDrop={() => {}}
      />
    );

    expect(screen.getByTestId("pusher").getAttribute("points")).not.toBe(home);
  });
});
