# カスタムドメインを使う場合のみ作る（var.domain_name が空なら何も作らない）。

data "aws_route53_zone" "main" {
  count = local.use_custom_domain ? 1 : 0

  name = var.hosted_zone_name
}

resource "aws_acm_certificate" "main" {
  count = local.use_custom_domain ? 1 : 0

  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  # 条件式を使わず splat + flatten で書く。カスタムドメインを使わない場合
  # aws_acm_certificate.main[*] は空リストになり、for_each も空になる。
  # 三項演算子だと count = 0 のときに null へのアクセスが評価されうる。
  for_each = {
    for dvo in flatten(aws_acm_certificate.main[*].domain_validation_options) : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id = one(data.aws_route53_zone.main[*].zone_id)
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]

  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "main" {
  count = local.use_custom_domain ? 1 : 0

  provider                = aws.us_east_1
  certificate_arn         = one(aws_acm_certificate.main[*].arn)
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

resource "aws_route53_record" "app" {
  count = local.use_custom_domain ? 1 : 0

  zone_id = one(data.aws_route53_zone.main[*].zone_id)
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}
