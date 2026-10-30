# dev 環境（構築手順書 3.2・3.3・3.8・3.9・3.12）。バケット・AI Engine・SMTP は画面で作り、キーだけを変数で受け取る
locals {
  prefix    = "rpg-${var.env}"
  tags      = ["rpg", var.env]
  server_ip = "${var.network_prefix}.11"
  db_ip     = "${var.network_prefix}.21"
  shared    = data.terraform_remote_state.shared.outputs
}
# --- スイッチとパケットフィルタ（3.2） ---
resource "sakuracloud_switch" "main" {
  name = "${local.prefix}-sw"
  tags = local.tags
}
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
# --- データベースアプライアンス（3.3） ---
resource "random_password" "db" {
  length  = 24
  special = false
}
resource "sakuracloud_database" "main" {
  name          = "${local.prefix}-db"
  database_type = "postgres"
  plan          = "10g"
  username      = "rpgadmin"
  password      = random_password.db.result
  tags          = local.tags
  network_interface {
    switch_id     = sakuracloud_switch.main.id
    ip_address    = local.db_ip
    netmask       = 24
    gateway       = "${var.network_prefix}.1"
    port          = 5432
    source_ranges = ["${var.network_prefix}.0/24"]
  }
  backup {
    time     = "03:00"
    weekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
  }
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
    "APP_ENV=${var.env}",
    "APP_URL=https://${var.site_address}",
    "DATABASE_URL=postgres://rpgadmin:${random_password.db.result}@${local.db_ip}:5432/rpg",
    "DATABASE_SSL=",
    "AUTH_SECRET=${random_password.auth_secret.result}",
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
    "MAIL_SCHEDULE_ENABLED=false",
    "",
  ])
}
# 初回の起動で1回だけ動くスタートアップスクリプト（OS の設定・Docker・/opt/rpg の用意・DB の作成・起動）
resource "sakuracloud_note" "setup" {
  name = "${local.prefix}-setup"
  tags = local.tags
  content = templatefile("${path.module}/setup.sh.tftpl", {
    server_cidr   = "${local.server_ip}/24"
    db_ip         = local.db_ip
    db_password   = random_password.db.result
    registry      = local.shared.registry
    registry_user = local.shared.registry_pull_user
    registry_pass = local.shared.registry_pull_password
    start         = var.image != "" && var.site_address != ""
    compose_b64   = filebase64("${path.module}/../../../compose.yaml")
    caddyfile_b64 = filebase64("${path.module}/../../../Caddyfile")
    dotenv_b64    = base64encode(local.dotenv)
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
  core   = 2
  memory = 4
  disks  = [sakuracloud_disk.app.id]
  tags   = local.tags
  network_interface {
    upstream         = "shared"
    packet_filter_id = sakuracloud_packet_filter.main.id
  }
  network_interface {
    upstream = sakuracloud_switch.main.id
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
  depends_on = [sakuracloud_database.main]
}
# --- シンプル監視（3.12）。通知はさくらのクラウドの会員のメールアドレスに届く ---
resource "sakuracloud_simple_monitor" "ping" {
  target     = sakuracloud_server.app.ip_address
  delay_loop = 300
  tags       = local.tags
  health_check {
    protocol = "ping"
  }
  notify_email_enabled = true
}
resource "sakuracloud_simple_monitor" "site" {
  count      = var.site_address != "" ? 1 : 0
  target     = var.site_address
  delay_loop = 300
  tags       = local.tags
  health_check {
    protocol = "https"
    path     = "/api/health"
    status   = 200
    sni      = true
  }
  notify_email_enabled = true
}
