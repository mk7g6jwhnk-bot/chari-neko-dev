# v138 買い目0件の根本原因修正

0件の原因は、公式ライン未取得を安全側に倒しすぎていたこと。

- ライン未取得で構造枝を全停止していた
- UNKNOWNを「別線」とみなしてSECOND/THIRDへ余計なextra条件を付けていた
- さらにライン整合を観測できないのに通常MAIN閾値0.58をそのまま使い、自然度0.576級までMAINから落としていた
- MAIN_NATURAL_TERMINAL_NOT_FOUND → purchaseBlocked → 0件になっていた

修正:
- ライン未取得でも選手別LEADER_HOLD / MAKURI_SUCCESSを構造枝として生成
- BANTE_SASHIは並び取得まで保留
- SAME / DIFFERENT / UNKNOWNを分離し、UNKNOWNはuncertain
- degraded modeではライン不明を二重減点しない
- 通常MAIN閾値0.58は維持し、ライン非依存MAINだけ0.54を使用
- 旧0件ケースはreferenceOnlyではなく通常MAIN購入経路へ復帰
- v137のreferenceOnlyは最終安全装置としてのみ残す
