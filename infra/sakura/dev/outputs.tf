output "server_ip" {
  description = "V-02 サーバーのグローバルIPアドレス（DNS の A レコードに登録する）"
  value       = sakuracloud_server.app.ip_address
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
