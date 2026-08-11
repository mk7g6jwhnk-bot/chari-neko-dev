# v149 Cover breadth guard

- 承認済みcontender頭について、通常のpair/third選択でCOVERが0になる場合だけ最強の分類可能な自然終端を1本救済。
- 未承認頭、sub/risk枝、通常COVER条件を満たさない終端は救済しない。
- coverBreadthAuditを追加し、承認済み別頭に自然候補があるのに押さえ0件の状態を検出。
- MAIN/BUYABLE_HIGHの基準、ライン不足時の安全装置は変更しない。
