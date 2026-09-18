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

/**
 * 宣言を送る（docs/realtime.md §8-4）。
 *
 * 1 宣言 = 1 POST。`key` は宣言ごとにクライアントが振る冪等キーで、通信が切れて
 * 再送しても二重に宣言されない。宣言どうしは互いに独立なので、やり直しても
 * 結果は変わらない。順番が意味を持つのは解決のときだけで、それは先行権が決める。
 *
 * 投入と「降りる」はどちらも宣言で、**同じ口へ送る。** 送り先が分かれていると、
 * どちらを選んだかが通信を見ただけで分かってしまう（§8-3）。
 */
export function declareInsert(
  code: string,
  token: string,
  tick: number,
  laneIndex: number,
  handIndex: number,
  key: string
): Promise<RoomView> {
  return request<RoomView>(
    `/api/rooms/${code}/ticks/${tick}/declarations`,
    {
      method: "POST",
      body: JSON.stringify({ kind: "insert", laneIndex, handIndexes: [handIndex], key }),
    },
    token
  );
}

/** 降りる宣言。未確定得点を確定して、そのラウンドから抜ける */
export function declareWithdraw(
  code: string,
  token: string,
  tick: number,
  key: string
): Promise<RoomView> {
  return request<RoomView>(
    `/api/rooms/${code}/ticks/${tick}/declarations`,
    { method: "POST", body: JSON.stringify({ kind: "withdraw", key }) },
    token
  );
}

/**
 * 締め切りを過ぎたときに進行を促す（docs/realtime.md §8-2）。
 *
 * Lambda には常駐プロセスが無いので、締め切りは「時刻」として状態に持ち、
 * 通りかかったリクエストが解決する。誰も操作していなくても止まらないよう、
 * クライアントが締め切りを過ぎたら1回だけ投げる。解決は冪等で、同時に何本
 * 届いても1回しか進まない。
 */
export function resolveTick(code: string, token: string, tick: number): Promise<RoomView> {
  return request<RoomView>(
    `/api/rooms/${code}/ticks/${tick}/resolve`,
    { method: "POST", body: "{}" },
    token
  );
}

/**
 * 自分の宣言を取り下げる。
 *
 * 宣言が自分にだけ見えているのは「確認と取り消しのため」（docs/realtime.md §8-3）。
 * 取り下げても他人に見えるのは `declared` が戻ることだけで、何を宣言していたかは
 * 最後まで伏せたまま。
 */
export function retractDeclaration(code: string, token: string, tick: number): Promise<RoomView> {
  return request<RoomView>(
    `/api/rooms/${code}/ticks/${tick}/declarations`,
    { method: "DELETE" },
    token
  );
}
