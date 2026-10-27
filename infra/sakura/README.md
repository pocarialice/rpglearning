# さくらのクラウドの Terraform

構築手順書（`documents/さくらのクラウド構築手順書_RPG学習アプリ.md`）の第3章のうち、API で作れるものを Terraform にしたもの。

| ディレクトリ | 作るもの | 手順書 |
| --- | --- | --- |
| `shared/` | コンテナレジストリ、push 用・pull 用のユーザー、DNS ゾーン `rpglearning.net`（dev・prod で共用） | 2.2・3.7 |
| `dev/` | スイッチ、パケットフィルタ、データベースアプライアンス、A レコード `rpg-dev`、サーバー（初回の起動で Docker・`/opt/rpg`・DB `rpg` の作成・`docker compose up -d` まで行う）、シンプル監視 | 3.2・3.3・3.8・3.9・3.12 |

画面で作るもの（Terraform では作れない）：プロジェクト、オブジェクトストレージのバケットとアクセスキー（3.4）、さくらのAI Engine のトークン（3.5）、SMTP（3.6）、GitHub の Environment（2.3・3.7）。

## 最初に1回だけ

1. 画面で、tfstate を置くバケット `rpg-tfstate`（石狩第1・非公開）と、そのバケットだけに読み書きできるアクセスキー `rpg-terraform` を作る
2. APIキー（アクセスレベル「作成・削除」、プロジェクト `rpg-dev`）を作る
3. 次の環境変数を、terraform を動かす場所に入れる（チャットや Git には書かない）

| 環境変数 | 中身 |
| --- | --- |
| `SAKURACLOUD_ACCESS_TOKEN`・`SAKURACLOUD_ACCESS_TOKEN_SECRET` | APIキー |
| `TFSTATE_ACCESS_KEY`・`TFSTATE_SECRET_KEY` | 1 の `rpg-terraform` のキー |
| `TF_VAR_s3_access_key_id`・`TF_VAR_s3_secret_access_key` | V-10 アプリ用のオブジェクトストレージのキー |
| `TF_VAR_ai_api_key` | V-11 さくらのAI Engine のトークン |
| `TF_VAR_smtp_password` | V-12 SMTP のパスワード |

## 作る順番

```bash
infra/sakura/tf.sh shared apply
infra/sakura/tf.sh shared output -raw registry_push_password   # GitHub の Environment dev の REGISTRY_PASSWORD へ
# GitHub で release を手動実行し、イメージ名を dev/dev.auto.tfvars の image に書く
infra/sakura/tf.sh dev apply
infra/sakura/tf.sh shared output name_servers                  # さくらのドメインの「ネームサーバ」へ（最初の1回だけ）
```

- `dev/dev.auto.tfvars` の `image` と `site_address` が両方入っているときだけ、サーバーの初回の起動でアプリを起動する。空なら Docker と `/opt/rpg` の用意までで止まる
- スタートアップスクリプトはサーバーを作ったときに1回だけ動く。動いた記録はサーバーの `/var/log/rpg-setup.log`
- スタートアップスクリプトには `.env` の中身（パスワード・キー）が入る。コントロールパネルの「スタートアップスクリプト」で見えるため、dev だけで使う。prod は別に考える
- 2回目からのリリースの反映は手順書 3.11 のとおりサーバーで行う。`image` を変えて apply してもサーバーは変わらない
- シンプル監視の通知は、さくらのクラウドの会員のメールアドレスに届く
