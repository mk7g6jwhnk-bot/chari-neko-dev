# Chari-Neko version

- Version: `KEIRIN-0.19.10-predict-preview-first-v246`
- Label: `v246-predict-preview-first`
- Scope: 個別予想の取得経路を preview-first に統一。重い `/keirin/race` の502/timeoutで予想全体が停止しないよう、まず `/keirin/preview` を取得し、失敗時のみ `/keirin/race` にフォールバックする。
