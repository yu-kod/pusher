# ブートストラップ。
#
# 本体（infra/）の Terraform が動くための土台だけを作る。
#   - tfstate 用の S3 バケット
#   - tfstate ロック用の DynamoDB テーブル
#   - GitHub Actions が OIDC で引き受ける IAM ロール
#
# ここだけは tfstate の置き場所がまだ存在しないためローカル state で実行する。
# 生成された terraform.tfstate は捨ててよい（作られるリソースは prevent_destroy 済み、
# かつ以後この構成を変更することはほぼない）。
#
# ## 実行方法（PC 不要）
#
# AWS マネジメントコンソールの CloudShell で実行できる。コンソールにログインした
# 権限がそのまま使われるため、アクセスキーの発行も aws configure も不要。
#
#   # CloudShell を開く（画面右上のターミナルアイコン）
#   curl -fsSLo tf.zip https://releases.hashicorp.com/terraform/1.9.8/terraform_1.9.8_linux_amd64.zip
#   unzip tf.zip && mkdir -p ~/bin && mv terraform ~/bin/ && export PATH=$HOME/bin:$PATH
#   git clone https://github.com/yu-kod/pusher.git
#   cd pusher/infra/bootstrap
#   terraform init && terraform apply
#
# apply 後、出力された github_actions_role_arn を GitHub の
# Settings → Secrets and variables → Actions に AWS_ROLE_ARN として登録する。

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = var.project_name
      ManagedBy = "terraform"
    }
  }
}

variable "aws_region" {
  description = "AWS リージョン"
  type        = string
  default     = "ap-northeast-1"
}

variable "project_name" {
  description = "リソース名の接頭辞"
  type        = string
  default     = "pusher"
}

variable "github_repo" {
  description = "このロールを引き受けられる GitHub リポジトリ（owner/repo）"
  type        = string
  default     = "yu-kod/pusher"
}

variable "create_github_oidc_provider" {
  description = <<-DESC
    GitHub Actions 用の OIDC プロバイダーを作るか。

    OIDC プロバイダーは AWS アカウントに1つだけ存在できる。同じアカウントで
    すでに別プロジェクトが GitHub Actions から OIDC を使っている場合は false にする。

    確認方法:
      aws iam list-open-id-connect-providers
    出力に token.actions.githubusercontent.com が含まれていれば false。
  DESC
  type        = bool
  default     = true
}

# ---- tfstate の置き場所 ----

resource "aws_s3_bucket" "tfstate" {
  bucket = "${var.project_name}-tfstate"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "tfstate_lock" {
  name         = "${var.project_name}-tfstate-lock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}

# ---- GitHub Actions の OIDC ----

resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 1 : 0

  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  # 現在は AWS 側がルート CA を検証するため thumbprint は実質使われないが、
  # API が必須項目として要求するため GitHub の中間 CA の値を渡す。
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 0 : 1

  url = "https://token.actions.githubusercontent.com"
}

locals {
  github_oidc_arn = var.create_github_oidc_provider ? one(aws_iam_openid_connect_provider.github[*].arn) : one(data.aws_iam_openid_connect_provider.github[*].arn)
}

resource "aws_iam_role" "github_actions" {
  name        = "${var.project_name}-github-actions"
  description = "GitHub Actions が OIDC で引き受けるデプロイ用ロール"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = local.github_oidc_arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          # このリポジトリのどのブランチ・タグからでも引き受けられる。
          #
          # なお、リポジトリや owner を過去にリネームしていると、OIDC トークンの
          # sub クレームが `repo:owner@ownerId/repo@repoId:...` という ID 付きの
          # 形式で発行されることがある。その場合ここにマッチせず
          # "Not authorized to perform sts:AssumeRoleWithWebIdentity" になるため、
          # CloudTrail で実際の sub を確認してこのリストに追加する。
          "token.actions.githubusercontent.com:sub" = ["repo:${var.github_repo}:*"]
        }
      }
    }]
  })
}

# Terraform apply は IAM ロール・CloudFront・Lambda・API Gateway を作るため広い権限が要る。
# 個人プロジェクトなので AdministratorAccess で運用するが、これは意図的な妥協。
# 引き受けられるのは上の Condition により当該リポジトリの GitHub Actions のみ。
resource "aws_iam_role_policy_attachment" "github_actions_admin" {
  role       = aws_iam_role.github_actions.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# ---- 出力 ----

output "tfstate_bucket" {
  description = "infra/main.tf の backend \"s3\" に書くバケット名"
  value       = aws_s3_bucket.tfstate.id
}

output "tfstate_lock_table" {
  description = "infra/main.tf の backend \"s3\" に書くロックテーブル名"
  value       = aws_dynamodb_table.tfstate_lock.name
}

output "github_actions_role_arn" {
  description = "GitHub の Secrets に AWS_ROLE_ARN として登録する値"
  value       = aws_iam_role.github_actions.arn
}
