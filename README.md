# pusher-table

メダルゲームのプッシャー台をカードとダイスで再現する、3〜4人用のボードゲーム。
タイトルは「プッシャー台」と、それを囲む「卓」の二重の意味。
ブラウザでオンライン対戦できる Web アプリとして実装する。

ゲームのルールは [docs/spec.md](docs/spec.md)、オンライン対戦の通信設計は [docs/realtime.md](docs/realtime.md) を参照。

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
  bootstrap/ — tfstate バケットと GitHub Actions 用 OIDC ロール（初回のみ手動 apply）
docs/       — 仕様書・デプロイ手順
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

### バランスシミュレーション

ゲームエンジンを直接回して `docs/spec.md` §7 の数値を測る。API もサーバーも要らない。

```bash
cd backend
npm run sim                                    # 既定値で 2000 ゲーム
npm run sim -- --games 5000                    # 回数を変える
npm run sim -- --preset pushHalf               # プリセットを重ねる（複数指定可）
npm run sim -- --preset singleLane --preset roundDraw3
npm run sim -- --strategy random               # 戦略を変える（既定は expectedValue）
npm run sim -- --players 3 --seed 7            # 人数とシードを指定する
```

同じシードなら同じ結果になる。出力される指標と目標値は `docs/spec.md` §7、実測結果の分析は `docs/design-notes.md` を参照。

プリセットの一覧は `backend/src/game/balance.ts` の `BALANCE_PRESETS` にある。

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

## デプロイ

`main` への push で `.github/workflows/deploy.yml` が Terraform apply → S3 sync →
CloudFront invalidation → 疎通確認を実行する。

認証は GitHub Actions の **OIDC** で行うため、長期の AWS アクセスキーは存在しない。
GitHub の Secrets に登録するのはロールの ARN（`AWS_ROLE_ARN`）だけ。

初回のみブートストラップ（tfstate バケット・ロックテーブル・OIDC ロールの作成）が必要だが、
**AWS CloudShell だけで完結するため PC は要らない**。手順は [docs/deploy.md](docs/deploy.md) を参照。

公開先は **https://pusher-table.yu-web.site**。`yu-web.site` の Route 53 ホストゾーンに
サブドメインをぶら下げている。`infra/variables.tf` の `domain_name` を空文字にすれば
CloudFront の既定ドメインでも公開できる。

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
