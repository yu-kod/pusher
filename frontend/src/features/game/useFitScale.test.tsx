import { render, act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFitScale } from "./useFitScale";

/** 観測を手で起こせる ResizeObserver。jsdom には実物が無い */
let observers: { cb: () => void; disconnect: () => void }[] = [];

beforeEach(() => {
  observers = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect = vi.fn();
      constructor(private cb: () => void) {
        observers.push({ cb: () => this.cb(), disconnect: this.disconnect });
      }
      observe() {}
      unobserve() {}
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 高さを持った箱と中身を組み、倍率を読み出せる形で描く */
function Harness({ available, natural }: { available: number; natural: number }) {
  const [box, scale] = useFitScale();
  return (
    <>
      <div
        ref={(node) => {
          if (node !== null) {
            Object.defineProperty(node, "clientHeight", { value: available, configurable: true });
          }
          box(node);
        }}
      >
        {natural > 0 && (
          <div
            ref={(node) => {
              if (node !== null) {
                Object.defineProperty(node, "offsetHeight", { value: natural, configurable: true });
              }
            }}
          />
        )}
      </div>
      {/* 測る箱の外に置く。中に入れると「中身がまだ無い」状態を作れない */}
      <output>{scale}</output>
    </>
  );
}

const scaleOf = () => Number(screen.getByRole("status").textContent);

function setup(available: number, natural: number) {
  render(<Harness available={available} natural={natural} />);
  act(() => {
    observers.forEach((o) => o.cb());
  });
}

describe("useFitScale", () => {
  it("卓が使える高さより大きければ縮める", () => {
    setup(300, 600);

    expect(scaleOf()).toBe(0.5);
  });

  it("収まっているなら縮めない", () => {
    setup(800, 400);

    expect(scaleOf()).toBe(1);
  });

  it("中身がまだ無ければ等倍のまま", () => {
    setup(300, 0);

    expect(scaleOf()).toBe(1);
  });

  it("外したら観測をやめる", () => {
    const { unmount } = render(<Harness available={300} natural={600} />);

    unmount();

    expect(
      observers.every((o) => (o.disconnect as ReturnType<typeof vi.fn>).mock.calls.length > 0)
    ).toBe(true);
  });
});
