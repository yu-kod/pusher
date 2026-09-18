# backend/dist には build:lambda が出力した lambda.js（HTTP API）と
# ws.js（WebSocket API）が入る。2つの Lambda が同じ zip を別のハンドラで使う。
#
# AWS SDK も含めてバンドルしている。ランタイムに入っている SDK に頼ると、
# どのクライアントが入っているかがランタイムの更新に左右される。
data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/dist"
  output_path = "${path.module}/../backend/lambda.zip"
}

resource "aws_iam_role" "lambda" {
  name = "${var.project_name}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

# CloudWatch Logs への書き込み
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# アプリのテーブルへの読み書きだけを許す。
# Query は GSI1（ルーム → 接続の逆引き、#90）で使う。
resource "aws_iam_role_policy" "lambda_dynamodb" {
  name = "${var.project_name}-lambda-dynamodb"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
      ]
      Resource = [
        aws_dynamodb_table.app.arn,
        "${aws_dynamodb_table.app.arn}/index/*",
      ]
    }]
  })
}

resource "aws_lambda_function" "api" {
  function_name    = "${var.project_name}-api"
  role             = aws_iam_role.lambda.arn
  handler          = "lambda.handler"
  runtime          = var.lambda_runtime
  timeout          = 30
  memory_size      = 256
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256

  # これが無いとアプリはインメモリの保存先で起動する（backend/src/room/create-store.ts）。
  # WS_ENDPOINT が無いと配信しない（そのときもポーリングで遊べる）
  environment {
    variables = {
      APP_TABLE_NAME = aws_dynamodb_table.app.name
      WS_ENDPOINT    = local.ws_management_endpoint
    }
  }
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
