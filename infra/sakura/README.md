# さくらのクラウドの Terraform

構築手順書（`documents/さくらのクラウド構築手順書_RPG学習アプリ.md`）の第3章のうち、API で作れるものを Terraform にしたもの。

| ディレクトリ | 作るもの | 手順書 |
| --- | --- | --- |
| `shared/` | コンテナレジストリ、push 用・pull 用のユーザー（dev・prod で共用） | 3.7 |
| `dev/` | パケットフィルタ、DNS の A レコード、サーバー（初回の起動で Docker・`/opt/rpg`・バックアップからの DB の復元・`docker compose up -d`・自動停止のタイマーまで行う）。DB はサーバーの中の db コンテナで、データベースアプライアンス・スイッチ・シンプル監視は作らない | 3.2・3.3・3.8・3.9・3.13 |

画面で作るもの（Terraform では作れない）：プロジェクト、オブジェクトストレージのバケット（DB のバックアップの `rpg-dev-backup` を含む）とアクセスキー（3.4）、さくらのAI Engine のトークン（3.5）、SMTP（3.6）、DNS のゾーン（2.2）、GitHub の Environment（2.3・3.7）。

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
| `TF_VAR_alert_email` | V-14 監視のお知らせの宛先（個人のアドレスのため `dev.auto.tfvars` に書かない） |
| `TF_VAR_cloudflare_api_token` | Cloudflare の API トークン（ゾーンの DNS の編集だけ）。`dns_provider = "cloudflare"` のときだけ |
| `TF_VAR_tailscale_auth_key` | Tailscale の認証キー（1回しか使えないもの）。サーバーを作るときだけ使う。空なら Tailscale を入れるだけでつながない |

## 作る順番

```bash
infra/sakura/tf.sh shared apply
infra/sakura/tf.sh shared output -raw registry_push_password   # GitHub の Environment dev の REGISTRY_PASSWORD へ
# GitHub で release を手動実行し、イメージ名を dev/dev.auto.tfvars の image に書く
infra/sakura/tf.sh dev apply
infra/sakura/tf.sh dev output fqdn                              # DNS の A レコード（site_address があるとき Terraform が作る）
```

- `dev/dev.auto.tfvars` の `image` と `site_address` が両方入っているときだけ、サーバーの初回の起動でアプリを起動する。空なら Docker と `/opt/rpg` の用意までで止まる
- api は起動するときに `.env` の値を確かめ、`MAIL_FROM`・`SMTP_HOST`・`AI_API_KEY`・`S3_ACCESS_KEY_ID`・`S3_SECRET_ACCESS_KEY` などが空だと止まる（`server/main.mjs` の `checkEnv`）。`TF_VAR_*` と `mail_from`・`smtp` を入れてから apply する
- SSH の鍵（`ssh_public_keys`）と作業場所（`ssh_allowed_cidrs`）は、PC・場所ごとに1行ずつ足す。作業場所はパケットフィルタがその場で変わる。鍵はサーバーを作ったときにだけ入る（`ignore_changes`）ため、いまのサーバーには入れる鍵のある PC から `~/.ssh/authorized_keys` に1行足す
- スタートアップスクリプトはサーバーを作ったときに1回だけ動く。動いた記録はサーバーの `/var/log/rpg-setup.log`
- スタートアップスクリプトには `.env` の中身（パスワード・キー）が入る。コントロールパネルの「スタートアップスクリプト」で見えるため、dev だけで使う。prod は別に考える
- 2回目からのリリースの反映は手順書 3.11 のとおりサーバーで行う。`image` を変えて apply してもサーバーは変わらない
- スマホから反映できるよう、サーバーには反映のコマンド `rpg-deploy`（`dev/rpg-deploy.sh`）と Tailscale が入る。スマホの Tailscale と SSH アプリから `rpg-dev` に入り、`rpg-deploy` と打つといちばん新しい版を反映する。いまのサーバーへの入れ方は手順書 3.11
- シンプル監視の通知は、さくらのクラウドの会員のメールアドレスに届く
- シンプル監視は作らない。dev のサーバーはアクセスがないと止まるため、止まるたびにお知らせが来てしまう

## 費用を抑える仕組み（dev。手順書 3.13）

- さくらのクラウドのサーバーは電源を切っているあいだ料金がかからない（ディスクは別）。データベースアプライアンスは止めても料金がかかるため、dev は DB を compose の `db`（`COMPOSE_PROFILES=localdb`）にした
- サーバーの `rpg-idle-stop.timer` が5分ごとに見回り、`/api/*`（`/api/health`・`/api/auth/refresh` は数えない）のアクセスが `idle_stop_minutes`（既定60分）なく、採点・取り込みのジョブも、SSH で入っている人もいなければ、`rpg-db backup` でバケット `rpg-dev-backup` にバックアップしてから電源を切る
- 使うときは GitHub Actions の `power`（`start`）か、PC で `scripts/sakura-power.sh start`。電源が入ると Docker がコンテナを起動する
- サーバーを作り直すと、初回の起動で `rpg-db restore-if-empty` がいちばん新しいバックアップを戻す
- `rpg-deploy`・`rpg-db`・`rpg-idle-stop` は、スタートアップスクリプトの 10,000 文字に入らないため、サーバーを作るときに GitHub の `tools_ref`（既定 `main`）から取る。手元のファイルの sha256 と違うと止まるため、**push してから apply する**（ブランチで試すときは `-var tools_ref=<ブランチ名>`）
- データベースアプライアンスからの引っ越しは手順書 3.13 のとおり。先にバックアップをバケットに置いてから `-replace` でサーバーを作り直す（アプライアンスとスイッチは apply で消える）

## アクセスで起こす（dev。手順書 3.14）

- `rpglearning.net` の DNS を Cloudflare に移し、`dev.auto.tfvars` に `dns_provider = "cloudflare"`・`cloudflare_zone_id` を書くと、Terraform は `rpg-dev` の A レコードを Cloudflare にプロキシ付きで作る（さくらのクラウド DNS のレコードは消す）。プロバイダーを足したため、最初だけ `infra/sakura/tf.sh dev init -upgrade`
- `rpg-dev.rpglearning.net/*` は Cloudflare Worker `rpg-dev-wake`（`workers/wake`）を通る。サーバーにつながらなければ、起動中ページを返してさくらのクラウド API で電源を入れる。デプロイは GitHub Actions の `wake-worker`
- 起こすのは、起動中ページの JavaScript（`POST /__wake`）と、ログイン中の画面からの `/api/*` だけ。ボットの見回りでは起きない
