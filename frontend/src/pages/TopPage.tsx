import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createRoom, joinRoom } from "@/lib/api";
import { saveCredentials } from "@/lib/session";
import { ErrorMessage } from "@/components/ErrorMessage";
import { messageOf } from "@/lib/errors";

/** ルームコードは大文字で扱う。手入力の小文字も受け付ける */
const normalizeCode = (value: string) => value.trim().toUpperCase();

export function TopPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const enter = async (action: () => Promise<{ code: string }>) => {
    setError(null);
    setBusy(true);
    try {
      const room = await action();
      void navigate(`/rooms/${room.code}`);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  const onCreate = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === "") {
      setError("表示名を入力してください");
      return;
    }

    void enter(async () => {
      const created = await createRoom(name.trim());
      saveCredentials(created.code, created);
      return created;
    });
  };

  const onJoin = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === "") {
      setError("表示名を入力してください");
      return;
    }
    if (normalizeCode(code) === "") {
      setError("ルームコードを入力してください");
      return;
    }

    void enter(async () => {
      const roomCode = normalizeCode(code);
      saveCredentials(roomCode, await joinRoom(roomCode, name.trim(), false));
      return { code: roomCode };
    });
  };

  return (
    <main className="table-felt min-h-dvh px-6 py-10 text-emerald-50">
      <div className="mx-auto max-w-md">
        <div className="flex items-end justify-center gap-1" aria-hidden="true">
          <span className="card-back h-16 w-11 rotate-[-8deg] rounded border border-black/30 shadow-lg" />
          <span className="card-back h-16 w-11 rounded border border-black/30 shadow-lg" />
          <span className="card-back h-16 w-11 rotate-[8deg] rounded border border-black/30 shadow-lg" />
        </div>
        <h1 className="mt-6 text-center text-3xl font-bold tracking-wide text-amber-200">
          PUSHER TABLE
        </h1>
        <p className="mt-2 text-center text-sm text-emerald-50/70">
          メダルゲームのプッシャー台をカードとダイスで再現する、3〜4人用のボードゲーム。
        </p>

        <div className="mt-8 space-y-2">
          <label htmlFor="name" className="block text-sm font-medium">
            表示名
          </label>
          <input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={20}
            autoComplete="nickname"
            className="w-full rounded border border-white/20 bg-black/25 px-3 py-2 text-emerald-50 placeholder:text-emerald-50/40"
          />
        </div>

        <ErrorMessage message={error} />

        <form onSubmit={onCreate} className="mt-6">
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-amber-400 px-4 py-3 font-bold text-amber-950 shadow-[0_3px_0_#92400e] active:translate-y-0.5 active:shadow-[0_1px_0_#92400e] disabled:opacity-50"
          >
            ルームを作る
          </button>
        </form>

        <form onSubmit={onJoin} className="mt-8 space-y-2 border-t border-white/15 pt-6">
          <label htmlFor="code" className="block text-sm font-medium">
            ルームコード
          </label>
          <input
            id="code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            maxLength={6}
            autoCapitalize="characters"
            className="w-full rounded border border-white/20 bg-black/25 px-3 py-2 font-mono tracking-widest text-emerald-50 uppercase"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg border-2 border-emerald-50/50 px-4 py-3 font-bold text-emerald-50 disabled:opacity-50"
          >
            参加する
          </button>
        </form>
      </div>
    </main>
  );
}
