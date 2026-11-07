#!/usr/bin/env bash
# dev サーバーでリリースを反映するコマンド（構築手順書 3.11）。サーバーの /usr/local/bin/rpg-deploy に置く
# スマホから Tailscale SSH で入って、1行で反映できるようにしたもの
#   rpg-deploy                  いちばん新しい dev-* タグを探して反映
#   rpg-deploy <タグ>           指定したタグを反映（例 dev-20261101-13）
#   rpg-deploy rollback         前回の IMAGE に戻す
#   rpg-deploy status           いまの版とコンテナの状態
#   rpg-deploy list             レジストリのタグ（新しい順に10個）
#   rpg-deploy env <名前> <値>   .env の設定を変えて入れ直す（例 rpg-deploy env GOOGLE_CLIENT_ID xxx.apps.googleusercontent.com）
#   rpg-deploy env <名前> -      値を画面に出さずに入れる（鍵やパスワード。打った値がシェルの履歴に残らない）
#   rpg-deploy env <名前>        いまの値を見る（公開してよい値だけ出し、ほかは長さだけ）
set -euo pipefail
SELF=$(readlink -f "$0")
APP_DIR=${RPG_APP_DIR:-/opt/rpg}
ENV_FILE=$APP_DIR/.env
KEEP_HISTORY=10
die() { echo "❌ $*" >&2; exit 1; }
[ -f "$ENV_FILE" ] || die "$ENV_FILE がありません"
cd "$APP_DIR"
# 同時に2つ動かさない
exec 9>"/tmp/rpg-deploy.lock"
flock -n 9 || die "ほかの rpg-deploy が動いています"
current_image() { grep -E '^IMAGE=' "$ENV_FILE" | tail -n1 | cut -d= -f2-; }
env_value() { grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2-; }
image_repo() { local i; i=$(current_image); echo "${i%:*}"; }
# レジストリのタグ一覧。docker login の情報（~/.docker/config.json）を使う。Basic 認証が通らなければ Bearer トークンを取る
list_tags() {
  local image registry repo
  image=$(image_repo)
  registry=${image%%/*}
  repo=${image#*/}
  python3 - "$registry" "$repo" <<'PY'
import base64, json, os, re, sys, urllib.request, urllib.error, urllib.parse
registry, repo = sys.argv[1], sys.argv[2]
cfg = os.path.join(os.environ.get("DOCKER_CONFIG", os.path.expanduser("~/.docker")), "config.json")
try:
    auth = json.load(open(cfg))["auths"][registry]["auth"]
except Exception:
    sys.exit(f"{cfg} に {registry} のログイン情報がありません（docker login してください）")
basic = "Basic " + auth
url = f"https://{registry}/v2/{repo}/tags/list?n=1000"
def get(u, header):
    return urllib.request.urlopen(urllib.request.Request(u, headers={"Authorization": header}), timeout=20)
try:
    res = get(url, basic)
except urllib.error.HTTPError as e:
    challenge = e.headers.get("WWW-Authenticate", "")
    if e.code != 401 or not challenge.startswith("Bearer"):
        sys.exit(f"タグの一覧を取れません（HTTP {e.code}）")
    params = dict(re.findall(r'(\w+)="([^"]*)"', challenge))
    q = {k: params[k] for k in ("service", "scope") if k in params}
    q.setdefault("scope", f"repository:{repo}:pull")
    tok = json.load(get(params["realm"] + "?" + urllib.parse.urlencode(q), basic))
    res = get(url, "Bearer " + (tok.get("token") or tok.get("access_token")))
for t in json.load(res).get("tags") or []:
    print(t)
PY
}
# dev-YYYYMMDD-<番号> を新しい順に並べる
dev_tags_newest_first() {
  list_tags | grep -E '^dev-[0-9]{8}-[0-9]+$' | sort -t- -k2,2nr -k3,3nr
}
# .env の IMAGE を書き換える。前の行は「# 前回 IMAGE=」で残し、古い履歴は KEEP_HISTORY 個まで
set_image() {
  local new=$1 tmp
  tmp=$(mktemp)
  sed 's/^IMAGE=/# 前回 IMAGE=/' "$ENV_FILE" > "$tmp"
  echo "IMAGE=$new" >> "$tmp"
  prune_history "$tmp"
  cat "$tmp" > "$ENV_FILE"   # 上書きで中身だけ変える（持ち主と 600 をそのままにする）
  rm -f "$tmp"
}
# 「# 前回 <名前>=」の行を KEEP_HISTORY 個まで残す（古いものから消す）
prune_history() {
  local file=$1 name=${2:-IMAGE} total drop
  total=$(grep -c "^# 前回 $name=" "$file" || true)
  drop=$(( total > KEEP_HISTORY ? total - KEEP_HISTORY : 0 ))
  [ "$drop" -gt 0 ] || return 0
  awk -v drop="$drop" -v key="# 前回 $name=" 'index($0, key) == 1 && n < drop { n++; next } { print }' "$file" > "$file.p" && mv "$file.p" "$file"
}
# rpg-deploy env で画面に出してよい設定（鍵・パスワードは入れない）
PUBLIC_ENV="SITE_ADDRESS REDIRECT_ADDRESSES APP_ENV APP_URL GOOGLE_CLIENT_ID MAIL_FROM SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER AI_PROVIDER AI_BASE_URL AI_REASONING_EFFORT MODEL_HIGH MODEL_LIGHT MAIL_SCHEDULE_ENABLED IDLE_STOP_MINUTES COMPOSE_PROFILES BACKUP_BUCKET BACKUP_KEEP IMPORT_BUCKET ASSETS_BUCKET NOTIFY_BUCKET S3_ENDPOINT S3_REGION"
is_public() { case " $PUBLIC_ENV " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }
show_env() {
  local name=$1 value
  grep -qE "^$name=" "$ENV_FILE" || { echo "ℹ️ $name は .env にありません"; return 0; }
  value=$(env_value "$name")
  if [ -z "$value" ]; then echo "ℹ️ $name は空です"
  elif is_public "$name"; then echo "$name=$value"
  else echo "$name は設定されています（${#value} 文字。値は出しません）"
  fi
}
# .env の <名前>= の行を書き換える。前の行は「# 前回 <名前>=」で残す。なければ末尾に足す
set_env() {
  local name=$1 value=$2 tmp
  tmp=$(mktemp)
  awk -v key="$name=" -v old="# 前回 $name=" 'index($0, key) == 1 { print old substr($0, length(key) + 1); next } { print }' "$ENV_FILE" > "$tmp"
  printf '%s=%s\n' "$name" "$value" >> "$tmp"
  prune_history "$tmp" "$name"
  cat "$tmp" > "$ENV_FILE"   # 上書きで中身だけ変える（持ち主と 600 をそのままにする）
  rm -f "$tmp"
}
env_cmd() {
  local name=${1:-} value
  [ -n "$name" ] || die "使い方：rpg-deploy env <名前> [<値>|-]"
  [[ "$name" =~ ^[A-Z][A-Z0-9_]*$ ]] || die "名前は英大文字・数字・_ で書いてください：$name"
  [ "$name" != IMAGE ] || die "IMAGE は rpg-deploy <タグ> で変えてください"
  if [ $# -lt 2 ]; then show_env "$name"; return 0; fi
  value=$2
  if [ "$value" = - ]; then
    read -r -s -p "$name の値：" value; echo
  fi
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || die "値に改行は入れられません"
  if [ "$name" = GOOGLE_CLIENT_ID ] && [ -n "$value" ] && [[ "$value" != *.apps.googleusercontent.com ]]; then
    die "GOOGLE_CLIENT_ID は …apps.googleusercontent.com の形です（クライアントシークレットではありません）"
  fi
  if grep -qE "^$name=" "$ENV_FILE" && [ "$(env_value "$name")" = "$value" ]; then
    echo "ℹ️ $name はすでにその値です"
    return 0
  fi
  set_env "$name" "$value"
  echo "📝 $name を書き換えました（前の値は「# 前回 $name=」で残しています）"
  docker compose up -d
  check
  if [ "$name" = GOOGLE_CLIENT_ID ]; then
    echo "--- Googleでログインの設定（A-38）"
    curl -fsS --max-time 10 --resolve "$(env_value SITE_ADDRESS):443:127.0.0.1" "https://$(env_value SITE_ADDRESS)/api/auth/google/config" || echo "（取れませんでした）"
    echo
  fi
}
# api が healthy になるまで待って、Caddy 越しに /api/health を確かめる
check() {
  local site health i
  echo "⏳ api が起動するのを待っています"
  for i in $(seq 1 36); do
    health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$(docker compose ps -q api)" 2>/dev/null || echo unknown)
    [ "$health" = healthy ] && break
    sleep 5
  done
  docker compose ps --format 'table {{.Service}}\t{{.Status}}'
  echo "--- api のログ（migrate・ERROR、直近10分）"
  docker compose logs --since 10m api 2>&1 | grep -E 'migrate|ERROR' | tail -n 20 || true
  site=$(env_value SITE_ADDRESS)
  if [ "$health" = healthy ] && curl -fsS --max-time 10 --resolve "$site:443:127.0.0.1" "https://$site/api/health" > /dev/null; then
    echo "✅ 反映できました：$(current_image)"
  else
    echo "❌ api が正常になりません（状態：$health）。戻すときは rpg-deploy rollback"
    exit 1
  fi
}
deploy() {
  local tag=$1 repo new
  repo=$(image_repo)
  new="$repo:$tag"
  if [ "$new" = "$(current_image)" ]; then
    echo "ℹ️ すでに $tag が入っています"
    docker compose ps --format 'table {{.Service}}\t{{.Status}}'
    return 0
  fi
  echo "🚀 $(current_image | sed 's/.*://') → $tag"
  docker pull -q "$new" > /dev/null || die "$new を取れません"
  # DB をこのサーバーに置いているときは、マイグレーションの前にバックアップする（戻すときは rpg-db restore）
  if [ "$(env_value COMPOSE_PROFILES)" = localdb ] && command -v rpg-db > /dev/null; then rpg-db backup || die "バックアップに失敗したため反映しません"; fi
  set_image "$new"
  docker compose up -d
  check
}
case "${1:-}" in
  "")
    tag=$(dev_tags_newest_first | head -n1)
    [ -n "$tag" ] || die "dev-* のタグがレジストリにありません"
    deploy "$tag"
    ;;
  rollback)
    prev=$(grep -E '^# 前回 IMAGE=' "$ENV_FILE" | tail -n1 | cut -d= -f2-)
    [ -n "$prev" ] || die "前回の IMAGE が .env にありません"
    # いちばん新しい「# 前回」の行を消してから戻す（もう一度 rollback すると行ったり来たりする）
    tmp=$(mktemp)
    awk -v n="$(grep -c '^# 前回 IMAGE=' "$ENV_FILE")" '/^# 前回 IMAGE=/ && ++i == n { next } { print }' "$ENV_FILE" > "$tmp"
    cat "$tmp" > "$ENV_FILE"; rm -f "$tmp"
    echo "↩️ $(current_image | sed 's/.*://') → ${prev##*:}"
    set_image "$prev"
    docker compose up -d
    check
    ;;
  status)
    echo "📦 いまの版：$(current_image)"
    docker compose ps --format 'table {{.Service}}\t{{.Status}}'
    ;;
  list)
    dev_tags_newest_first | head -n 10
    ;;
  env)
    shift
    env_cmd "$@"
    ;;
  -h|--help|help)
    sed -n '2,11p' "$SELF" | sed 's/^# \{0,1\}//'
    ;;
  -*)
    die "知らないオプションです：$1（rpg-deploy help）"
    ;;
  *)
    deploy "$1"
    ;;
esac
