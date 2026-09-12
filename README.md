# ローカル Action Research review

1. このフォルダ（`chari-neko-dev-new`）で `npm run research:action-review` を実行。npmがなければ `research-action-review.cmd` をダブルクリック。
2. ブラウザで http://localhost:8767 を開く。
3. 確認者IDを入力して「未確認レース」を押す。
4. 1Rを選び、取得済みの公式映像URLがあれば開く。
5. 対象選手を確認しQ1〜Q4に回答。分からない項目はUNKNOWN、Q5は必要時のみ。
6. 映像URL／観測メモを入れて「保存して次へ」。UでUNKNOWN、Ctrl+Enterで保存。再起動後も再開できる。

**現在は自動取得元が未設定で実収集0R。** productionへの接続には403〜502を確実に除外できる固定cohort metadataが必要です。設定・保存形式は [運用手順](research/action-tag-live-operation.md)、今回の到達点は [監査レポート](research/action-tag-live-collection-report.md) を参照。

# KEIRIN v0.16.0 audit patch

対象: current `main` of `mk7g6jwhnk-bot/chari-neko-dev`.

変更:
1. `scored -> initiativeAssessment -> branches` を固定。
2. `officialScore` を field-relative evidence として scored に接続。ハード順位ではなく±3点を意味のある差、±8点で最大補正。
3. `initiativeAssessment` は購入判断をしない。候補を削除しない。
4. browser取得を `/keirin/preview -> /keirin/race` の順にし、全体24秒予算。
5. ChatSpecの `sameScenarioMainSibling` によるMAIN昇格を禁止。
6. `NATURAL_PRECEDENCE_PROMOTION` による後段MAIN/COVER昇格を禁止。
7. 最終購入点数は最大8点に制限。ただし候補が1点しかない場合に無理やり2点へ水増ししない。
8. engineVersionを `KEIRIN-0.16.0-initiative-purchase-separation` に更新。
9. initiative audit testを追加。

適用:
`node tools/apply-keirin-v016.mjs`

その後:
`node --check keirin/engine/initiative-assessment.mjs`
`node --check keirin/engine/keirin-engine.mjs`
`node --check keirin/sports/keirin-scoring.mjs`
`node --check keirin/engine/chat-spec-v1-policy.mjs`
`node --check netlify/functions/keirin-predict.mjs`
`node tests/initiative-assessment.audit.mjs`

このパッチはUIを変更しない。
