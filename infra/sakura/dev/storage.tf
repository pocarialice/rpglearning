# オブジェクトストレージ（構築手順書 3.4 の 5〜7）。バケットとキーは画面で作り、ここでは CORS と古いファイルの削除だけを設定する
# キー（TF_VAR_s3_access_key_id）が入っていないときは何もしない
locals {
  storage_enabled = nonsensitive(var.s3_access_key_id != "")
}
# 画面からブラウザで署名付きURLに直接 PUT するため
resource "aws_s3_bucket_cors_configuration" "upload" {
  for_each = local.storage_enabled ? toset([var.buckets.import, var.buckets.assets]) : toset([])
  bucket   = each.value
  cors_rule {
    allowed_origins = ["https://${var.host_name}.${local.shared.domain}"]
    allowed_methods = ["PUT"]
    allowed_headers = ["content-type"]
    max_age_seconds = 3600
  }
}
# 取り込みが終わった原本は30日、通知の送信リストは7日で消す
resource "aws_s3_bucket_lifecycle_configuration" "expire" {
  for_each = local.storage_enabled ? {
    (var.buckets.import) = { prefix = "uploads/", days = 30 }
    (var.buckets.notify) = { prefix = "notify/", days = 7 }
  } : {}
  bucket = each.key
  rule {
    id     = "expire-${trimsuffix(each.value.prefix, "/")}"
    status = "Enabled"
    filter {
      prefix = each.value.prefix
    }
    expiration {
      days = each.value.days
    }
  }
}
