#!/usr/bin/env bash
set -euo pipefail

# 既存の公式結果取得スクリプトを実行する。
# 環境側で CHARI_NEKO_RESULT_FETCH_COMMAND を設定する。
if [ -z "${CHARI_NEKO_RESULT_FETCH_COMMAND:-}" ]; then
  echo "CHARI_NEKO_RESULT_FETCH_COMMAND is not configured" >&2
  exit 2
fi

bash -lc "$CHARI_NEKO_RESULT_FETCH_COMMAND"

# 結果取得後、検証済み結果を学習へ流す。
node research/reverse-tree/engine/run-learning.mjs
