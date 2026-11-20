# といボード

3年総合「西宮博」で、班ごとのダッシュボードに問いの付箋を貼り、直し、選び、見合うためのボード。

## どこに何があるか
| フォルダ | 中身 | 手で直すか |
|---|---|---|
| `src/` | 原本。`index.html`（見本＝画面の原本）・`platform-gas.js`（GAS用の保存部品）・`Code.gs`（サーバー） | **直すのはここだけ** |
| `dist/` | GASに貼る3つ（`Code.gs`・`Index.html`・`Trial.html`）。`tools/build.cjs` が `src/` から作る | 直さない |
| `setup/` | 本番の設置手順 [setup/README.md](setup/README.md) と、最初の1回だけ使う `whoami/` | — |
| `tools/` | `build.cjs`（src→dist）・`make-stickers.cjs`（シールの絵の正本） | — |
| `stickers/` | シール画像（`make-stickers.cjs` が作る） | 直さない |
| `tests/` | 検査 | — |
| `docs/` | 設計の理由 [design.md](docs/design.md)・個人情報の扱い [privacy.md](docs/privacy.md) | — |
| `archive/` | 使っていない旧版（v1 レーン式） | — |

## 直す流れ
1. `src/` を直す
2. `node tools/build.cjs` で `dist/` を作り直す（忘れると CI が失敗する）
3. 検査してコミット・push → 校務PCで [setup/README.md](setup/README.md) の手順2のとおり `dist/` の3つを貼り直す

## 見本の動かし方
`src/index.html` をブラウザで開き、上の「見本の切り替え」で先生／児童を切り替える（本番は Google アカウントで自動判定）。
1. 先生 →「見本の 付箋を 入れる」→ モード（共同閲覧・アイデア提案・シール班の中／外）を入れる
2. 児童 → 付箋を書く・ドラッグ・重ねる・矢印・枠／ほかの班を見る・いただきものへ送る・シールを貼る

保存は localStorage（同じブラウザの別タブに即時反映）。本番は GAS ＋スプレッドシートへ（`Platform` 層のみ交換）。

## 検査
`NODE_PATH=$(npm root -g) node tests/check.cjs`（見本）
`node tools/build.cjs && NODE_PATH=$(npm root -g) node tests/gas-check.cjs`（GAS版を模擬で）

児童の実名・学級情報はこのリポジトリに置かない。
