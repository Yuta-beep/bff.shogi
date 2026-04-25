output "http_api_url" {
  description = "Base invoke URL for the HTTP API stage."
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "lambda_function_name" {
  description = "Deployed Lambda function name."
  value       = aws_lambda_function.api.function_name
}

output "lambda_role_name" {
  description = "Lambda execution role name."
  value       = aws_iam_role.lambda_execution.name
}
