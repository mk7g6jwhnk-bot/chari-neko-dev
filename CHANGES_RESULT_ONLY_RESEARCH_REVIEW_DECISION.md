# v189 Result-only research review decision

- v188のSeal済み研究レビュー資料に対する手動判定を追加。
- verdictは `APPROVE_RESEARCH_TRIAL` / `HOLD` / `REJECT` の3種。
- APPROVE時は支持・反証・未解決点をすべて確認した acknowledgement と理由を必須化。
- 承認しても `RESEARCH_TRIAL_CANDIDATE_ONLY`。研究版での試験計画作成を許可するだけで、試験実行・予想利用・確率校正・本番反映は不可。
- 判定をSeal化し、事後改変は `SEAL_MISMATCH`。
