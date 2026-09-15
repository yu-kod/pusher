/**
 * 参加情報（プレイヤーID とトークン）の保存。
 *
 * アカウントを作らせないので、ルームへ参加したときに受け取ったトークンを
 * ブラウザに持っておく。これがないとリロードで自分が誰か分からなくなる。
 *
 * プライベートウィンドウやサイトデータのブロックで localStorage が使えないことが
 * あるため、読み書きはすべて例外を飲み込む。使えなくても「参加しなおす」だけで動く。
 */
import type { Credentials } from "./types";

const keyOf = (code: string) => `pusher-table:room:${code}`;

function isCredentials(value: unknown): value is Credentials {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { playerId, token } = value as Record<string, unknown>;
  return typeof playerId === "string" && typeof token === "string";
}

export function loadCredentials(code: string): Credentials | null {
  try {
    const stored = localStorage.getItem(keyOf(code));
    if (stored === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(stored);
    return isCredentials(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCredentials(code: string, credentials: Credentials): void {
  try {
    localStorage.setItem(keyOf(code), JSON.stringify(credentials));
  } catch {
    // 保存できなくても、そのセッションのあいだは state で持っているので動く
  }
}

export function clearCredentials(code: string): void {
  try {
    localStorage.removeItem(keyOf(code));
  } catch {
    // 消せなくても実害はない
  }
}
