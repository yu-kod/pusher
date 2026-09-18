import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRoom } from "./useRoom";
import type { RoomView } from "@/lib/types";

const room: RoomView = {
  code: "ABCDEF",
  rev: 1,
  phase: "lobby",
  players: [],
  game: null,
  tick: null,
};

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

describe("useRoom — WebSocket での同期（#15）", () => {
  /** jsdom には繋ぎ先がないので、グローバルの WebSocket を差し替える */
  class FakeWebSocket {
    static last: FakeWebSocket | null = null;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onclose: (() => void) | null = null;

    constructor(readonly url: string) {
      FakeWebSocket.last = this;
    }

    send() {}
    close() {}
  }

  function stubAll(initial: RoomView = room) {
    FakeWebSocket.last = null;
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(initial) });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", FakeWebSocket);
    return fetchMock;
  }

  /** サーバーからの push を1つ流す */
  function push(next: RoomView) {
    FakeWebSocket.last?.onmessage?.({ data: JSON.stringify({ t: "room", room: next }) });
  }

  it("push で届いた更新をポーリングを待たずに反映する", async () => {
    stubAll();
    const { result } = renderHook(() => useRoom("ABCDEF", "t1"));
    await waitFor(() => expect(result.current.room).toEqual(room));

    const updated = { ...room, rev: 2, players: [{ id: "p1", name: "あき", isCpu: false }] };
    push(updated);

    await waitFor(() => expect(result.current.room).toEqual(updated));
  });

  it("手元より古いスナップショットは捨てる", async () => {
    stubAll({ ...room, rev: 5 });
    const { result } = renderHook(() => useRoom("ABCDEF", "t1"));
    await waitFor(() => expect(result.current.room?.rev).toBe(5));

    push({ ...room, rev: 4, phase: "playing" });

    await waitFor(() => expect(result.current.room?.phase).toBe("lobby"));
  });

  it("同じ rev の取り直しは受け入れる（同一ミリ秒の更新を落とさない）", async () => {
    stubAll();
    const { result } = renderHook(() => useRoom("ABCDEF", "t1"));
    await waitFor(() => expect(result.current.room).toEqual(room));

    push({ ...room, rev: 1, phase: "playing" });

    await waitFor(() => expect(result.current.room?.phase).toBe("playing"));
  });

  it("繋がっている間はポーリングの間隔を空ける", async () => {
    const fetchMock = stubAll();
    renderHook(() => useRoom("ABCDEF", "t1"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    FakeWebSocket.last?.onopen?.();

    // 繋がっていなければ 2 秒で取り直すが、繋がっている間は取り直さない
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("切れたらポーリングだけで進行を追える", async () => {
    const fetchMock = stubAll();
    renderHook(() => useRoom("ABCDEF", "t1"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    FakeWebSocket.last?.onopen?.();

    FakeWebSocket.last?.onclose?.();

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1), { timeout: 3000 });
  });

  it("画面を離れたら接続も閉じる", async () => {
    stubAll();
    const close = vi.fn();
    const { unmount } = renderHook(() => useRoom("ABCDEF", "t1"));
    await waitFor(() => expect(FakeWebSocket.last).not.toBeNull());
    FakeWebSocket.last!.close = close;

    unmount();

    expect(close).toHaveBeenCalled();
  });
});
