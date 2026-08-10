# v65 Missing ability renormalization

- `まくり / 差し / 追走` の根拠が取得できない場合、能力値 `5.00` を代入しない。
- 欠損は `null` として保持し、UI では `未取得` と表示する。
- 1着・2着・3着 role score は、取得済み入力だけで重みを再正規化する。
- 展開枝・終端の条件付き評価も同じ欠損除外方式にし、欠損を 0 点または 5 点として加点・減点しない。
- `scoreTrace` に `missing` と `effectiveWeight` を保存する。
- `abilityMissingAudit` と `kimariteAbilityEvidence` を保存済み予想へ残す。
- これは初期導入。着順別の追加実績（直近3着率など）の重みは実戦検証後に校正する。
