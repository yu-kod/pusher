variable "aws_region" {
  description = "AWS リージョン"
  type        = string
  default     = "ap-northeast-1"
}

variable "project_name" {
  description = "リソース名の接頭辞"
  type        = string
  default     = "pusher-table"
}

variable "domain_name" {
  description = <<-DESC
    公開するカスタムドメイン。

    空文字にすると CloudFront の既定ドメインで公開し、ACM 証明書と Route 53 の
    レコードを作らない。ドメインを用意していない段階ではこちらで始められる。

    値を入れる場合は hosted_zone_name も指定すること。
  DESC
  type        = string
  default     = "pusher-table.yu-web.site"
}

variable "hosted_zone_name" {
  description = "domain_name を管理している Route 53 ホストゾーン名"
  type        = string
  default     = "yu-web.site"
}

variable "lambda_runtime" {
  description = "Lambda のランタイム"
  type        = string
  default     = "nodejs22.x"
}
