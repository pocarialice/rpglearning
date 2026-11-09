#!/usr/bin/env bash
# さくらのクラウドのサーバーの電源を入れる・切る・見る（構築手順書 3.13）。GitHub Actions の power からも使う
#   scripts/sakura-power.sh start  [サーバー名]   電源を入れて、サイトの /api/health が返るまで待つ（SITE_URL があるとき）
#   scripts/sakura-power.sh stop   [サーバー名]   シャットダウンする（ふつうは rpg-idle-stop が自動で止める）
#   scripts/sakura-power.sh status [サーバー名]   いまの状態（up / down）
# サーバー名の既定は rpg-dev-app。環境変数 SAKURACLOUD_ACCESS_TOKEN・SAKURACLOUD_ACCESS_TOKEN_SECRET（APIキー）、SAKURACLOUD_ZONE（既定 is1b）、SITE_URL（例 https://rpglearning.net）
set -euo pipefail
cmd=${1:-status}
name=${2:-rpg-dev-app}
: "${SAKURACLOUD_ACCESS_TOKEN:?さくらのクラウドの APIキー（トークン）を環境変数に入れてください}"
: "${SAKURACLOUD_ACCESS_TOKEN_SECRET:?さくらのクラウドの APIキー（シークレット）を環境変数に入れてください}"
API="https://secure.sakura.ad.jp/cloud/zone/${SAKURACLOUD_ZONE:-is1b}/api/cloud/1.1"
die() { echo "❌ $*" >&2; exit 1; }
api() { curl -fsS --retry 3 -u "$SAKURACLOUD_ACCESS_TOKEN:$SAKURACLOUD_ACCESS_TOKEN_SECRET" -X "$1" "$API$2"; }
# 名前がぴったり同じサーバーの ID（API の名前の絞り込みは部分一致のため、ここで1台に絞る）
server_id() {
  api GET "/server?$(python3 -c 'import json,sys,urllib.parse; print(urllib.parse.quote(json.dumps({"Filter": {"Name": sys.argv[1]}})))' "$name")" \
    | python3 -c 'import json,sys; n=sys.argv[1]; ids=[s["ID"] for s in json.load(sys.stdin).get("Servers", []) if s["Name"] == n]; print(ids[0] if len(ids) == 1 else "")' "$name"
}
power_status() { api GET "/server/$id/power" | python3 -c 'import json,sys; print(json.load(sys.stdin)["Instance"]["Status"])'; }
wait_status() {
  local want=$1 s
  for _ in $(seq 1 60); do
    s=$(power_status)
    [ "$s" = "$want" ] && return 0
    sleep 5
  done
  die "$name が $want になりません（いまは $s）"
}
id=$(server_id)
[ -n "$id" ] || die "サーバー $name が見つかりません（名前とゾーンを確かめてください）"
case "$cmd" in
  status) echo "$name：$(power_status)" ;;
  start)
    if [ "$(power_status)" = up ]; then
      echo "ℹ️ $name はもう起動しています"
    else
      api PUT "/server/$id/power" > /dev/null
      echo "🔌 $name の電源を入れました"
      wait_status up
    fi
    if [ -n "${SITE_URL:-}" ]; then
      echo "⏳ ${SITE_URL%/}/api/health を待っています（起動から1〜3分）"
      for _ in $(seq 1 60); do
        if curl -fsS --max-time 5 "${SITE_URL%/}/api/health" > /dev/null 2>&1; then
          echo "✅ 使えます：$SITE_URL"
          exit 0
        fi
        sleep 5
      done
      die "サーバーは起動しましたが、/api/health が返りません"
    fi
    ;;
  stop)
    if [ "$(power_status)" = down ]; then echo "ℹ️ $name はもう止まっています"; exit 0; fi
    echo "⚠️ DB のバックアップは取りません。ふだんは rpg-idle-stop の自動停止に任せます"
    api DELETE "/server/$id/power" > /dev/null
    wait_status down
    echo "🌙 $name を止めました"
    ;;
  *) die "使い方：scripts/sakura-power.sh start|stop|status [サーバー名]" ;;
esac
