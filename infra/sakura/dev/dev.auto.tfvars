# dev の値（Git に入れてよいものだけ。パスワード・キーは環境変数 TF_VAR_* で渡す）
ssh_public_keys = [
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF9meuqImOfKjBndWSxODryxVz8IRPmKjM2lPhx5tJ70 jun-rpg",
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOyVXtR8nWtjbwmfjYIeO/GY8ptjpBHKyEtoZdUhLn3E jun-IDPW02514",
]
ssh_allowed_cidrs = ["112.70.171.129", "203.140.83.25"]
site_address      = "rpg-dev.rpglearning.net"
image             = "rpglearning.sakuracr.jp/rpg-app:dev-20261030-3"
mail_from         = "no-reply@mail.rpglearning.net"
# alert_email は個人のアドレスのため、ここに書かず環境変数 TF_VAR_alert_email で渡す（リポジトリが公開のため）
smtp = {
  host   = "www2160.sakura.ne.jp"
  port   = 587
  secure = false
  user   = "no-reply@mail.rpglearning.net"
}
