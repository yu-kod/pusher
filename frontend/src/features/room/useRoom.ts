import { useCallback, useEffect, useState } from "react";
import { fetchRoom } from "@/lib/api";
import { messageOf } from "@/lib/errors";
import type { RoomView } from "@/lib/types";

/** ロビーと対局の更新間隔。#15 の WebSocket が入るまではポーリングで追う */
const POLL_INTERVAL_MS = 2000;

export type UseRoomResult = {
  room: RoomView | null;
  error: string | null;
  setError: (message: string | null) => void;
  /** 手番アクションのあとなど、すぐに取り直したいときに呼ぶ */
  reload: () => Promise<void>;
};

/**
 * ルームの状態を取得し、一定間隔で追い続ける。
 *
 * 取得はすべて非同期関数の中で行い、片付け済みなら state を触らない。
 * 画面を離れたあとに更新してしまうのを防ぐため。
 */
export function useRoom(code: string, token?: string): UseRoomResult {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isActive: () => boolean) => {
      try {
        const next = await fetchRoom(code, token);
        if (isActive()) {
          setRoom(next);
          setError(null);
        }
      } catch (cause) {
        if (isActive()) {
          setError(messageOf(cause));
        }
      }
    },
    [code, token]
  );

  useEffect(() => {
    let cancelled = false;
    const isActive = () => !cancelled;

    // サーバーの状態をポーリングで同期する。まさに effect の用途（外部システムとの同期）だが、
    // load が非同期で setState するところまでは静的に追えないため、この行だけ規則を外す。
    // 片付け済みなら state を触らないので、カスケード再描画は起きない。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(isActive);
    const timer = setInterval(() => void load(isActive), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [load]);

  const reload = useCallback(() => load(() => true), [load]);

  return { room, error, setError, reload };
}
