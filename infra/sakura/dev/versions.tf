terraform {
  required_version = ">= 1.10"
  required_providers {
    sakuracloud = { source = "sacloud/sakuracloud", version = "~> 2.36" }
    random      = { source = "hashicorp/random", version = "~> 3.7" }
    aws         = { source = "hashicorp/aws", version = "~> 6.0" }
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
# オブジェクトストレージ（S3 互換）の CORS・ライフサイクルを、アプリ用のキーで設定する
provider "aws" {
  region                      = "jp-north-1"
  access_key                  = var.s3_access_key_id
  secret_key                  = var.s3_secret_access_key
  skip_region_validation      = true
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
  s3_use_path_style           = true
  endpoints {
    s3 = "https://s3.isk01.sakurastorage.jp"
  }
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
