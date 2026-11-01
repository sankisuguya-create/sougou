/* ../index.html（見本）の PLATFORM 区間を platform-gas.js に 差し替えて Index.html を 作る。
   実行: node gas/build.cjs
   GAS へは Code.gs と Index.html を 同じ コミットから 2つとも 貼る（片方だけ 貼らない）。 */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const plat = fs.readFileSync(path.join(__dirname, 'platform-gas.js'), 'utf8').trim();
const B = "'PLATFORM_BEGIN';", E = "'PLATFORM_END';";
const i = src.indexOf(B), j = src.indexOf(E);
if (i < 0 || j < 0 || j < i) { console.error('PLATFORM の 印が 見つかりません'); process.exit(1); }
const out = src.slice(0, i) + plat + src.slice(j + E.length);
if (out.includes("localStorage.setItem(KEY")) { console.error('見本の 保存が 残っています'); process.exit(1); }
const code = fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8');
const want = (out.match(/API_WANT = (\d+)/) || [])[1], api = (code.match(/API_VER = (\d+)/) || [])[1];
if (!want || want !== api) { console.error(`版が 合いません：画面 ${want}／サーバー ${api}`); process.exit(1); }
fs.writeFileSync(path.join(__dirname, 'Index.html'), out);
console.log(`Index.html を 作りました（${out.length} 字、API ${api}）`);
