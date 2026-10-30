# dev・prod で共用するもの（構築手順書 3.7）。コンテナレジストリと push・pull のユーザー
terraform {
  required_version = ">= 1.10"
  required_providers {
    sakuracloud = { source = "sacloud/sakuracloud", version = "~> 2.36" }
    random      = { source = "hashicorp/random", version = "~> 3.7" }
  }
  backend "s3" {
    bucket                      = "rpg-tfstate"
    key                         = "shared/terraform.tfstate"
    region                      = "jp-north-1"
    endpoints                   = { s3 = "https://s3.isk01.sakurastorage.jp" }
    use_path_style              = true
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
  }
}
provider "sakuracloud" {
  zone = "is1b"
}
variable "registry_name" {
  description = "コンテナレジストリのサブドメイン（<名前>.sakuracr.jp。さくらのクラウド全体で重複できない）"
  type        = string
  default     = "rpglearning"
}
resource "random_password" "registry" {
  for_each = toset(["push", "pull"])
  length   = 32
  special  = false
}
resource "sakuracloud_container_registry" "main" {
  name            = "rpg-registry"
  subdomain_label = var.registry_name
  tags            = ["rpg"]
  user {
    name       = "rpg-push"
    password   = random_password.registry["push"].result
    permission = "readwrite"
  }
  user {
    name       = "rpg-pull"
    password   = random_password.registry["pull"].result
    permission = "readonly"
  }
}
output "registry" {
  description = "V-20 コンテナレジストリのドメイン"
  value       = sakuracloud_container_registry.main.fqdn
}
output "registry_push_user" {
  value = "rpg-push"
}
output "registry_push_password" {
  description = "V-21（GitHub の Environment の REGISTRY_PASSWORD に入れる）"
  value       = random_password.registry["push"].result
  sensitive   = true
}
output "registry_pull_user" {
  value = "rpg-pull"
}
output "registry_pull_password" {
  description = "V-22（サーバーが pull に使う）"
  value       = random_password.registry["pull"].result
  sensitive   = true
}
