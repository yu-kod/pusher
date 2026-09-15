import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { joinRoom, removeCpu, startGame } from "@/lib/api";
import { loadCredentials, saveCredentials } from "@/lib/session";
import { messageOf } from "@/lib/errors";
import { ErrorMessage } from "@/components/ErrorMessage";
import { useRoom } from "@/features/room/useRoom";
import type { Credentials, RoomView } from "@/lib/types";

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 4;

export function LobbyPage() {
  const code = (useParams().code ?? "").toUpperCase();
  const [credentials, setCredentials] = useState<Credentials | null>(() => loadCredentials(code));
  const { room, error, setError, reload } = useRoom(code, credentials?.token);

  if (room === null) {
    return (
      <main className="mx-auto max-w-md p-6">
        <ErrorMessage message={error} />
        {error === null && <p className="text-gray-600">読み込み中…</p>}
      </main>
    );
  }

  if (credentials === null) {
    return (
      <JoinForm
        code={code}
        onJoined={(joined) => {
          saveCredentials(code, joined);
          setCredentials(joined);
        }}
      />
    );
  }

  return (
    <Lobby
      code={code}
      room={room}
      credentials={credentials}
      error={error}
      setError={setError}
      reload={reload}
    />
  );
}

type JoinFormProps = { code: string; onJoined: (credentials: Credentials) => void };

/** 招待 URL から来た人向け。ルームコードは URL から決まっている */
function JoinForm({ code, onJoined }: JoinFormProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === "") {
      setError("表示名を入力してください");
      return;
    }

    void (async () => {
      try {
        onJoined(await joinRoom(code, name.trim(), false));
      } catch (cause) {
        setError(messageOf(cause));
      }
    })();
  };

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-bold">ルーム {code} に参加</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-2">
        <label htmlFor="join-name" className="block text-sm font-medium">
          表示名
        </label>
        <input
          id="join-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={20}
          className="w-full rounded border border-gray-300 px-3 py-2"
        />
        <ErrorMessage message={error} />
        <button
          type="submit"
          className="w-full rounded bg-gray-900 px-4 py-3 font-medium text-white"
        >
          参加する
        </button>
      </form>
    </main>
  );
}

type LobbyProps = {
  code: string;
  room: RoomView;
  credentials: Credentials;
  error: string | null;
  setError: (message: string | null) => void;
  reload: () => Promise<void>;
};

function Lobby({ code, room, credentials, error, setError, reload }: LobbyProps) {
  const [copied, setCopied] = useState(false);
  const canStart = room.players.length >= MIN_PLAYERS && room.players.length <= MAX_PLAYERS;
  const isFull = room.players.length >= MAX_PLAYERS;

  const run = (action: () => Promise<unknown>) => {
    void (async () => {
      try {
        await action();
        await reload();
      } catch (cause) {
        setError(messageOf(cause));
      }
    })();
  };

  const inviteUrl = `${window.location.origin}/rooms/${code}`;

  const copyInvite = () => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(inviteUrl);
        setCopied(true);
      } catch {
        // クリップボードが使えない環境では URL をそのまま読んでもらう
        setError("コピーできませんでした。URL を手動でコピーしてください");
      }
    })();
  };

  if (room.phase === "playing") {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-2xl font-bold">ゲーム中</h1>
        <p className="mt-2 text-gray-600">対局画面は準備中です。</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-sm font-medium text-gray-600">ルームコード</h1>
      <p className="font-mono text-4xl font-bold tracking-widest">{code}</p>

      <button
        type="button"
        onClick={copyInvite}
        className="mt-3 rounded border border-gray-300 px-3 py-1.5 text-sm"
      >
        {copied ? "コピーしました" : "招待URLをコピー"}
      </button>

      <h2 className="mt-8 text-sm font-medium text-gray-600">
        参加者 {room.players.length} / {MAX_PLAYERS}
      </h2>
      <ul className="mt-2 divide-y divide-gray-200 rounded border border-gray-200">
        {room.players.map((player) => (
          <li key={player.id} className="flex items-center justify-between px-3 py-2">
            <span>
              {player.name}
              {player.id === credentials.playerId && (
                <span className="ml-2 text-xs text-gray-500">（あなた）</span>
              )}
              {player.isCpu && <span className="ml-2 text-xs text-gray-500">CPU</span>}
            </span>
            {player.isCpu && (
              <button
                type="button"
                onClick={() => run(() => removeCpu(code, player.id, credentials.token))}
                className="text-sm text-red-700"
                aria-label={`${player.name} を外す`}
              >
                外す
              </button>
            )}
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={isFull}
        onClick={() => run(() => joinRoom(code, `CPU${room.players.length}`, true))}
        className="mt-3 w-full rounded border border-gray-300 px-4 py-2 text-sm disabled:opacity-50"
      >
        CPU を追加
      </button>

      <ErrorMessage message={error} />

      <button
        type="button"
        disabled={!canStart}
        onClick={() => run(() => startGame(code, credentials.token))}
        className="mt-8 w-full rounded bg-gray-900 px-4 py-3 font-medium text-white disabled:opacity-50"
      >
        ゲームを開始
      </button>
      {!canStart && (
        <p className="mt-2 text-center text-sm text-gray-500">
          {MIN_PLAYERS}〜{MAX_PLAYERS}人で開始できます
        </p>
      )}
    </main>
  );
}
