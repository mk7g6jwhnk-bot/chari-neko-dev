# v43 light primary screening

- `keirin-odds` の取得先を `/keirin/race` から `/keirin/preview` へ変更。
- 一次選別・一括更新が選手プロフィール/全JSON探索を毎R実行しないように分離。
- 一次選別は1リクエストずつ処理。
- 個別予想は一時的な5xx・browser timeout時のみ1回再試行。
- v42のライン順序監査、ガールズ主導権枝、一次選別UIは維持。
