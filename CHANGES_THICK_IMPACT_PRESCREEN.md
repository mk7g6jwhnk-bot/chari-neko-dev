# v144 Thick impact prescreen

- OOSで再現した厚め研究候補だけを影響評価へ送る。
- 本線的中率、押さえ的中率、回収率、買い目点数、厚め比率の副作用を事前監査する。
- 厚めだけ改善して他指標を悪化させる候補は `SIDE_EFFECT_RISK_DETECTED` で停止する。
- 通過しても `ALLOW_SHADOW_PROPOSAL_ONLY` まで。本番書込み・自動昇格は禁止。
- 研究用閾値は暫定で、今後の母数で校正する。
