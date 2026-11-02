output "server_ip" {
  description = "V-02 サーバーのグローバルIPアドレス（DNS の A レコードに登録する）"
  value       = sakuracloud_server.app.ip_address
}
output "fqdn" {
  description = "V-01 サイトのドメイン名（DNS の A レコードを Terraform で作る）"
  value       = var.site_address != "" ? "${sakuracloud_dns_record.app[0].name}.${local.dns_zone}" : null
}
output "ssh" {
  value = "ssh ubuntu@${sakuracloud_server.app.ip_address}"
}
output "database_password" {
  description = "V-07"
  value       = random_password.db.result
  sensitive   = true
}
output "auth_secret" {
  description = "V-15"
  value       = random_password.auth_secret.result
  sensitive   = true
}
