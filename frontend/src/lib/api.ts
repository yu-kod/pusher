/**
 * バックエンドの API クライアント。
 *
 * サーバー権威型なので、クライアントは「何をしたいか」を送って、返ってきた
 * マスク済みの状態を表示するだけ。勝敗や成否の判定は持たない。
 */
import type { Credentials, RoomView } from "./types";

/** サーバーが返すエラー形式（{ error: { code, message } }）に対応する */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ErrorBody = { error?: { code?: string; message?: string } };

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token !== undefined) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    // エラー本文が読めない場合（502 で HTML が返る等）でも例外は投げる
    const body = (await res.json().catch(() => ({}))) as ErrorBody;
    throw new ApiError(
      body.error?.code ?? "UNKNOWN",
      body.error?.message ?? "通信に失敗しました",
      res.status
    );
  }

  return (await res.json()) as T;
}

export type CreatedRoom = Credentials & { code: string };

export function createRoom(name: string): Promise<CreatedRoom> {
  return request<CreatedRoom>("/api/rooms", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function joinRoom(code: string, name: string, isCpu: boolean): Promise<Credentials> {
  return request<Credentials>(`/api/rooms/${code}/players`, {
    method: "POST",
    body: JSON.stringify({ name, isCpu }),
  });
}

export function fetchRoom(code: string, token?: string): Promise<RoomView> {
  return request<RoomView>(`/api/rooms/${code}`, { method: "GET" }, token);
}

export function startGame(code: string, token: string): Promise<RoomView> {
  return request<RoomView>(`/api/rooms/${code}/start`, { method: "POST", body: "{}" }, token);
}

export function removeCpu(code: string, playerId: string, token: string): Promise<RoomView> {
  return request<RoomView>(`/api/rooms/${code}/players/${playerId}`, { method: "DELETE" }, token);
}
