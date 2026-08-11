# v116 手動昇格審査

昇格候補パッケージに審査状態を追加:
- APPROVE_SHADOW
- HOLD
- REJECT

APPROVE_SHADOWでも productionWriteAllowed=false。
本番値は変更せず、次のシャドー比較工程へ進める許可だけ。
