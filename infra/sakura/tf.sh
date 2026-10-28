#!/usr/bin/env bash
# terraform を動かす入口。tfstate を置くオブジェクトストレージのキーを、AWS の環境変数に移してから渡す
# 使い方：infra/sakura/tf.sh dev plan / infra/sakura/tf.sh shared apply
set -euo pipefail
stack=${1:?shared か dev を指定してください}; shift
: "${SAKURACLOUD_ACCESS_TOKEN:?さくらのクラウドの APIキー（トークン）を環境変数に入れてください}"
: "${SAKURACLOUD_ACCESS_TOKEN_SECRET:?さくらのクラウドの APIキー（シークレット）を環境変数に入れてください}"
: "${TFSTATE_ACCESS_KEY:?tfstate 用のオブジェクトストレージのアクセスキーを環境変数に入れてください}"
: "${TFSTATE_SECRET_KEY:?tfstate 用のオブジェクトストレージのシークレットキーを環境変数に入れてください}"
export AWS_ACCESS_KEY_ID=$TFSTATE_ACCESS_KEY AWS_SECRET_ACCESS_KEY=$TFSTATE_SECRET_KEY
unset AWS_SESSION_TOKEN AWS_PROFILE
# S3 互換のストレージは、AWS SDK が既定で付けるチェックサムのヘッダーを受け付けないことがある
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
cd "$(dirname "$0")/$stack"
[ -d .terraform ] || terraform init -input=false
exec terraform "$@"
