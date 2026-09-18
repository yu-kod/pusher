import { useCallback, useEffect, useRef, useState } from "react";
import { fetchRoom } from "@/lib/api";
import { messageOf } from "@/lib/errors";
import { openRoomSocket } from "@/lib/roomSocket";
import type { RoomView } from "@/lib/types";

/**
 * ポーリングの間隔（docs/realtime.md §5）。
 *
 * WebSocket は**ポーリングを遅くするための仕組み**であって、前提ではない。
 * 繋がっていない間は今までどおり 2 秒で追い、繋がっている間は取りこぼしの保険として
 * だけ回す。こうしておくと「WebSocket が使えなければポーリングに落ちる」が
 * 分岐ではなく自然な帰結になり、フォールバックだけ動作確認が漏れる事故が起きない。
 */
const POLL_INTERVAL_MS = 2_000;
const POLL_INTERVAL_CONNECTED_MS = 15_000;

export type UseRoomResult = {
  room: RoomView | null;
  error: string | null;
  setError: (message: string | null) => void;
  /** 手番アクションのあとなど、すぐに取り直したいときに呼ぶ */
  reload: () => Promise<void>;
};

/**
 * ルームの状態を取得し、追い続ける。
 *
 * 状態は HTTP のレスポンスと WebSocket の push の2経路から届く。形は同じなので
 * 受け取り口だけ2つあり、どちらが新しいかは `rev` で決める。
 *
 * 取得はすべて非同期関数の中で行い、片付け済みなら state を触らない。
 * 画面を離れたあとに更新してしまうのを防ぐため。
 */
export function useRoom(code: string, token?: string): UseRoomResult {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  // 比較のためだけに持つ。再描画を起こしたくないので state にしない
  const revRef = useRef(-1);

  /** 追い越しで巻き戻らないよう、手元より古いものは捨てる */
  const accept = useCallback((next: RoomView) => {
    if (next.rev < revRef.current) {
      return;
    }
    revRef.current = next.rev;
    setRoom(next);
    setError(null);
  }, []);

  const load = useCallback(
    async (isActive: () => boolean) => {
      try {
        const next = await fetchRoom(code, token);
        if (isActive()) {
          accept(next);
        }
      } catch (cause) {
        if (isActive()) {
          setError(messageOf(cause));
        }
      }
    },
    [accept, code, token]
  );

  useEffect(() => {
    let cancelled = false;

    // サーバーの状態を取りに行く。まさに effect の用途（外部システムとの同期）だが、
    // load が非同期で setState するところまでは静的に追えないため、この行だけ規則を外す。
    // 片付け済みなら state を触らないので、カスケード再描画は起きない。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(() => !cancelled);

    return () => {
      cancelled = true;
    };
  }, [load]);

  // 取り直しの間隔は接続の有無で変える。繋がった瞬間に取り直す必要はない
  // （hello の応答としてスナップショットが届くため）
  useEffect(() => {
    let cancelled = false;
    const interval = connected ? POLL_INTERVAL_CONNECTED_MS : POLL_INTERVAL_MS;
    const timer = setInterval(() => void load(() => !cancelled), interval);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [load, connected]);

  useEffect(() => {
    const socket = openRoomSocket({ code, token, onRoom: accept, onConnected: setConnected });
    return () => socket.close();
  }, [accept, code, token]);

  const reload = useCallback(() => load(() => true), [load]);

  return { room, error, setError, reload };
}
