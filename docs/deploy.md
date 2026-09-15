# デプロイ

## 全体像

```
main へ push
  └─ .github/workflows/deploy.yml
       ├─ OIDC で AWS のロールを引き受ける（長期アクセスキーなし）
       ├─ npm run build:lambda   → backend/dist/lambda.js
       ├─ terraform apply        → S3 / CloudFront / API Gateway / Lambda
       ├─ npm run build:frontend → frontend/dist/
       ├─ aws s3 sync            → フロントエンドを S3 へ
       ├─ CloudFront のキャッシュ無効化
       └─ /api/health を叩いて疎通確認
```

## 構成

| リソース | 役割 |
|---|---|
| S3 | フロントエンドの静的ファイル。公開せず CloudFront の OAC 経由でのみ読ませる |
| CloudFront | 配信。`/api/*` は API Gateway、それ以外は S3 へ振り分ける |
| CloudFront Function | SPA のルーティング用。拡張子のないパスは `index.html` を返す |
| API Gateway (HTTP API) | `$default` ルートですべて Lambda へ流す（ルーティングは Hono 側） |
| Lambda | `hono/aws-lambda` の `handle()` で Hono アプリをそのまま動かす |

フロントエンドは同一オリジンの `/api/...` を叩けばよく、API の URL をビルドに埋め込む必要はない。

まだ無いもの（追加するチケット）:

- DynamoDB — ルーム API（#14）
- WebSocket API と `ws.js` ハンドラ — 状態同期（#15）
- Basic 認証用の CloudFront Function — 管理画面（#23）

---

## 初回だけ必要な作業

### 1. ブートストラップ（PC 不要）

tfstate の置き場所と、GitHub Actions が引き受けるロールを作る。**AWS マネジメントコンソールの CloudShell だけで完結する。**

CloudShell はコンソールにログインした権限がそのまま使われるため、アクセスキーの発行も `aws configure` も不要。

コンソール右上のターミナルアイコンから CloudShell を開いて、以下を実行する。

```bash
# Terraform を入れる（CloudShell には入っていない）
curl -fsSLo tf.zip https://releases.hashicorp.com/terraform/1.9.8/terraform_1.9.8_linux_amd64.zip
unzip -o tf.zip && mkdir -p ~/bin && mv terraform ~/bin/ && export PATH=$HOME/bin:$PATH

# ブートストラップを実行
git clone https://github.com/yu-kod/pusher.git
cd pusher/infra/bootstrap
terraform init
terraform apply
```

**同じ AWS アカウントで既に別プロジェクトが GitHub Actions の OIDC を使っている場合**、OIDC プロバイダーはアカウントに1つしか作れないため、既存のものを参照する必要がある。

```bash
aws iam list-open-id-connect-providers
```

出力に `token.actions.githubusercontent.com` が含まれていたら、`apply` をこう変える。

```bash
terraform apply -var create_github_oidc_provider=false
```

apply が終わると3つの値が出力される。

```
github_actions_role_arn = "arn:aws:iam::123456789012:role/pusher-github-actions"
tfstate_bucket          = "pusher-tfstate"
tfstate_lock_table      = "pusher-tfstate-lock"
```

このディレクトリに残る `terraform.tfstate` は捨ててよい。作られるリソースは `prevent_destroy` 済みで、以後この構成を変えることはほぼない。

### 2. GitHub の Secrets に登録

リポジトリの Settings → Secrets and variables → Actions で登録する。

| 名前 | 値 |
|---|---|
| `AWS_ROLE_ARN` | 上で出力された `github_actions_role_arn` |

**これだけ。** アクセスキーもシークレットキーも登録しない。GitHub Actions は OIDC で一時認証情報を得るため、長期の認証情報はどこにも存在しない。

### 3. デプロイ

`main` へ push すれば走る。手動で起動する場合は Actions タブから Deploy workflow を `workflow_dispatch` で実行する。

初回は CloudFront ディストリビューションの作成に 5〜10 分かかる。

---

## カスタムドメイン

既定では CloudFront の既定ドメイン（`xxxxxxxx.cloudfront.net`）で公開する。**ドメインを用意しなくてもデプロイできる。**

独自ドメインを使う場合は `infra/variables.tf` の既定値を変えるか、`terraform.tfvars` を置く。

```hcl
domain_name      = "pusher.example.com"
hosted_zone_name = "example.com"
```

`hosted_zone_name` は Route 53 のホストゾーンとして既に存在している必要がある。設定すると ACM 証明書（us-east-1）と Route 53 のレコードが自動で作られる。

---

## 困ったとき

### `Not authorized to perform sts:AssumeRoleWithWebIdentity`

リポジトリや owner を過去にリネームしていると、OIDC トークンの `sub` クレームが
`repo:owner@ownerId/repo@repoId:...` という ID 付きの形式で発行されることがある。

CloudTrail で実際の `sub` を確認し、`infra/bootstrap/main.tf` の
`token.actions.githubusercontent.com:sub` のリストに追加する。

### Terraform のロックが残った

デプロイが途中で落ちるとロックが残ることがある。エラーメッセージに出る Lock ID を使って解除する。

```bash
terraform -chdir=infra force-unlock <LOCK_ID>
```

### CloudFront に反映されない

キャッシュ無効化は deploy.yml が毎回行うが、反映まで数分かかる。ブラウザのキャッシュも疑うこと。
