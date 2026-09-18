import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "./simulation";
import { usePusherTable } from "./usePusherTable";

/**
 * requestAnimationFrame を手で進められるようにする。
 * フックは毎フレーム次のコールバックを登録し直すので、先頭から1つずつ取り出す。
 */
function controlFrames() {
  const pending: FrameRequestCallback[] = [];
  const cancelled: number[] = [];
  let handle = 0;

  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    pending.push(callback);
    handle += 1;
    return handle;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    cancelled.push(id);
  });

  return {
    cancelled,
    /** 指定した時刻で1フレーム進める */
    advance(now: number) {
      const callback = pending.shift();
      act(() => {
        callback?.(now);
      });
    },
    /** `seconds` 秒ぶんを 60fps で進める */
    run(seconds: number, from = 0) {
      const frames = Math.round(seconds * 60);
      for (let i = 0; i <= frames; i += 1) {
        this.advance(from + (i * 1000) / 60);
      }
      return from + (frames * 1000) / 60;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("usePusherTable", () => {
  it("最初から台にコインが積まれている", () => {
    controlFrames();
    const { result } = renderHook(() => usePusherTable({ rng: () => 0.5, initialCoins: 10 }));
    expect(result.current.table.coins).toHaveLength(10);
  });

  it("引数を省いても台が立ち上がる", () => {
    controlFrames();
    const { result } = renderHook(() => usePusherTable());
    expect(result.current.table.coins.length).toBeGreaterThan(0);
  });

  it("フレームが進むと時間が進む", () => {
    const frames = controlFrames();
    const { result } = renderHook(() => usePusherTable({ rng: () => 0.5, initialCoins: 0 }));

    frames.run(0.5);
    expect(result.current.table.time).toBeGreaterThan(0);
  });

  it("最初のフレームは基準時刻を取るだけで進めない", () => {
    const frames = controlFrames();
    const { result } = renderHook(() => usePusherTable({ rng: () => 0.5, initialCoins: 0 }));

    frames.advance(0);
    expect(result.current.table.time).toBe(0);
  });

  it("タブが止まっていた間の時間をまとめて進めない", () => {
    const frames = controlFrames();
    const { result } = renderHook(() => usePusherTable({ rng: () => 0.5, initialCoins: 0 }));

    frames.advance(0);
    frames.advance(60_000);
    expect(result.current.table.time).toBeLessThan(1);
  });

  it("投入するとコインが増えて手持ちが減る", () => {
    controlFrames();
    const { result } = renderHook(() => usePusherTable({ rng: () => 0.5, initialCoins: 0 }));

    act(() => {
      result.current.drop(50);
    });

    expect(result.current.table.coins).toHaveLength(1);
    expect(result.current.table.purse).toBe(DEFAULT_CONFIG.initialPurse - 1);
  });

  it("落下口から落ちると得点の演出が出て、やがて消える", () => {
    const frames = controlFrames();
    const { result } = renderHook(() =>
      usePusherTable({
        rng: () => 0.5,
        initialCoins: 0,
        // 台を浅く・板を速くして、投入したコインがすぐ落下口へ届くようにする
        config: {
          ...DEFAULT_CONFIG,
          depth: DEFAULT_CONFIG.spawnDepth,
          pusherStroke: 60,
          pusherPeriod: 1,
        },
      })
    );

    act(() => {
      result.current.drop(50);
    });

    const now = frames.run(1.2);
    expect(result.current.bursts.length).toBeGreaterThan(0);
    expect(result.current.table.score).toBeGreaterThan(0);

    frames.run(1.5, now);
    expect(result.current.bursts).toHaveLength(0);
  });

  it("アンマウントするとフレームの予約を取り消す", () => {
    const frames = controlFrames();
    const { unmount } = renderHook(() => usePusherTable({ rng: () => 0.5, initialCoins: 0 }));

    unmount();
    expect(frames.cancelled.length).toBeGreaterThan(0);
  });
});
