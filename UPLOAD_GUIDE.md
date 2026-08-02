# 今日のアップロード手順

アップロード先: GitHub `chari-neko-dev`

1. このZIPをパソコンで解凍する。
2. 解凍フォルダそのものではなく、中にある全ファイル・全フォルダを使用する。
3. `chari-neko-dev` の作業コピーへ上書きする。
4. 前回スマホで直下へ平らに入った不要な `.mjs` 等は削除する。
5. フォルダ構造を確認する。
6. コミットしてGitHubへプッシュする。
7. Netlifyの自動デプロイを確認する。

## 直下に必要な主な項目

- `public/`
- `netlify/`
- `boat/`
- `keirin/`
- `auto/`
- `modules/`
- `tools/`
- `research/`
- `docs/`
- `package.json`
- `netlify.toml`
- `README.md`

## 今回の追加

- `public/tools/race-search/`: レース横断検索の開発画面
- `tools/race-search/`: 横断検索のソース・テスト
- `research/reverse-tree/`: 3競技共通の逆算展開木研究モジュール

安定版 `chari-neko` にはアップロードしない。
