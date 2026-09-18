import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNow } from "./useNow";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useNow", () => {
  it("いまの時刻を返す", () => {
    const { result } = renderHook(() => useNow(true));

    expect(result.current).toBe(1_000_000);
  });

  it("時間が進むと、返す時刻も進む", () => {
    const { result } = renderHook(() => useNow(true));

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(result.current).toBe(1_001_000);
  });

  it("要らないときはタイマーを仕掛けない", () => {
    const set = vi.spyOn(globalThis, "setInterval");

    renderHook(() => useNow(false));

    // 手番制で遊んでいる間まで毎秒描き直さない
    expect(set).not.toHaveBeenCalled();
  });

  it("要るようになったら、その時点の時刻から動き出す", () => {
    const { result, rerender } = renderHook(({ active }) => useNow(active), {
      initialProps: { active: false },
    });

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    rerender({ active: true });

    expect(result.current).toBe(1_005_000);
  });

  it("要らなくなったら時計を止める", () => {
    const clear = vi.spyOn(globalThis, "clearInterval");
    const { unmount } = renderHook(() => useNow(true));

    unmount();

    expect(clear).toHaveBeenCalled();
  });
});
