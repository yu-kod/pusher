/**
 * ルームの更新を受け取る WebSocket クライアント（docs/realtime.md §2, §5）。
 *
 * 送るのは `hello` だけ。手番のアクションは HTTP のまま（`lib/api.ts`）で、
 * ここは「状態が変わった」を受け取る口に徹する。
 *
 * ## 繋がらなくても遊べる
 *
 * このソケットは**ポーリングを速くするための仕組み**であって、前提ではない。
 * 繋がっているかどうかを `onConnected` で知らせ、呼び出し側がポーリングの間隔を
 * 変えるだけにしてある。WebSocket が使えない環境では、ただ間隔が縮まったままになる。
 */
import type { RoomView } from "./types";

/** backend の PROTOCOL_VERSION と合わせる */
const PROTOCOL_VERSION = 1;

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8_000;
/** 待ち時間に足す揺らぎの幅（±20%） */
const JITTER = 0.2;

/**
 * 繋ぎ直すまでの待ち時間。
 *
 * 揺らぎを足すのは、サーバーが再起動したときに全員が同時に殺到しないようにするため。
 */
export function reconnectDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
  return Math.round(base * (1 + (random() * 2 - 1) * JITTER));
}

/** テストから差し替えられるよう、使うところだけを型にする */
export type SocketLike = {
  send: (data: string) => void;
  close: () => void;
  onopen: (() => void) | null;
  onmessage: ((data: string) => void) | null;
  onclose: (() => void) | null;
};

export type RoomSocketOptions = {
  code: string;
  /** 省略すると観戦者として繋ぐ */
  token?: string;
  onRoom: (room: RoomView) => void;
  /** 繋がったか切れたか。ポーリングの間隔を変えるのに使う */
  onConnected: (connected: boolean) => void;
  createSocket?: (url: string) => SocketLike;
};

export type RoomSocket = { close: () => void };

/**
 * 繋ぎ先。
 *
 * ローカル開発は同じホストの `/ws`（vite が backend へプロキシする）。
 * 本番はビルド時に `VITE_WS_URL` で API Gateway の WebSocket API を渡す。
 * CloudFront は接続 URL にパスを付けられない WebSocket API を素通しできないので、
 * ここだけ同一オリジンにしない（docs/realtime.md §7）。
 *
 * 渡されていなければ同じホストへ繋ぐ。繋がらなければポーリングのままになるだけで、
 * 遊べなくはならない（§5）。
 */
function defaultUrl(): string {
  const configured = import.meta.env.VITE_WS_URL;
  if (configured !== undefined && configured !== "") {
    return configured;
  }
  const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${window.location.host}/ws`;
}

/** ブラウザの WebSocket を `SocketLike` に合わせる */
function browserSocket(url: string): SocketLike {
  const ws = new WebSocket(url);
  const socket: SocketLike = {
    send: (data) => ws.send(data),
    close: () => ws.close(),
    onopen: null,
    onmessage: null,
    onclose: null,
  };

  ws.onopen = () => socket.onopen?.();
  ws.onmessage = (event: MessageEvent) => socket.onmessage?.(String(event.data));
  ws.onclose = () => socket.onclose?.();

  return socket;
}

/** `room` メッセージなら中身を取り出す。それ以外は null */
function roomOf(raw: string): RoomView | null {
  try {
    const message = JSON.parse(raw) as { t?: string; room?: RoomView };
    return message.t === "room" && message.room !== undefined ? message.room : null;
  } catch {
    // 読めないメッセージで画面を落とさない
    return null;
  }
}

export function openRoomSocket(options: RoomSocketOptions): RoomSocket {
  const create = options.createSocket ?? ((url: string) => browserSocket(url));

  let stopped = false;
  let attempt = 0;
  let socket: SocketLike | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const connect = () => {
    const next = create(defaultUrl());
    socket = next;

    next.onopen = () => {
      attempt = 0;
      options.onConnected(true);
      next.send(
        JSON.stringify({
          t: "hello",
          v: PROTOCOL_VERSION,
          code: options.code,
          ...(options.token === undefined ? {} : { token: options.token }),
        })
      );
    };

    next.onmessage = (data) => {
      const room = roomOf(data);
      if (room !== null) {
        options.onRoom(room);
      }
    };

    next.onclose = () => {
      options.onConnected(false);
      if (stopped) {
        return;
      }
      timer = setTimeout(connect, reconnectDelayMs(attempt));
      attempt += 1;
    };
  };

  connect();

  return {
    close() {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
    },
  };
}
