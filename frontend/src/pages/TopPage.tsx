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
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-3xl font-bold">PUSHER TABLE</h1>
      <p className="mt-2 text-sm text-gray-600">
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
          className="w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>

      <ErrorMessage message={error} />

      <form onSubmit={onCreate} className="mt-6">
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-gray-900 px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          ルームを作る
        </button>
      </form>

      <form onSubmit={onJoin} className="mt-8 space-y-2 border-t border-gray-200 pt-6">
        <label htmlFor="code" className="block text-sm font-medium">
          ルームコード
        </label>
        <input
          id="code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          maxLength={6}
          autoCapitalize="characters"
          className="w-full rounded border border-gray-300 px-3 py-2 font-mono tracking-widest uppercase"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded border border-gray-900 px-4 py-3 font-medium disabled:opacity-50"
        >
          参加する
        </button>
      </form>
    </main>
  );
}
