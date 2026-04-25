variable "aws_region" {
  description = "AWS region where the stack will be created."
  type        = string
  default     = "ap-northeast-1"
}

variable "project" {
  description = "Project identifier used as the naming base."
  type        = string
  default     = "basi-magic.shogi"
}

variable "env" {
  description = "Environment name appended to AWS resource names."
  type        = string
  default     = "sandbox"
}

variable "lambda_zip_path" {
  description = "Path to the Lambda zip artifact built from Next.js standalone output."
  type        = string
  default     = "../../dist/lambda.zip"
}

variable "lambda_architecture" {
  description = "Lambda CPU architecture. arm64 is cheaper than x86_64 in most cases."
  type        = string
  default     = "arm64"

  validation {
    condition     = contains(["arm64", "x86_64"], var.lambda_architecture)
    error_message = "lambda_architecture must be arm64 or x86_64."
  }
}

variable "lambda_memory_mb" {
  description = "Lambda memory size in MB."
  type        = number
  default     = 1024
}

variable "lambda_timeout_seconds" {
  description = "Lambda timeout in seconds."
  type        = number
  default     = 30
}

variable "log_retention_in_days" {
  description = "CloudWatch log retention in days."
  type        = number
  default     = 14
}

variable "app_port" {
  description = "Port exposed by the Next.js standalone server inside Lambda."
  type        = number
  default     = 8080
}

variable "readiness_check_path" {
  description = "HTTP path used by Lambda Web Adapter to verify the server is ready."
  type        = string
  default     = "/api/health"
}

variable "supabase_url" {
  description = "Supabase project URL for the backend."
  type        = string
  sensitive   = true
}

variable "supabase_service_role_key" {
  description = "Supabase service role key used by the backend."
  type        = string
  sensitive   = true
}

variable "ai_engine_base_url" {
  description = "Optional AI engine base URL. Leave null if the app will not call the AI endpoints."
  type        = string
  default     = null
  sensitive   = true
  nullable    = true
}
