/* src/ から dist/ を 作る。GAS へ 貼るのは dist/ の 3つだけ（Code.gs・Index.html・Trial.html）。
   実行: node tools/build.cjs
   - dist/Index.html … src/index.html（見本）の PLATFORM 区間を src/platform-gas.js に 差し替えた 本番画面
   - dist/Trial.html … 見本の まま、体験の しるしを 立てた 体験版
   - dist/Code.gs    … src/Code.gs の 写し
   dist/ は 手で 直さない。CI が「ビルドし忘れ」を はねる（.github/workflows/check.yml）。 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'src'), DIST = path.join(ROOT, 'dist');
const rd = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const die = m => { console.error(m); process.exit(1); };
const src = rd('index.html'), plat = rd('platform-gas.js').trim(), code = rd('Code.gs');
const B = "'PLATFORM_BEGIN';", E = "'PLATFORM_END';";
const i = src.indexOf(B), j = src.indexOf(E);
if (i < 0 || j < 0 || j < i) die('PLATFORM の 印が 見つかりません');
const out = src.slice(0, i) + plat + src.slice(j + E.length);
if (out.includes("localStorage.setItem(KEY")) die('見本の 保存が 残っています');
const want = (out.match(/API_WANT = (\d+)/) || [])[1], api = (code.match(/API_VER = (\d+)/) || [])[1];
if (!want || want !== api) die(`版が 合いません：画面 ${want}／サーバー ${api}`);
const trial = src.replace('<script>', '<script>window.TOI_TRIAL = true;</script>\n<script>');
if (!trial.includes('window.TOI_TRIAL = true')) die('体験版を 作れません');
// 生成物の しるし（意味は 持たせない。消えても 動く）
const DT = '<!DOCTYPE html>\n', note = '<!-- 生成物：src/ を 直して node tools/build.cjs で 作る。手で 直さない -->\n';
const mark = h => h.startsWith(DT) ? DT + note + h.slice(DT.length) : die('先頭が <!DOCTYPE html> ではありません');
fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, 'Index.html'), mark(out));
fs.writeFileSync(path.join(DIST, 'Trial.html'), mark(trial));
fs.writeFileSync(path.join(DIST, 'Code.gs'), '/* 生成物：src/Code.gs の 写し。手で 直さない */\n' + code);
console.log(`dist/ に Code.gs・Index.html・Trial.html を 作りました（画面 ${out.length} 字、API ${api}）`);
