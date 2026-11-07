# dev 環境（構築手順書 3.2・3.3・3.8・3.9・3.13）。バケット・AI Engine・SMTP は画面で作り、キーだけを変数で受け取る
# 費用を抑えるため、DB はサーバーの中の db コンテナに置き、アクセスがない時間が続いたらサーバーの電源を切る（3.13）
locals {
  prefix = "rpg-${var.env}"
  tags   = ["rpg", var.env]
  shared = data.terraform_remote_state.shared.outputs
}
# --- パケットフィルタ（3.2） ---
resource "sakuracloud_packet_filter" "main" {
  name = "${local.prefix}-pf"
  expression {
    protocol         = "tcp"
    destination_port = "80"
    description      = "Let's Encrypt と HTTPS への転送"
  }
  expression {
    protocol         = "tcp"
    destination_port = "443"
    description      = "画面と API"
  }
  dynamic "expression" {
    for_each = var.ssh_allowed_cidrs
    content {
      protocol         = "tcp"
      source_network   = trimsuffix(expression.value, "/32") # さくらのクラウドは /32 を受け付けない（1台なら IP アドレスだけ）
      destination_port = "22"
      description      = "SSH（作業者だけ）"
    }
  }
  expression {
    protocol         = "tcp"
    destination_port = "32768-61000"
    description      = "外への通信の戻り"
  }
  expression {
    protocol    = "udp"
    source_port = "53"
    description = "DNS の戻り"
  }
  expression {
    protocol    = "udp"
    source_port = "123"
    description = "NTP の戻り"
  }
  expression {
    protocol    = "icmp"
    description = "ping（シンプル監視）"
  }
  expression {
    protocol    = "fragment"
    description = "分割されたパケット"
  }
  expression {
    protocol    = "ip"
    allow       = false
    description = "ほかはすべて拒否"
  }
}
# --- DB のパスワード（3.3）。DB はサーバーの中の db コンテナ（compose.yaml）で、データはサーバーのディスクとオブジェクトストレージのバックアップ ---
resource "random_password" "db" {
  length  = 24
  special = false
}
# --- サーバー（3.8） ---
resource "random_password" "auth_secret" {
  length  = 48
  special = false
}
data "sakuracloud_archive" "ubuntu" {
  os_type = "ubuntu2404"
}
# 1つ目は名前を変えない（前は1つだけだったため）
resource "sakuracloud_ssh_key" "admin" {
  count      = length(var.ssh_public_keys)
  name       = count.index == 0 ? "${local.prefix}-admin" : "${local.prefix}-admin-${count.index + 1}"
  public_key = var.ssh_public_keys[count.index]
}
moved {
  from = sakuracloud_ssh_key.admin
  to   = sakuracloud_ssh_key.admin[0]
}
locals {
  dotenv = join("\n", [
    "IMAGE=${var.image}",
    "SITE_ADDRESS=${var.site_address}",
    "REDIRECT_ADDRESSES=${join(", ", var.redirect_addresses)}",
    "APP_ENV=${var.env}",
    "APP_URL=https://${var.site_address}",
    "COMPOSE_PROFILES=localdb",
    "DB_PASSWORD=${random_password.db.result}",
    "DATABASE_URL=postgres://rpgadmin:${random_password.db.result}@db:5432/rpg",
    "DATABASE_SSL=",
    "BACKUP_BUCKET=${local.prefix}-backup",
    "IDLE_STOP_MINUTES=${var.idle_stop_minutes}",
    "AUTH_SECRET=${random_password.auth_secret.result}",
    "GOOGLE_CLIENT_ID=${var.google_client_id}",
    "S3_ENDPOINT=https://s3.isk01.sakurastorage.jp",
    "S3_REGION=jp-north-1",
    "S3_ACCESS_KEY_ID=${var.s3_access_key_id}",
    "S3_SECRET_ACCESS_KEY=${var.s3_secret_access_key}",
    "IMPORT_BUCKET=${local.prefix}-import",
    "ASSETS_BUCKET=${local.prefix}-assets",
    "NOTIFY_BUCKET=${local.prefix}-notify",
    "SMTP_HOST=${var.smtp.host}",
    "SMTP_PORT=${var.smtp.port}",
    "SMTP_SECURE=${var.smtp.secure}",
    "SMTP_USER=${var.smtp.user}",
    "SMTP_PASS=${var.smtp_password}",
    "MAIL_FROM=${var.mail_from}",
    "ALERT_EMAIL=${var.alert_email}",
    "AI_PROVIDER=sakura",
    "AI_BASE_URL=https://api.ai.sakura.ad.jp/v1",
    "AI_API_KEY=${var.ai_api_key}",
    "MODEL_HIGH=gpt-oss-120b",
    "MODEL_LIGHT=gpt-oss-120b",
    "MAIL_SCHEDULE_ENABLED=${var.mail_schedule_enabled}",
    "",
  ])
}
# 初回の起動で1回だけ動くスタートアップスクリプト（OS の設定・Docker・/opt/rpg の用意・バックアップからの復元・起動・自動停止のタイマー）
resource "sakuracloud_note" "setup" {
  name = "${local.prefix}-setup"
  tags = local.tags
  content = templatefile("${path.module}/setup.sh.tftpl", {
    registry      = local.shared.registry
    registry_user = local.shared.registry_pull_user
    registry_pass = local.shared.registry_pull_password
    start         = var.image != "" && var.site_address != ""
    # ファイルは gzip してから base64 にする（スタートアップスクリプトは 10,000 文字まで）
    compose_gz         = base64gzip(file("${path.module}/../../../compose.yaml"))
    caddyfile_gz       = base64gzip(file("${path.module}/../../../Caddyfile"))
    dotenv_gz          = base64gzip(local.dotenv)
    tools_base         = "https://raw.githubusercontent.com/${var.tools_repo}/${var.tools_ref}/infra/sakura/dev"
    tools              = { for n in ["deploy", "db", "idle-stop"] : n => filesha256("${path.module}/rpg-${n}.sh") }
    tailscale_hostname = local.prefix
    tailscale_auth_key = var.tailscale_auth_key
  })
}
resource "sakuracloud_disk" "app" {
  name              = "${local.prefix}-app"
  plan              = "ssd"
  size              = 40
  source_archive_id = data.sakuracloud_archive.ubuntu.id
  tags              = local.tags
  lifecycle {
    ignore_changes = [source_archive_id]
  }
}
resource "sakuracloud_server" "app" {
  name   = "${local.prefix}-app"
  core   = 1
  memory = 2
  disks  = [sakuracloud_disk.app.id]
  tags   = local.tags
  network_interface {
    upstream         = "shared"
    packet_filter_id = sakuracloud_packet_filter.main.id
  }
  disk_edit_parameter {
    hostname        = "${local.prefix}-app"
    ssh_key_ids     = sakuracloud_ssh_key.admin[*].id
    disable_pw_auth = true
    note {
      id = sakuracloud_note.setup.id
    }
  }
  # ディスクの修正は作ったときに1回だけ。鍵を足しても、いまのサーバーを止めたり作り直したりしない
  lifecycle {
    ignore_changes = [disk_edit_parameter]
  }
}
# --- DNS の A レコード（2.2・3.14）。ゾーンは画面で作り、site_address と redirect_addresses をサーバーの IP アドレスに向ける ---
# dns_provider = cloudflare のときは Cloudflare に作り、プロキシを通す（止まっているサーバーを起こす Worker を前に置くため）
# ゾーンそのもの（例 rpglearning.net）のレコードは名前を @ にする
locals {
  dns_zone  = var.dns_zone != "" ? var.dns_zone : join(".", slice(split(".", var.site_address), 1, length(split(".", var.site_address))))
  dns_names = var.site_address != "" ? toset(concat([var.site_address], var.redirect_addresses)) : toset([])
  dns_label = { for n in local.dns_names : n => n == local.dns_zone ? "@" : trimsuffix(n, ".${local.dns_zone}") }
  use_sakura_dns     = var.dns_provider == "sakura"
  use_cloudflare_dns = var.dns_provider == "cloudflare"
}
check "dns_names_in_zone" {
  assert {
    condition     = alltrue([for n in local.dns_names : n == local.dns_zone || endswith(n, ".${local.dns_zone}")])
    error_message = "site_address と redirect_addresses は dns_zone（${local.dns_zone}）の中の名前にしてください"
  }
}
data "sakuracloud_dns" "zone" {
  count = local.use_sakura_dns && length(local.dns_names) > 0 ? 1 : 0
  filter {
    names = [local.dns_zone]
  }
}
resource "sakuracloud_dns_record" "app" {
  for_each = local.use_sakura_dns ? local.dns_label : {}
  dns_id   = data.sakuracloud_dns.zone[0].id
  name     = each.value
  type     = "A"
  value    = sakuracloud_server.app.ip_address
  ttl      = 300
}
resource "cloudflare_record" "app" {
  for_each = local.use_cloudflare_dns ? local.dns_label : {}
  zone_id  = var.cloudflare_zone_id
  name     = each.value
  type     = "A"
  content  = sakuracloud_server.app.ip_address
  proxied  = true
  ttl      = 1
  comment  = "${local.prefix}（Terraform。前に Worker rpg-dev-wake）"
  lifecycle {
    precondition {
      condition     = var.cloudflare_zone_id != ""
      error_message = "dns_provider = cloudflare のときは cloudflare_zone_id を入れてください"
    }
  }
}
# 前は rpg-dev.rpglearning.net の1つだけで、count で作っていた
moved {
  from = sakuracloud_dns_record.app
  to   = sakuracloud_dns_record.app[0]
}
moved {
  from = sakuracloud_dns_record.app[0]
  to   = sakuracloud_dns_record.app["rpg-dev.rpglearning.net"]
}
# --- シンプル監視はやめた（3.12）。アクセスがないとサーバーが止まるため、止まるたびに「つながらない」のお知らせが来てしまう ---
