# v90 競輪ブラウザ502再試行修正

- Railway/Proxy が HTTP 502 のHTML/非JSONを返した場合も、残り時間がある限り必ず2回目へ再試行。
- 旧実装の「開始から15秒以内だけ再試行」という条件を撤廃。
- 1回目30秒、2回目最大22秒へ配分し、一時障害後の再取得時間を確保。
- timeout/接続例外も、残り時間があれば1回だけ再試行。
- endpointAudit に attempt/status/bodyKind/elapsedMs を保存。
- 予想ロジック・全体連動監査はv89のまま。
