# v146 Purchase funnel audit fix

- v144以降の全終端生成方式に旧監査を追従。
- 展開枝に終端が0件でも、その枝の全経路が RULE_IMPOSSIBLE / DATA_CONTRADICTION 等の明示済み許可理由で非成立なら、エンジン全体を監査失敗にしない。
- 理由なしの枝欠落、AUDIT_MISS、生成監査不通過は従来通り遮断。
- inactiveBranchAudit を追加し、非活性枝と理由コードを保存。
- ENGINE_AUDIT_FAILED による全終端一括購入遮断の誤作動を防止。
