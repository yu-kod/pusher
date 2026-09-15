import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRoom } from "./useRoom";
import type { RoomView } from "@/lib/types";

const room: RoomView = { code: "ABCDEF", phase: "lobby", players: [], game: null };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useRoom", () => {
  it("読み込むとルームが入る", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(room) })
    );

    const { result } = renderHook(() => useRoom("ABCDEF", "t1"));

    await waitFor(() => expect(result.current.room).toEqual(room));
  });

  it("一定間隔で取り直す", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(room) });
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useRoom("ABCDEF", "t1"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1), { timeout: 3000 });
  });

  it("片付けたあとは state を触らない", async () => {
    let resolveFetch: ((value: unknown) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          })
      )
    );

    const { result, unmount } = renderHook(() => useRoom("ABCDEF", "t1"));
    unmount();
    resolveFetch?.({ ok: true, status: 200, json: () => Promise.resolve(room) });
    await Promise.resolve();

    expect(result.current.room).toBeNull();
  });

  it("片付けたあとのエラーも無視する", async () => {
    let rejectFetch: ((reason: unknown) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((_resolve, reject) => {
            rejectFetch = reject;
          })
      )
    );

    const { result, unmount } = renderHook(() => useRoom("ABCDEF", "t1"));
    unmount();
    rejectFetch?.(new TypeError("Failed to fetch"));
    await Promise.resolve();

    expect(result.current.error).toBeNull();
  });

  it("reload で取り直せる", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(room) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useRoom("ABCDEF", "t1"));
    await waitFor(() => expect(result.current.room).toEqual(room));

    await result.current.reload();

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("エラーを差し替えられる", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(room) })
    );

    const { result } = renderHook(() => useRoom("ABCDEF", "t1"));
    await waitFor(() => expect(result.current.room).toEqual(room));

    result.current.setError("だめ");

    await waitFor(() => expect(result.current.error).toBe("だめ"));
  });
});
