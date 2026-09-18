# WebSocket API（ルーム更新の通知、#90）。
#
# 役割は1つだけ。「あなた向けのルーム状態が更新された」を push する
# （docs/realtime.md §2）。手番のアクションは HTTP API のままで、ここには載せない。
#
# 繋げなくても遊べる。クライアントはポーリングを持ち続けていて、WebSocket は
# その間隔を 2 秒から 15 秒へ変えるだけの仕組みになっている（§5）。
resource "aws_apigatewayv2_api" "ws" {
  name          = "${var.project_name}-ws"
  protocol_type = "WEBSOCKET"

  # メッセージの種別は `t`（docs/realtime.md §3）。hello / ping それぞれのルートは
  # 作らず、すべて $default へ流して Lambda 側で振り分ける。
  route_selection_expression = "$request.body.t"
}

# HTTP 側（aws_lambda_function.api）と同じ zip の、別のハンドラ。
# ルームの状態を読むので DynamoDB は要るが、送り先は接続ごとのイベントから
# 分かるので WS_ENDPOINT は要らない。
resource "aws_lambda_function" "ws" {
  function_name    = "${var.project_name}-ws"
  role             = aws_iam_role.lambda.arn
  handler          = "ws.handler"
  runtime          = var.lambda_runtime
  timeout          = 30
  memory_size      = 256
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256

  environment {
    variables = {
      APP_TABLE_NAME = aws_dynamodb_table.app.name
    }
  }
}

resource "aws_apigatewayv2_integration" "ws" {
  api_id           = aws_apigatewayv2_api.ws.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.ws.invoke_arn
}

# 繋いだ時点ではまだどのルームのものか分からない。紐づけは hello（$default）で行う
resource "aws_apigatewayv2_route" "ws_connect" {
  api_id    = aws_apigatewayv2_api.ws.id
  route_key = "$connect"
  target    = "integrations/${aws_apigatewayv2_integration.ws.id}"
}

resource "aws_apigatewayv2_route" "ws_disconnect" {
  api_id    = aws_apigatewayv2_api.ws.id
  route_key = "$disconnect"
  target    = "integrations/${aws_apigatewayv2_integration.ws.id}"
}

resource "aws_apigatewayv2_route" "ws_default" {
  api_id    = aws_apigatewayv2_api.ws.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.ws.id}"
}

# WebSocket API は $default ステージでもパスにステージ名が入るため、名前を決めて明示する
resource "aws_apigatewayv2_stage" "ws" {
  api_id      = aws_apigatewayv2_api.ws.id
  name        = "prod"
  auto_deploy = true
}

resource "aws_lambda_permission" "ws" {
  statement_id  = "AllowWebSocketInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ws.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ws.execution_arn}/*/*"
}

# 繋いでいる接続へ送る権限（PostToConnection）。HTTP 側の Lambda が配信するので、
# 共有している実行ロールに付ける。
resource "aws_iam_role_policy" "lambda_manage_connections" {
  name = "${var.project_name}-lambda-manage-connections"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["execute-api:ManageConnections"]
      Resource = ["${aws_apigatewayv2_api.ws.execution_arn}/*"]
    }]
  })
}

locals {
  # 管理 API（PostToConnection）の宛先。接続用の wss:// と同じホストとステージ
  ws_management_endpoint = replace(aws_apigatewayv2_stage.ws.invoke_url, "wss://", "https://")
}
