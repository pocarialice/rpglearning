#!/usr/bin/env bash
# サーバーの中の DB（compose の db コンテナ）のバックアップと復元（構築手順書 3.3・5.3）。サーバーの /usr/local/bin/rpg-db に置く
# バックアップはオブジェクトストレージのバケット BACKUP_BUCKET の db/ に pg_dump の形式（-Fc）で置く
#   rpg-db backup               いまの DB をバックアップする（自動停止の前と、毎日 3:00 にも動く）
#   rpg-db list                 バックアップの一覧（新しい順に10個）
#   rpg-db restore <名前>       バックアップから戻す（例 rpg-db restore rpg-20261107-0300.dump、いちばん新しいものは latest）。いまのデータは消える
#   rpg-db restore-file <パス>  サーバーにあるファイル（pg_dump -Fc）から戻す（データベースアプライアンスからの引っ越しに使う）
#   rpg-db restore-if-empty     DB が空で、バックアップがあれば latest を戻す（サーバーを作り直したときの初回の起動で動く）
#   rpg-db psql                 DB に入る
set -euo pipefail
APP_DIR=${RPG_APP_DIR:-/opt/rpg}
ENV_FILE=$APP_DIR/.env
AWS_IMAGE=amazon/aws-cli:2.22.35
TMP=$(mktemp /tmp/rpg-db.XXXXXX)
trap 'rm -f "$TMP"' EXIT
die() { echo "❌ $*" >&2; exit 1; }
env_value() { grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2-; }
[ -f "$ENV_FILE" ] || die "$ENV_FILE がありません"
cd "$APP_DIR"
BUCKET=$(env_value BACKUP_BUCKET || true)
KEEP=$(env_value BACKUP_KEEP || true); KEEP=${KEEP:-30}
# オブジェクトストレージを aws-cli のコンテナで使う（サーバーに aws-cli を入れない）。キーはアプリと同じ S3_*
s3() {
  [ -n "$BUCKET" ] || die "BACKUP_BUCKET が .env にありません"
  docker run --rm -i \
    -e AWS_ACCESS_KEY_ID="$(env_value S3_ACCESS_KEY_ID)" -e AWS_SECRET_ACCESS_KEY="$(env_value S3_SECRET_ACCESS_KEY)" \
    -e AWS_DEFAULT_REGION="$(env_value S3_REGION)" \
    -e AWS_REQUEST_CHECKSUM_CALCULATION=when_required -e AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
    "$AWS_IMAGE" --endpoint-url "$(env_value S3_ENDPOINT)" s3 "$@"
}
psql_q() { docker compose exec -T db psql -U rpgadmin -d "${2:-rpg}" -v ON_ERROR_STOP=1 -tAc "$1"; }
wait_db() {
  docker compose up -d db > /dev/null 2>&1
  for _ in $(seq 1 60); do
    docker compose exec -T db pg_isready -U rpgadmin -d rpg > /dev/null 2>&1 && return 0
    sleep 2
  done
  die "db が起動しません（docker compose logs db）"
}
# バックアップの名前（db/ のあと）を古い順に
names() { s3 ls "s3://$BUCKET/db/" | awk '{print $4}' | grep -E '^rpg-[0-9]{8}-[0-9]{4}\.dump$' | sort || true; }
backup() {
  wait_db
  local name tmp=$TMP
  name="rpg-$(date +%Y%m%d-%H%M).dump"
  docker compose exec -T db pg_dump -U rpgadmin -d rpg -Fc > "$tmp"
  [ -s "$tmp" ] || die "pg_dump の結果が空です"
  s3 cp - "s3://$BUCKET/db/$name" < "$tmp" > /dev/null
  echo "💾 バックアップしました：$name（$(du -h "$tmp" | cut -f1)）"
  # 古いものを消して KEEP 個だけ残す
  local all n
  all=$(names); n=$(echo "$all" | grep -c . || true)
  if [ "$n" -gt "$KEEP" ]; then
    echo "$all" | head -n $((n - KEEP)) | while read -r old; do s3 rm "s3://$BUCKET/db/$old" > /dev/null && echo "🧹 古いバックアップを消しました：$old"; done
  fi
}
# ファイルから戻す。api・worker を止め、DB rpg を作り直してから pg_restore する
restore_from() {
  local file=$1 label=${2:-$1}
  [ -s "$file" ] || die "$file がないか、空です"
  wait_db
  docker compose stop api worker > /dev/null 2>&1 || true
  psql_q "DROP DATABASE IF EXISTS rpg WITH (FORCE)" postgres > /dev/null
  psql_q "CREATE DATABASE rpg" postgres > /dev/null
  # --clean --if-exists：データベースアプライアンスから public だけを書き出したもの（pg_dump -n public）は CREATE SCHEMA public を含むため、
  # 空の public を消してから作り直す。このコンテナの rpg-db backup で取ったもの（public を作らない）はそのまま戻る
  docker compose exec -T db pg_restore -U rpgadmin -d rpg --no-owner --no-privileges --clean --if-exists --exit-on-error < "$file"
  echo "✅ 戻しました：$label"
  docker compose up -d
}
restore_key() {
  local name=$1 tmp=$TMP
  [ "$name" != latest ] || name=$(names | tail -n1)
  [ -n "$name" ] || die "バックアップがありません（s3://$BUCKET/db/）"
  s3 cp "s3://$BUCKET/db/$name" - > "$tmp"
  restore_from "$tmp" "$name"
}
case "${1:-}" in
  backup) backup ;;
  list) names | tail -n 10 | tac ;;
  restore)
    [ -n "${2:-}" ] || die "使い方：rpg-db restore <名前|latest>（名前は rpg-db list）"
    restore_key "$2"
    ;;
  restore-file)
    [ -n "${2:-}" ] || die "使い方：rpg-db restore-file <パス>"
    restore_from "$2"
    ;;
  restore-if-empty)
    wait_db
    if [ "$(psql_q "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")" != 0 ]; then
      echo "ℹ️ DB にテーブルがあるため戻しません"
    elif [ -z "$(names | tail -n1)" ]; then
      echo "ℹ️ バックアップがないため、空の DB で始めます"
    else
      restore_key latest
    fi
    ;;
  psql) docker compose exec db psql -U rpgadmin -d rpg ;;
  -h|--help|help|"") sed -n '2,9p' "$(readlink -f "$0")" | sed 's/^# \{0,1\}//' ;;
  *) die "知らない使い方です：$1（rpg-db help）" ;;
esac
