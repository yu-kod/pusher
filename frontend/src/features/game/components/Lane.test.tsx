import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Lane } from "./Lane";
import { buildLane } from "@/test-utils/game";

function renderLane(props: Partial<React.ComponentProps<typeof Lane>> = {}) {
  return render(
    <Lane
      lane={buildLane()}
      index={1}
      laneCount={3}
      target={null}
      risky={false}
      selected={false}
      disabled={false}
      onSelect={() => {}}
      {...props}
    />
  );
}

describe("ボール札", () => {
  it("奥の山のどこにあるかが見える", () => {
    renderLane({ lane: buildLane({ stockCount: 6, ballIndex: 5 }) });

    expect(screen.getByTestId("ball-card")).toBeInTheDocument();
  });

  it("ボール札が無いレーンには出さない", () => {
    renderLane({ lane: buildLane({ stockCount: 6, ballIndex: null }) });

    expect(screen.queryByTestId("ball-card")).not.toBeInTheDocument();
  });

  it("落下口に近いほど、落下口の側に寄って見える", () => {
    renderLane({ lane: buildLane({ stockCount: 6, ballIndex: 0 }) });
    const near = screen.getByTestId("ball-card").style.top;

    screen.getByTestId("ball-card").remove();
    renderLane({ lane: buildLane({ stockCount: 6, ballIndex: 4 }) });
    const far = screen.getByTestId("ball-card").style.top;

    // 奥の山は上が奥、下が落下口の側。末端に近いほど下に出る
    expect(parseFloat(near)).toBeGreaterThan(parseFloat(far));
  });

  it("次に落ちる位置まで来たら、奥の山のいちばん落下口寄りに出る", () => {
    renderLane({ lane: buildLane({ stockCount: 6, ballIndex: 0 }) });
    const ball = screen.getByTestId("ball-card");
    const stack = ball.parentElement as HTMLElement;

    // 山の高さぶん下がりきった位置。次の押し込みで落ちる1枚だと読める
    expect(parseFloat(ball.style.top)).toBe(
      parseFloat(stack.style.height) - parseFloat(ball.style.height)
    );
  });

  it("入れ直された直後は、奥の山のいちばん奥に出る", () => {
    renderLane({ lane: buildLane({ stockCount: 6, ballIndex: 5 }) });

    expect(screen.getByTestId("ball-card").style.top).toBe("0px");
  });

  it("ボール札は読み上げでも位置が分かる", () => {
    renderLane({ lane: buildLane({ stockCount: 6, ballIndex: 2 }) });

    expect(screen.getByLabelText("ボール札 落下口から3枚目")).toBeInTheDocument();
  });
});
