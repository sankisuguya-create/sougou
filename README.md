# sougou

総合的な学習の時間で使うツール。

| アプリ | 中身 | 本番の設置・貼り直し |
|---|---|---|
| [toi-board/](toi-board/) | といボード（3年「西宮博」の問いの付箋ボード） | [toi-board/setup/README.md](toi-board/setup/README.md) |

## 校務PCで貼る時
[version.txt](https://cdn.jsdelivr.net/gh/sankisuguya-create/sougou@main/version.txt) を開き、「貼るファイル」の行のアドレス（版に固定）から貼る。push のたびに自動で書き換わる（`.github/workflows/version.yml`）。

## 約束
- 各アプリの `src/` だけを直す。`dist/` は生成物（CI がビルドし忘れをはねる）。
- 児童の実名・学級情報は置かない。
