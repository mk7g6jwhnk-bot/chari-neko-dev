## Current

- `KEIRIN-0.5.51-storage-quota-compaction`
- label: `v74-storage-quota-compaction`

## Current

- `KEIRIN-0.5.50-chat-app-diff-audit`
- label: `v73-chat-app-diff-audit`

# Current version

- APP_RELEASE: `KEIRIN-0.5.49-chat-prediction-import`
- Label: `v72-chat-prediction-import`
- Purpose: チャット予想取り込み・比較基盤 STEP 2

KEIRIN-0.5.48-forecast-possibility-separation

## KEIRIN-0.5.48-forecast-possibility-separation
- 「成立可能」と「中心として予測」を別レイヤー化。
- 中心予測は構造枝の最上位（同点時のみ複数）。
- 非中心枝は、スコア分布に自然境界が確認できた上位群だけを「有力な次候補」とし、境界がなければ「可能性として保持」。
- 「可能性として保持」だけの終端は、1着ファミリーの確率質量が大きいだけでは通常購入へ昇格しない。全終端台帳には保持し、高配当は別の実オッズ価値ゲートでのみ購入候補化。
- UIの監査表示を「中心予測 / 有力な次候補 / 可能性として保持 / 例外・リスク」に変更。
- fmtPct未定義による監査表示エラーを修正。

KEIRIN-0.5.46-human-purchase-reasons

買い目根拠の通常表示を日本語中心へ変更。A/B枝・tier・latent・prior等の内部用語は通常判断から外し、各買い目を「なぜ買う？」「判断材料」「分類チェック」で説明する。内部情報は折りたたみの開発用監査に保持。予想・購入ロジックは変更なし。v68の主導権監査表示修正、v67チャット仕様v1基準化、v66終端ライフサイクル監査、v65欠損能力再配分を維持。


## KEIRIN-0.5.47-detail-render-guard
- 買い目理由UIの描画失敗がレース詳細・保存済み予想全体を止めないよう描画境界を追加。
- 各買い目理由を個別に安全描画し、1件の旧保存形式・欠損値で全画面が開かなくなる回帰を防止。
