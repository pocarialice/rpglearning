#!/usr/bin/env bash
# アクセスがない時間が続いたら、DB をバックアップしてからサーバーの電源を切る（構築手順書 3.13）
# サーバーの /usr/local/bin/rpg-idle-stop に置き、systemd のタイマー rpg-idle-stop.timer が5分ごとに動かす
# 電源が切れるとさくらのクラウドのサーバーの課金が止まる（ディスクの課金は残る）。起動は scripts/sakura-power.sh か GitHub Actions の power
#   rpg-idle-stop            見回り（止める条件がそろっていたら止める）
#   rpg-idle-stop status     止めるまでの残り時間と、止めない理由を見るだけ（止めない）
#   rpg-idle-stop pause      自動停止を休む（/opt/rpg/.idle-stop-paused を置く）
#   rpg-idle-stop resume     自動停止を再開する
# .env の IDLE_STOP_MINUTES（既定 60）分、アクセスがなければ止める。0 なら止めない
set -euo pipefail
APP_DIR=${RPG_APP_DIR:-/opt/rpg}
ENV_FILE=$APP_DIR/.env
PAUSE_FILE=$APP_DIR/.idle-stop-paused
LOG=/var/log/rpg-idle-stop.log
env_value() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2-; }
say() { echo "$(date '+%F %T') $*" | tee -a "$LOG" >&2; }
cd "$APP_DIR"
IDLE=$(env_value IDLE_STOP_MINUTES); IDLE=${IDLE:-60}
[[ "$IDLE" =~ ^[0-9]+$ ]] || { echo "IDLE_STOP_MINUTES は分の数で書いてください：$IDLE" >&2; exit 1; }
# 数えるアクセス：/api/ で始まるもの。ただし死活確認（/api/health）と、開きっぱなしのタブが自動で行うトークン更新（/api/auth/refresh）は数えない
# 画面のファイル（/・/js/…）も数えない。インターネットを見回るボットが来ても止まるようにするため（使う人は必ず /api/ を呼ぶ）
count_access() {
  docker compose logs --no-log-prefix --since "${1}m" caddy 2>/dev/null \
    | grep -F '"uri":"/api/' | grep -v -e '"uri":"/api/health' -e '"uri":"/api/auth/refresh' | wc -l
}
# 止めない理由を1行ずつ出す（なければ何も出さない）
reasons() {
  [ "$IDLE" -gt 0 ] || echo "IDLE_STOP_MINUTES=0（自動停止しない設定）"
  [ ! -e "$PAUSE_FILE" ] || echo "rpg-idle-stop pause で休み中（resume で再開）"
  local up; up=$(awk '{print int($1 / 60)}' /proc/uptime)
  [ "$up" -ge "$IDLE" ] || echo "起動してから ${up} 分（${IDLE} 分たつまで待つ）"
  local n; n=$(count_access "$IDLE")
  [ "$n" -eq 0 ] || echo "直近 ${IDLE} 分のアクセスが ${n} 件"
  # 採点・取り込みの途中（待ち・処理中のジョブ）なら止めない
  if docker compose ps --status running --services 2>/dev/null | grep -qx db; then
    local j
    j=$(docker compose exec -T db psql -U rpgadmin -d rpg -tAc "SELECT count(*) FROM jobs WHERE status = 'running' OR (status = 'queued' AND run_after <= now())" 2>/dev/null || echo '?')
    [ "$j" = 0 ] || echo "採点・取り込みのジョブが ${j} 件（終わるまで待つ）"
  fi
  # SSH・Tailscale SSH で入っている人がいたら止めない
  local w; w=$(who | wc -l)
  [ "$w" -eq 0 ] || echo "ログイン中の人が ${w} 人"
  pgrep -f '/usr/local/bin/rpg-deploy' > /dev/null && echo "rpg-deploy が動いている"
  pgrep -f '/usr/local/bin/rpg-db ' > /dev/null && echo "rpg-db が動いている"
  return 0
}
case "${1:-}" in
  status)
    r=$(reasons)
    if [ -n "$r" ]; then echo "⏸️ いまは止めません："; echo "$r" | sed 's/^/  - /'; else echo "🌙 次の見回り（5分ごと）で止めます"; fi
    exit 0
    ;;
  pause) touch "$PAUSE_FILE"; echo "⏸️ 自動停止を休みます（再開は rpg-idle-stop resume）"; exit 0 ;;
  resume) rm -f "$PAUSE_FILE"; echo "▶️ 自動停止を再開します"; exit 0 ;;
  "") ;;
  -h|--help|help) sed -n '2,9p' "$(readlink -f "$0")" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) echo "知らない使い方です：$1（rpg-idle-stop help）" >&2; exit 1 ;;
esac
[ "$(id -u)" -eq 0 ] || { echo "root で動かしてください（sudo rpg-idle-stop）" >&2; exit 1; }
[ -z "$(reasons)" ] || exit 0
say "直近 ${IDLE} 分アクセスがないため止めます"
# DB をこのサーバーに置いているときは、止める前にオブジェクトストレージへバックアップする。失敗したら止めない（次の見回りでやり直す）
if [ "$(env_value COMPOSE_PROFILES)" = localdb ]; then
  if ! /usr/local/bin/rpg-db backup >> "$LOG" 2>&1; then
    say "❌ バックアップに失敗したため止めません（$LOG）"
    exit 1
  fi
fi
# コンテナは docker compose stop で止めない（restart: unless-stopped は、手で止めたコンテナを次の起動で動かさないため）。電源を切ると Docker が止める
say "電源を切ります"
systemctl poweroff
