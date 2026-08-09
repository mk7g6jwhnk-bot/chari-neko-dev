# Fast prediction fetch fix

新規予想で発生した HTTP 502 の主因になっていた本番用全JSON探索を外し、公式JSJ035〜038/JST013と公式選手プロフィールを中心に予想入力を構成する。研究用wide probeは `KEIRIN_WIDE_JSON_PROBE=1` のときだけ有効。
