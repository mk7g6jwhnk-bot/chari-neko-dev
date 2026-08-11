# v200 Result-only post limited research application review

- v199 の限定研究適用モニターが上限R数まで無傷で完了した場合のみ、Seal済みの後レビュー資料を生成する。
- 研究サンドボックス効果、Top2/Top3方向差、予想影響ゼロ、研究スコア補正上限順守を支持証拠として固定する。
- 元の研究レビューで保持した反証を引き継ぎ、反証が空ならレビュー候補にしない。
- 5ロールバック条件の非発動証拠を固定する。
- 未解決点が0の場合だけ `MANUAL_POST_LIMITED_RESEARCH_APPLICATION_DECISION_ONLY` に進める。
- 通常予想・買い目・確率校正・本番書込み・自動昇格は禁止のまま。
