import { ApiError } from "./api";

/** 画面に出すメッセージを取り出す */
export function messageOf(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "通信に失敗しました";
}
