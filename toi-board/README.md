# といボード

3年総合「西宮博」で、班ごとのダッシュボードに問いの付箋を貼り、直し、選び、見合うためのボード。

- `index.html` … v2 ダッシュボード式（現行）
- `v1-lanes.html` … v1 レーン式（参考）
- `gas/` … GAS版（本番）。手順は [gas/README.md](gas/README.md)

## 見本の動かし方
`index.html` をブラウザで開き、上の「見本の切り替え」で先生／児童を切り替える（本番は Google アカウントで自動判定）。
1. 先生 →「見本の 付箋を 入れる」→ モード（共同閲覧・アイデア提案・シール班の中／外）を入れる
2. 児童 → 付箋を書く・ドラッグ・重ねる・矢印・枠／ほかの班を見る・いただきものへ送る・シールを貼る

保存は localStorage（同じブラウザの別タブに即時反映）。本番は GAS ＋スプレッドシートへ（`Platform` 層のみ交換）。

## 検査
`NODE_PATH=$(npm root -g) node tests/check.cjs`（見本）
`node gas/build.cjs && NODE_PATH=$(npm root -g) node tests/gas-check.cjs`（GAS版を模擬で）

設計の理由は [docs/design.md](docs/design.md)。児童の実名・学級情報はこのリポジトリに置かない。
