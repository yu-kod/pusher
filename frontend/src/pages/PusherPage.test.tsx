import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "@/test-utils/render";
import { PusherPage } from "./PusherPage";

beforeEach(() => {
  // 台が勝手に進むとテストが時間に依存するので、フレームを止めておく
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PusherPage", () => {
  it("得点・ジャックポット・手持ちを出す", () => {
    renderWithRouter(<PusherPage />);

    expect(within(screen.getByTestId("hud-score")).getByText("0")).toBeInTheDocument();
    expect(screen.getByTestId("hud-jackpot")).toHaveTextContent("0");
    expect(screen.getByTestId("hud-purse")).toHaveTextContent("20");
  });

  it("投入ボタンを押すと手持ちが1枚減る", async () => {
    const { user } = renderWithRouter(<PusherPage />);

    await user.click(screen.getByRole("button", { name: "コインを投入" }));

    expect(screen.getByTestId("hud-purse")).toHaveTextContent("19");
  });

  it("手持ちを使い切ると投入できなくなる", async () => {
    const { user } = renderWithRouter(<PusherPage />);
    const drop = screen.getByRole("button", { name: "コインを投入" });

    for (let i = 0; i < 20; i += 1) {
      await user.click(drop);
    }

    expect(screen.getByTestId("hud-purse")).toHaveTextContent("0");
    expect(drop).toBeDisabled();
    expect(screen.getByText(/手持ちがなくなりました/)).toBeInTheDocument();
  });

  it("最初からを押すと台を組み直す", async () => {
    const { user } = renderWithRouter(<PusherPage />);

    await user.click(screen.getByRole("button", { name: "コインを投入" }));
    expect(screen.getByTestId("hud-purse")).toHaveTextContent("19");

    await user.click(screen.getByRole("button", { name: "最初から" }));

    expect(screen.getByTestId("hud-purse")).toHaveTextContent("20");
  });

  it("台を直接たたいても投入できる", async () => {
    const user = userEvent.setup();
    renderWithRouter(<PusherPage />);

    const stage = screen.getByRole("button", { name: /コインを投入する台/ });
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 400,
      top: 0,
      height: 300,
      right: 400,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    await user.pointer({
      target: stage,
      keys: "[MouseLeft]",
      coords: { clientX: 100, clientY: 150 },
    });

    expect(screen.getByTestId("hud-purse")).toHaveTextContent("19");
  });

  it("トップへ戻れる", () => {
    renderWithRouter(<PusherPage />);
    expect(screen.getByRole("link", { name: /戻る/ })).toHaveAttribute("href", "/");
  });

  it("台そのものにも触れる", () => {
    renderWithRouter(<PusherPage />);
    expect(screen.getByRole("button", { name: /コインを投入する台/ })).toBeInTheDocument();
  });
});
