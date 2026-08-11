# v148 Thick Sealed Validation Package

- 二段階独立レビュー承認済み候補を、最終検証前に固定スナップショット化。
- 変更範囲・候補内容・レビュー封印・必須評価指標・検証コホートを1つのsealへ固定。
- 検証前後に指標・コホート・候補内容が変更された場合は `SEAL_MISMATCH`。
- 通過しても `RUN_SEALED_VALIDATION_ONLY` まで。本番書込み・自動昇格は禁止。
