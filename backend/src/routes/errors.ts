/**
 * API のエラー表現。
 *
 * レスポンスは `{ "error": { "code": "...", "message": "..." } }` で統一する
 * （.claude/skills/coding-standards.md「API 設計」）。
 */
import type { ContentfulStatusCode } from "hono/utils/http-status";

export class ApiError extends Error {
  constructor(
    readonly statusCode: ContentfulStatusCode,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** リクエストの形式が不正（zod の検証に落ちた等） */
export const validationError = (message: string) => new ApiError(400, "VALIDATION_ERROR", message);

/** トークンが提示されていない */
export const unauthorized = () => new ApiError(401, "UNAUTHORIZED", "このルームのトークンが必要");

/** トークンがこのルームのものではない */
export const forbidden = (message: string) => new ApiError(403, "FORBIDDEN", message);

export const roomNotFound = (code: string) =>
  new ApiError(404, "ROOM_NOT_FOUND", `ルームが見つからない: ${code}`);

/**
 * 保存先の状態が読んだときから変わっていて書き込めなかった。
 *
 * クライアントは状態を取り直してからやり直す。
 */
export const roomConflict = (message: string) => new ApiError(409, "ROOM_CONFLICT", message);

/** 形式は正しいが、ゲームのルール上できない操作 */
export const unprocessable = (message: string) => new ApiError(422, "UNPROCESSABLE", message);

/** 例外からメッセージを取り出す。Error でないものが投げられても落ちないように */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
