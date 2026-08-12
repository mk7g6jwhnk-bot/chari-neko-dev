# チャリ猫 競輪予想取得 修正版

今回アップロードされた「chari-neko-dev-new」が実際の最新ブランチでした。
この修正版は、その最新コードに対してだけ適用するものです。

修正点:
- 個別予想で /keirin/preview を先に叩く方式を廃止
- /keirin/race を直接使用
- 取得時間を28秒→最大56秒へ拡張
- タイムアウト/502/一時障害時に最大2回取得
- raceCardUrlもブラウザサービスへ渡す
- officialData.basic + 5人以上を取得成功条件にする
- modules/keirin 側も同じ修正
- 予想ロジック・購入ロジックは変更しない

検証済み:
- npm run check : OK
- keirin-browser-evidence-adapter : PASS
- prediction-flow : PASS

適用方法:
1. ZIPを展開
2. 中の netlify/functions/keirin-predict.mjs と
   modules/keirin/netlify/functions/keirin-predict.mjs を、
   現在の chari-neko-dev-new の同じ場所へ上書き
3. GitHub DesktopでCommit
4. Push
5. NetlifyのBranch Deployが完了したら再テスト

注意:
前回の修正スクリプトでは「外側の古いフォルダ」に変更を入れる可能性があり、
今回アップロードされた最新プロジェクトには実際の修正が反映されていませんでした。
今回はアップロードされた最新ブランチの中身を直接確認して修正しています。
