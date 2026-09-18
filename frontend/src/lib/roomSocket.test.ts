import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openRoomSocket, reconnectDelayMs, type SocketLike } from "./roomSocket";
import type { RoomView } from "./types";

/** 手で開閉できる差し替え用ソケット */
function fakeSocket() {
  const sent: string[] = [];
  const socket: SocketLike & { url: string } = {
    url: "",
    send: (data: string) => sent.push(data),
    close: () => undefined,
    onopen: null,
    onmessage: null,
    onclose: null,
  };
  return { socket, sent };
}

const room = (rev: number): RoomView => ({
  code: "ABC234",
  rev,
  phase: "lobby",
  players: [],
  game: null,
});

describe("reconnectDelayMs", () => {
  it("試行のたびに倍にしていく", () => {
    const noJitter = () => 0.5;

    expect(reconnectDelayMs(0, noJitter)).toBe(500);
    expect(reconnectDelayMs(1, noJitter)).toBe(1000);
    expect(reconnectDelayMs(2, noJitter)).toBe(2000);
  });

  it("上限で頭打ちにする", () => {
    expect(reconnectDelayMs(20, () => 0.5)).toBe(8000);
  });

  it("揺らぎを足す（再起動時に全員が同時に殺到しないように）", () => {
    expect(reconnectDelayMs(0, () => 0)).toBe(400);
    expect(reconnectDelayMs(0, () => 1)).toBe(600);
  });
});

describe("openRoomSocket", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function open(overrides: Partial<Parameters<typeof openRoomSocket>[0]> = {}) {
    const sockets: ReturnType<typeof fakeSocket>[] = [];
    const onRoom = vi.fn();
    const onConnected = vi.fn();
    const handle = openRoomSocket({
      code: "ABC234",
      token: "tk",
      onRoom,
      onConnected,
      createSocket: (url) => {
        const created = fakeSocket();
        created.socket.url = url;
        sockets.push(created);
        return created.socket;
      },
      ...overrides,
    });
    return { sockets, onRoom, onConnected, handle, latest: () => sockets[sockets.length - 1]! };
  }

  it("繋がったら hello を送る", () => {
    const { latest } = open();

    latest().socket.onopen?.();

    expect(JSON.parse(latest().sent[0]!)).toMatchObject({
      t: "hello",
      code: "ABC234",
      token: "tk",
    });
  });

  it("トークンがなければ観戦者として繋ぐ", () => {
    const { latest } = open({ token: undefined });

    latest().socket.onopen?.();

    expect(JSON.parse(latest().sent[0]!)).not.toHaveProperty("token");
  });

  it("room メッセージを受け取ったら渡す", () => {
    const { latest, onRoom } = open();

    latest().socket.onmessage?.(JSON.stringify({ t: "room", room: room(1) }));

    expect(onRoom).toHaveBeenCalledWith(room(1));
  });

  it("room 以外のメッセージは無視する", () => {
    const { latest, onRoom } = open();

    latest().socket.onmessage?.(JSON.stringify({ t: "welcome", playerId: "p1" }));
    latest().socket.onmessage?.(JSON.stringify({ t: "error", code: "FORBIDDEN" }));

    expect(onRoom).not.toHaveBeenCalled();
  });

  it("壊れたメッセージが来ても落ちない", () => {
    const { latest, onRoom } = open();

    expect(() => latest().socket.onmessage?.("{")).not.toThrow();
    expect(onRoom).not.toHaveBeenCalled();
  });

  it("接続の有無を知らせる（ポーリングの間隔を変えるため）", () => {
    const { latest, onConnected } = open();

    latest().socket.onopen?.();
    expect(onConnected).toHaveBeenLastCalledWith(true);

    latest().socket.onclose?.();
    expect(onConnected).toHaveBeenLastCalledWith(false);
  });

  it("切れたら待ってから繋ぎ直す", () => {
    const { sockets, latest } = open();

    latest().socket.onclose?.();
    expect(sockets).toHaveLength(1);

    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);
  });

  it("繋ぎ直しに失敗し続けたら待ち時間を延ばす", () => {
    const { sockets, latest } = open();

    latest().socket.onclose?.();
    vi.advanceTimersByTime(1000);
    latest().socket.onclose?.();
    vi.advanceTimersByTime(700);

    // 1回目より長く待っているので、まだ繋ぎ直していない
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(3);
  });

  it("一度繋がれば待ち時間は最初に戻る", () => {
    const { sockets, latest } = open();

    latest().socket.onclose?.();
    vi.advanceTimersByTime(1000);
    latest().socket.onopen?.();
    latest().socket.onclose?.();
    vi.advanceTimersByTime(1000);

    expect(sockets).toHaveLength(3);
  });

  it("閉じたあとは繋ぎ直さない", () => {
    const { sockets, latest, handle } = open();

    handle.close();
    latest().socket.onclose?.();
    vi.advanceTimersByTime(60_000);

    expect(sockets).toHaveLength(1);
  });

  it("閉じるときにソケットも閉じる", () => {
    const { latest, handle } = open();
    const close = vi.fn();
    latest().socket.close = close;

    handle.close();

    expect(close).toHaveBeenCalled();
  });
});

describe("ブラウザの WebSocket を使う場合", () => {
  /** jsdom には繋ぎ先がないので、グローバルの WebSocket を差し替える */
  class FakeWebSocket {
    static last: FakeWebSocket | null = null;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onclose: (() => void) | null = null;
    sent: string[] = [];
    closed = false;

    constructor(readonly url: string) {
      FakeWebSocket.last = this;
    }

    send(data: string) {
      this.sent.push(data);
    }

    close() {
      this.closed = true;
    }
  }

  beforeEach(() => {
    FakeWebSocket.last = null;
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("同じホストの /ws へ繋ぎ、hello を送る", () => {
    const handle = openRoomSocket({ code: "ABC234", onRoom: vi.fn(), onConnected: vi.fn() });
    const ws = FakeWebSocket.last!;

    ws.onopen?.();

    expect(ws.url).toBe(`ws://${window.location.host}/ws`);
    expect(JSON.parse(ws.sent[0]!)).toMatchObject({ t: "hello", code: "ABC234" });
    handle.close();
    expect(ws.closed).toBe(true);
  });

  it("https のページからは wss で繋ぐ", () => {
    vi.spyOn(window, "location", "get").mockReturnValue({
      protocol: "https:",
      host: "pusher-table.example",
    } as Location);

    openRoomSocket({ code: "ABC234", onRoom: vi.fn(), onConnected: vi.fn() }).close();

    expect(FakeWebSocket.last!.url).toBe("wss://pusher-table.example/ws");
  });

  it("届いたメッセージを渡す", () => {
    const onRoom = vi.fn();
    const handle = openRoomSocket({ code: "ABC234", onRoom, onConnected: vi.fn() });

    FakeWebSocket.last!.onmessage?.({ data: JSON.stringify({ t: "room", room: room(3) }) });

    expect(onRoom).toHaveBeenCalledWith(room(3));
    handle.close();
  });

  it("切れたことを知らせる", () => {
    const onConnected = vi.fn();
    const handle = openRoomSocket({ code: "ABC234", onRoom: vi.fn(), onConnected });

    FakeWebSocket.last!.onclose?.();

    expect(onConnected).toHaveBeenCalledWith(false);
    handle.close();
  });
});
