# pusher

メダルゲームのプッシャー台をカードとダイスで再現する、3〜4人用のボードゲーム。
ブラウザでオンライン対戦できる Web アプリとして実装する。

ゲームのルールは [docs/spec.md](docs/spec.md) を参照。

## 技術スタック

| レイヤー | 技術 |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Backend | Hono + TypeScript + DynamoDB（Lambda） |
| Realtime | API Gateway WebSocket API + HTTP ポーリング（フォールバック） |
| Infra | Terraform（S3 + CloudFront + API Gateway HTTP/WebSocket + Lambda + DynamoDB） |
| テスト | Vitest |

## プロジェクト構成

```
frontend/   — React SPA
backend/    — Hono API + WebSocket ハンドラ（Lambda デプロイ）
  src/game/ — ゲームエンジン（純粋関数。I/O を持たない）
infra/      — Terraform
docs/       — 仕様書
```

## 開発

### セットアップ

```bash
npm run install:all
npm run dev   # backend (3001) + frontend (5173) を同時起動
```

`frontend` の開発サーバーは `/api` と `/ws` を backend へプロキシする。

### バックエンド単体での起動

シミュレーション（#13）やAPIの動作確認は backend 単体で完結する。

```bash
cd backend && npm run dev
curl http://localhost:3001/api/health
```

### テスト

```bash
cd frontend && npm test
cd backend && npm test
```

いずれもカバレッジ 100% を閾値にしている。

### その他のコマンド

各パッケージで実行する。

```bash
npm run lint          # ESLint
npm run format        # Prettier（書き換え）
npm run format:check  # Prettier（チェックのみ）
npm run typecheck     # tsc --noEmit
```

## 依存パッケージのインストールについて

npm 10 の依存解決に既知の不具合があり、`vitest` の peer 依存でクラッシュする
（`Cannot read properties of null (reading 'edgesOut')`）。
そのため各パッケージの `package-lock.json` をコミットしている。
ロックファイルがある状態では通常の `npm install` で問題なくインストールできる。

ロックファイルを作り直す必要がある場合は `npm install --legacy-peer-deps` を使う。
その際 peer 依存が自動で入らないため、不足したパッケージは明示的に
`devDependencies` へ追加すること。

## CI

`main` への PR で `.github/workflows/ci.yml` が走る。変更のあったディレクトリだけを対象に、
frontend / backend では lint・format:check・typecheck・test（カバレッジ 100%）を、
frontend ではさらに build を、infra では `terraform fmt -check` と `terraform validate` を実行する。

必須ステータスチェックには集約ジョブ **`ci`** を1つだけ指定する。
`frontend` / `backend` / `infra` は変更検出で skip されることがあり、skipped は success に
ならないため、個別に必須チェックへ指定すると該当ディレクトリを触っていないPRが
マージできなくなる。

## 開発ルール

[CLAUDE.md](CLAUDE.md) を参照。チケット管理・ブランチ戦略・コミット規約・PRマージの流れを定めている。

## ライセンス

Private
