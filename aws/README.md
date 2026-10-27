# AWS 版（退避）
2026-10-27 に、さくらのクラウドへの切り替えに合わせて、AWS 向けに作ったコードと文書をこのディレクトリに退避した。中身は退避した時点のまま変えていない。
## 退避した理由
- AWS アカウントで Amazon Bedrock（全モデル）と AWS Lambda が使えなくなり、復旧の見込みが立たないため
- AI は Bedrock が使えるようになりしだい、さくら版の `AI_PROVIDER=bedrock` で Bedrock に戻す予定（さくら版の詳細設計書 3.6）
## 中身
| パス | 内容 |
| --- | --- |
| `functions/` | Lambda 4関数（api-handler・grading-worker・import-worker・batch-runner）と共通モジュール |
| `web/` | 画面（Cognito の認可コード＋PKCE でログイン） |
| `tests/` | モジュールテスト（591件） |
| `scripts/` | Lambda の zip と画面のビルド |
| `documents/` | 要件定義書・外部設計書・詳細設計書・AWS構築手順書・モジュールテスト仕様書・結果報告書（AWS 版の最後の版） |
| `workflows/` | AWS 版の GitHub Actions（`ci.yml`・`check-aws-dev.yml`）。`.github/workflows/` の外に置いているため動かない |
## 動かし方
```bash
cd aws
npm ci
npm test
```
## AWS に残っているリソース（dev 環境）
2026-10-25 に構築した dev 環境（`rpg-dev-*`。S3・SQS・Aurora・CloudFront・Cognito・Lambda・API Gateway など）は削除していない。使わないなら、Aurora・Secrets Manager など料金がかかるものから消す。
