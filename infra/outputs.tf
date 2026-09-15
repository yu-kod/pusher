output "app_url" {
  description = "アプリの URL"
  value       = local.use_custom_domain ? "https://${var.domain_name}" : "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "cloudfront_url" {
  description = "CloudFront の既定ドメイン"
  value       = "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "cloudfront_distribution_id" {
  description = "キャッシュ無効化に使う CloudFront ディストリビューション ID"
  value       = aws_cloudfront_distribution.main.id
}

output "frontend_bucket_name" {
  description = "フロントエンドを同期する S3 バケット名"
  value       = aws_s3_bucket.frontend.id
}

output "api_gateway_url" {
  description = "HTTP API のエンドポイント（CloudFront を介さない直接の URL）"
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "lambda_function_name" {
  description = "HTTP API の Lambda 関数名"
  value       = aws_lambda_function.api.function_name
}
