import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TickBanner } from "./TickBanner";

describe("TickBanner", () => {
  it("宣言の拍では、締め切りまでの残りを出す", () => {
    render(
      <TickBanner
        phase="declaring"
        secondsLeft={7}
        declaredCount={2}
        playerCount={4}
        resolving={null}
      />
    );

    expect(screen.getByText("宣言")).toBeInTheDocument();
    expect(screen.getByText("残り7秒")).toBeInTheDocument();
  });

  it("宣言の拍では、何人が宣言を済ませたかを出す", () => {
    render(
      <TickBanner
        phase="declaring"
        secondsLeft={7}
        declaredCount={2}
        playerCount={4}
        resolving={null}
      />
    );

    expect(screen.getByText("2/4人")).toBeInTheDocument();
  });

  it("残りが少なくなったら、急かしていると分かる", () => {
    render(
      <TickBanner
        phase="declaring"
        secondsLeft={3}
        declaredCount={3}
        playerCount={4}
        resolving={null}
      />
    );

    expect(screen.getByTestId("tick-banner")).toHaveAttribute("data-urgent", "true");
  });

  it("まだ余裕があるうちは急かさない", () => {
    render(
      <TickBanner
        phase="declaring"
        secondsLeft={9}
        declaredCount={0}
        playerCount={4}
        resolving={null}
      />
    );

    expect(screen.getByTestId("tick-banner")).toHaveAttribute("data-urgent", "false");
  });

  it("公開の拍では、全員の狙いが開くと分かる", () => {
    render(
      <TickBanner
        phase="revealing"
        secondsLeft={0}
        declaredCount={4}
        playerCount={4}
        resolving={null}
      />
    );

    expect(screen.getByText("一斉公開")).toBeInTheDocument();
    expect(screen.queryByText(/残り/)).not.toBeInTheDocument();
  });

  it("解決の拍では、いま誰の番が動いているかを出す", () => {
    render(
      <TickBanner
        phase="resolving"
        secondsLeft={0}
        declaredCount={4}
        playerCount={4}
        resolving="はると"
      />
    );

    expect(screen.getByText("解決")).toBeInTheDocument();
    expect(screen.getByText("はると")).toBeInTheDocument();
  });

  it("解決しきったあとは、誰の番も出さない", () => {
    render(
      <TickBanner
        phase="resolving"
        secondsLeft={0}
        declaredCount={4}
        playerCount={4}
        resolving={null}
      />
    );

    expect(screen.getByText("解決")).toBeInTheDocument();
    expect(screen.getByTestId("tick-banner")).toHaveAttribute("data-phase", "resolving");
  });
});
