# v191 Result-only research trial activation review

- v190のSHADOW_ONLY研究試験計画に独立手動承認を追加。
- 計画作成者・元研究レビュー担当者と同一IDの自己承認を拒否。
- SHADOW_ONLY、対象コホート、最低30R、4評価指標、4停止条件、試験後レビュー必須を承認時に再監査。
- 承認後も `AUTHORIZED_RESEARCH_TRIAL_START_ONLY` で停止し、試験実行・予想利用・確率校正・本番反映は禁止。
- 承認レビューはSeal固定し、事後変更を `SEAL_MISMATCH` で検出。
