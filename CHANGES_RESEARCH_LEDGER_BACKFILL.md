# v123 研究学習台帳バックフィル

過去に結果確認済みだが研究台帳へ未登録の保存予想を、起動時に安全に補完する。

- predictionSnapshotIdで重複判定
- 既存研究レコードは一切上書きしない
- 何度実行しても同じ結果（idempotent）
- result.verificationが残っていればそのまま使用
- verificationがなくても確定着順 + 保存済み終端/買い目から安全な範囲だけ再構築
- 原因・途中経過は結果から逆算しない
- storageCompacted等で情報不足ならbackfillDegraded=true
- 旧形式で条件IDがない場合は証拠因果学習へ無理に入れない
