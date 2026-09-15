terraform {
  required_version = ">= 1.0"

  # ブートストラップ（infra/bootstrap）で作ったバケットとテーブルを指す。
  # backend の設定には変数を使えないため直書きする。
  backend "s3" {
    bucket         = "pusher-table-tfstate"
    key            = "terraform.tfstate"
    region         = "ap-northeast-1"
    dynamodb_table = "pusher-table-tfstate-lock"
    encrypt        = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
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

# CloudFront が使う ACM 証明書は us-east-1 にしか置けない
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project   = var.project_name
      ManagedBy = "terraform"
    }
  }
}

locals {
  # domain_name が空ならカスタムドメインを使わず、CloudFront の既定ドメイン
  # （xxxxx.cloudfront.net）で公開する。ドメインを用意しなくてもデプロイできる。
  use_custom_domain = var.domain_name != ""
}
