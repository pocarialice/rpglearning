terraform {
  required_version = ">= 1.10"
  required_providers {
    sakuracloud = { source = "sacloud/sakuracloud", version = "~> 2.36" }
    random      = { source = "hashicorp/random", version = "~> 3.7" }
    cloudflare  = { source = "cloudflare/cloudflare", version = "~> 4.52" }
  }
  backend "s3" {
    bucket                      = "rpg-tfstate"
    key                         = "dev/terraform.tfstate"
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
# DNS を Cloudflare に移したとき（dns_provider = "cloudflare"。構築手順書 3.14）だけ使う。トークンは TF_VAR_cloudflare_api_token
# プロバイダーは使わないときもトークンを求めるため、空なら形だけの値を渡す（Cloudflare のリソースがなければ API は呼ばない）
provider "cloudflare" {
  api_token = var.cloudflare_api_token != "" ? var.cloudflare_api_token : "unused-unused-unused-unused-unused-unused"
}
# レジストリの pull 用ユーザーは shared で作ったものを使う
data "terraform_remote_state" "shared" {
  backend = "s3"
  config = {
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
