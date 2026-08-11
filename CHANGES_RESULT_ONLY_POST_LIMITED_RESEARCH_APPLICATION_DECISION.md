# v201 Result-only post limited research application decision

- v200の限定研究適用後レビューPackageに対する独立手動判定を追加。
- verdict: `APPROVE_INDEPENDENT_RESEARCH_EVALUATION` / `HOLD` / `REJECT`.
- 承認前に支持材料、反証、5ロールバック非発動証拠、研究スコア補正上限順守、予想影響ゼロを再確認。
- 計画者・開始承認者・実行者・過去レビュー担当者と同一 reviewer は承認不可。
- 承認しても `INDEPENDENT_RESEARCH_EVALUATION_CANDIDATE_ONLY` まで。次研究評価の計画のみ許可し、実行は不可。
- 予想利用、ユーザー向け予想変更、確率校正、本番書込み、自動昇格はすべて禁止。
- 判定記録はsource Sealを含めてSeal化し、改変は `SEAL_MISMATCH`。
