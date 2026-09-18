# アプリのデータを入れる単一テーブル（#78）。
#
# ルームの状態はここに入る。これが無いとルームは Lambda の実行環境ごとに
# バラバラのメモリ上にあり、本番でオンライン対戦が成立しない。
#
# 汎用キー名（PK / SK）にプレフィックス付きの値を入れる単一テーブル設計。
# WebSocket の接続レジストリ（#15 の本番化）が同じテーブルに乗る。
#
#   | 項目   | PK                     | SK     | GSI1PK        | GSI1SK        |
#   |--------|------------------------|--------|---------------|---------------|
#   | ルーム | ROOM#<code>            | ROOM   | —             | —             |
#   | 接続   | CONN#<connectionId>    | CONN   | ROOM#<code>   | CONN#<id>     |
#
# GSI1 はルームから接続を逆引きするためのもの。GSI1PK を持たない項目は
# 索引に載らない（スパースインデックス）ので、ルーム側の書き込み費用は増えない。
resource "aws_dynamodb_table" "app" {
  name         = "${var.project_name}-app"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "S"
  }

  global_secondary_index {
    name      = "GSI1"
    hash_key  = "GSI1PK"
    range_key = "GSI1SK"
    # 逆引きで要るのは相手のキーだけ（接続 ID）。属性を運ばない分だけ安い
    projection_type = "KEYS_ONLY"
  }

  # アカウントの無いサービスなのでデータを溜め込まない。
  # 放置された卓は 24 時間で消える（backend の ROOM_TTL_SECONDS）
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
}
