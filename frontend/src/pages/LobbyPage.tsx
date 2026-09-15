import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { joinRoom, removeCpu, startGame } from "@/lib/api";
import { loadCredentials, saveCredentials } from "@/lib/session";
import { messageOf } from "@/lib/errors";
import { ErrorMessage } from "@/components/ErrorMessage";
import { useRoom } from "@/features/room/useRoom";
import { GameBoard } from "@/features/game/GameBoard";
import type { Credentials, RoomView } from "@/lib/types";

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 4;

export function LobbyPage() {
  const code = (useParams().code ?? "").toUpperCase();
  const [credentials, setCredentials] = useState<Credentials | null>(() => loadCredentials(code));
  const { room, error, setError, reload } = useRoom(code, credentials?.token);

  if (room === null) {
    return (
      <main className="table-felt min-h-dvh px-6 py-10 text-emerald-50">
        <div className="mx-auto max-w-md">
          <ErrorMessage message={error} />
          {error === null && <p className="text-emerald-50/70">読み込み中…</p>}
        </div>
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

  if (room.game !== null) {
    return <GameBoard code={code} game={room.game} credentials={credentials} reload={reload} />;
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
    <main className="table-felt min-h-dvh px-6 py-10 text-emerald-50">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold text-amber-200">ルーム {code} に参加</h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-2">
          <label htmlFor="join-name" className="block text-sm font-medium">
            表示名
          </label>
          <input
            id="join-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={20}
            className="w-full rounded border border-white/20 bg-black/25 px-3 py-2 text-emerald-50"
          />
          <ErrorMessage message={error} />
          <button
            type="submit"
            className="w-full rounded-lg bg-amber-400 px-4 py-3 font-bold text-amber-950 shadow-[0_3px_0_#92400e] active:translate-y-0.5"
          >
            参加する
          </button>
        </form>
      </div>
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

  return (
    <main className="table-felt min-h-dvh px-6 py-10 text-emerald-50">
      <div className="mx-auto max-w-md">
        <h1 className="text-xs font-medium tracking-wider text-emerald-50/60">ルームコード</h1>
        <p className="mt-1 inline-block rounded-lg bg-black/35 px-4 py-2 font-mono text-4xl font-bold tracking-widest text-amber-200">
          {code}
        </p>

        <button
          type="button"
          onClick={copyInvite}
          className="mt-3 block rounded border border-white/25 px-3 py-1.5 text-sm"
        >
          {copied ? "コピーしました" : "招待URLをコピー"}
        </button>

        <h2 className="mt-8 text-xs font-medium tracking-wider text-emerald-50/60">
          参加者 {room.players.length} / {MAX_PLAYERS}
        </h2>
        <ul className="mt-2 divide-y divide-white/10 overflow-hidden rounded-lg bg-black/25">
          {room.players.map((player) => (
            <li key={player.id} className="flex items-center justify-between px-3 py-2">
              <span>
                {player.name}
                {player.id === credentials.playerId && (
                  <span className="ml-2 text-xs text-emerald-50/50">（あなた）</span>
                )}
                {player.isCpu && <span className="ml-2 text-xs text-emerald-50/50">CPU</span>}
              </span>
              {player.isCpu && (
                <button
                  type="button"
                  onClick={() => run(() => removeCpu(code, player.id, credentials.token))}
                  className="text-sm text-red-300"
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
          className="mt-3 w-full rounded-lg border border-white/25 px-4 py-2 text-sm disabled:opacity-50"
        >
          CPU を追加
        </button>

        <ErrorMessage message={error} />

        <button
          type="button"
          disabled={!canStart}
          onClick={() => run(() => startGame(code, credentials.token))}
          className="mt-8 w-full rounded-lg bg-amber-400 px-4 py-3 font-bold text-amber-950 shadow-[0_3px_0_#92400e] active:translate-y-0.5 active:shadow-[0_1px_0_#92400e] disabled:opacity-50"
        >
          ゲームを開始
        </button>
        {!canStart && (
          <p className="mt-2 text-center text-sm text-emerald-50/60">
            {MIN_PLAYERS}〜{MAX_PLAYERS}人で開始できます
          </p>
        )}
      </div>
    </main>
  );
}
