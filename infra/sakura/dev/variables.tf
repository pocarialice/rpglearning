# 値は dev.auto.tfvars（Git に入れてよいもの）と、環境変数 TF_VAR_*（パスワード・キー）で渡す
variable "env" {
  type    = string
  default = "dev"
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
  description = "V-01 サイトのドメイン名（テスターに公開する名前。例 rpglearning.net）。空なら DNS のレコードを作らない"
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
variable "google_client_id" {
  description = "V-16 Googleでログインの OAuth クライアントID（公開してよい値。空なら Google のボタンを出さない）"
  type        = string
  default     = ""
  validation {
    condition     = var.google_client_id == "" || endswith(var.google_client_id, ".apps.googleusercontent.com")
    error_message = "google_client_id は …apps.googleusercontent.com の形にしてください（クライアントシークレットではありません）。"
  }
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
variable "tailscale_auth_key" {
  description = "Tailscale の認証キー（tskey-auth-...）。サーバーを作るときにだけ使う。空なら Tailscale を入れるだけでつながない（README）"
  type        = string
  sensitive   = true
  default     = ""
}
variable "idle_stop_minutes" {
  description = "この分数アクセスがなければ、DB をバックアップしてサーバーの電源を切る（3.13）。0 なら止めない。いまのサーバーは rpg-deploy env IDLE_STOP_MINUTES <分> で変える"
  type        = number
  default     = 60
  validation {
    condition     = var.idle_stop_minutes == 0 || var.idle_stop_minutes >= 15
    error_message = "idle_stop_minutes は 0（止めない）か 15 以上にしてください（起動してすぐ止まらないように）"
  }
}
variable "tools_repo" {
  description = "サーバーを作るときに rpg-deploy・rpg-db・rpg-idle-stop を取る GitHub のリポジトリ（公開のもの）"
  type        = string
  default     = "pocarialice/rpglearning"
}
variable "tools_ref" {
  description = "rpg-deploy などを取るブランチかコミット。手元のファイルの sha256 と同じでないとサーバーの準備が止まるため、push 済みのものにする"
  type        = string
  default     = "main"
}
variable "dns_provider" {
  description = "site_address の A レコードを置く DNS。sakura（さくらのクラウド DNS）か cloudflare（Cloudflare。前に起こす係の Worker を置く。3.14）"
  type        = string
  default     = "sakura"
  validation {
    condition     = contains(["sakura", "cloudflare"], var.dns_provider)
    error_message = "dns_provider は sakura か cloudflare にしてください"
  }
}
variable "cloudflare_zone_id" {
  description = "Cloudflare のゾーンID（ゾーンの「概要」の右下。公開してよい値）。dns_provider = cloudflare のときに使う"
  type        = string
  default     = ""
}
variable "cloudflare_api_token" {
  description = "Cloudflare の API トークン（ゾーンの DNS の編集だけ）。dns_provider = cloudflare のときに使う"
  type        = string
  sensitive   = true
  default     = ""
}
variable "redirect_addresses" {
  description = "V-23 site_address へ転送するだけのドメイン名（www や前の名前）。Caddy が 301 で移し、Worker も同じように移す"
  type        = list(string)
  default     = []
}
variable "dns_zone" {
  description = "DNS のゾーン（例 rpglearning.net）。空なら site_address の先頭のラベルを外したもの"
  type        = string
  default     = ""
}
variable "mail_schedule_enabled" {
  description = "通知メールを 6:00〜22:30 の30分ごとに送る（MAIL_SCHEDULE_ENABLED）。いまのサーバーは rpg-deploy env MAIL_SCHEDULE_ENABLED true で変える"
  type        = bool
  default     = false
}
