# 値は dev.auto.tfvars（Git に入れてよいもの）と、環境変数 TF_VAR_*（パスワード・キー）で渡す
variable "env" {
  type    = string
  default = "dev"
}
variable "network_prefix" {
  description = "V-03 スイッチのネットワーク（/24 の先頭3つ）"
  type        = string
  default     = "192.168.10"
}
variable "ssh_public_keys" {
  description = "作業PCの公開鍵（~/.ssh/id_ed25519.pub の中身）。PC ごとに1行。足しても、いまのサーバーには入らない（README）"
  type        = list(string)
  validation {
    condition     = length(var.ssh_public_keys) > 0
    error_message = "公開鍵を1つ以上入れてください"
  }
}
variable "ssh_allowed_cidrs" {
  description = "SSH を許可する作業場所のIPアドレス（例 203.0.113.10 か 203.0.113.0/24）。空なら SSH を開けない"
  type        = list(string)
  default     = []
}
variable "site_address" {
  description = "V-01 サイトのドメイン名。空なら HTTPS の監視を作らない"
  type        = string
  default     = ""
}
variable "image" {
  description = "動かすイメージ（<V-20>/rpg-app:<リリース番号>）。空ならサーバーの準備だけして起動しない"
  type        = string
  default     = ""
}
variable "s3_access_key_id" {
  description = "V-10 アプリ用のオブジェクトストレージのアクセスキー"
  type        = string
  sensitive   = true
  default     = ""
}
variable "s3_secret_access_key" {
  description = "V-10 アプリ用のオブジェクトストレージのシークレットキー"
  type        = string
  sensitive   = true
  default     = ""
}
variable "ai_api_key" {
  description = "V-11 さくらのAI Engine のアカウントトークン"
  type        = string
  sensitive   = true
  default     = ""
}
variable "smtp" {
  description = "V-12 SMTP の接続先"
  type = object({
    host   = string
    port   = number
    secure = bool
    user   = string
  })
  default = { host = "", port = 587, secure = false, user = "" }
}
variable "smtp_password" {
  description = "V-12 SMTP のパスワード"
  type        = string
  sensitive   = true
  default     = ""
}
variable "mail_from" {
  description = "V-13 送信元のメールアドレス"
  type        = string
  default     = ""
}
variable "alert_email" {
  description = "V-14 監視のお知らせの宛先（アプリが送るもの）"
  type        = string
  default     = ""
}
