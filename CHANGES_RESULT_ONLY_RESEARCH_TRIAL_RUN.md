# v192 Result-only research trial run

- v191 の独立開始承認を前提に、結果のみ研究仮説の SHADOW_ONLY 研究試験ランを開始できるようにした。
- 開始時に activation review / plan / decision の Seal を再検証する。
- target cohort、minimum races、evaluation metrics、stop conditions、post-trial review requirement を計画と完全一致でロックする。
- 実行中ステータスは `RESEARCH_TRIAL_SHADOW_MONITORING_ACTIVE`、判断は `MONITOR_RESEARCH_TRIAL_ONLY`。
- 研究試験は shadow 計測のみ。予想利用、予想値変更、確率校正、本番書込み、自動昇格は禁止。
- run payload と run Seal を保存し、事後変更は `SEAL_MISMATCH` で拒否する。
