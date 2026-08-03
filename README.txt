チャリ猫予想 競輪ブラウザ連携 完成版1.0.3

修正内容:
- Netlify側の会場・日付・R番号監査を修正
- 後段officialData.basicだけで誤判定しない
- Railway診断のselect-race verified結果を最優先の公式確認として採用
- 小田原で選択確認済みなのに監査不合格になる問題へ対応
- 後段JSONのズレは隠さず警告として保持
- レース表示の会場・日付・R番号はユーザー選択値と公式選択確認値で固定
- 出走選手数・車番重複監査は維持

差し替えるファイル:
netlify/functions/keirin-predict.mjs
modules/keirin/netlify/functions/keirin-predict.mjs

更新手順:
1. ZIPを展開
2. 中のファイルとフォルダを既存の chari-neko-dev へ上書き
3. GitHub DesktopでCommit
4. Push origin
5. Netlify Deploy Previewで小田原1R・2R・12Rを確認
