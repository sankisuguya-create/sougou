/* といボード GAS版の 検査：Code.gs を Node で 模擬（スプレッドシート・キャッシュ・ロック）し、
   gas/Index.html を 複数の アカウントで 同時に 開いて 確かめる。
   実行: node gas/build.cjs && NODE_PATH=$(npm root -g) node tests/gas-check.cjs
   模擬で 確かめられないこと（実機で 確かめる）：Session のメールが 別ドメインで 読めるか／同時実行の 上限／遅延。 */
const path = require('path'), fs = require('fs'), vm = require('vm'), crypto = require('crypto');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const FILE = 'file://' + path.join(ROOT, 'gas', 'Index.html');
const SHOTS = path.join(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
let failed = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ===== GAS の 模擬 ===== */
function makeGas() {
  const sheets = {}, props = {}, cache = {};
  let user = '';
  /* スプレッドシートと 同じく、文字列の「1-1」は 日付に、数字だけの 文字列は 数に 自動で 変える（書式を 文字（@）に した 列は 変えない） */
  function auto(v, isText) {
    if (isText || typeof v !== 'string') return v;
    let m = v.match(/^(\d{1,2})-(\d{1,2})$/);
    if (m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31) return new Date(2026, +m[1] - 1, +m[2]);
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    return v;
  }
  function Sheet(name) {
    const data = [], textCols = new Set();
    const sh = {
      name, data,
      getLastRow: () => data.length,
      getLastColumn: () => data.reduce((m, r) => Math.max(m, r.length), 0),
      getRange: (r, c, nr = 1, nc = 1) => ({
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const row = data[r - 1 + i] || []; const v = row[c - 1 + j]; return v === undefined ? '' : v; })),
        setValues: vals => { vals.forEach((row, i) => { while (data.length < r + i) data.push([]); row.forEach((v, j) => { data[r - 1 + i][c - 1 + j] = (r + i === 1) ? v : auto(v, textCols.has(c + j)); }); }); },
        setNumberFormat: f => { if (f === '@') for (let j = 0; j < nc; j++) textCols.add(c + j); }
      }),
      getMaxRows: () => Math.max(1000, data.length), getMaxColumns: () => 26
    };
    return sh;
  }
  const ss = {
    getName: () => 'といボード（模擬）', getSpreadsheetTimeZone: () => 'Asia/Tokyo',
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = Sheet(n))
  };
  const ctx = {
    SpreadsheetApp: { getActive: () => ss, flush: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, setProperties: o => Object.assign(props, o) }) },
    CacheService: { getScriptCache: () => ({ get: k => (k in cache ? cache[k] : null), getAll: ks => { const o = {}; ks.forEach(k => { if (k in cache) o[k] = cache[k]; }); return o; }, put: (k, v) => { cache[k] = String(v); }, putAll: o => Object.assign(cache, o), remove: k => delete cache[k], removeAll: ks => ks.forEach(k => delete cache[k]) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Session: { getActiveUser: () => ({ getEmail: () => user }) },
    Utilities: { formatDate: (d, tz, f) => f === 'M-d' ? (d.getMonth() + 1) + '-' + d.getDate() : String(d), DigestAlgorithm: { MD5: 'md5' }, computeDigest: (a, s) => Array.from(crypto.createHash('md5').update(s).digest()).map(b => (b > 127 ? b - 256 : b)) },
    HtmlService: {}, Logger: { log: () => {} },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/a/macros/x/s/ID/exec' }) },
    JSON, Date, Number, String, Math, Error, Object
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'gas', 'Code.gs'), 'utf8'), ctx);
  return {
    ctx, sheets, props,
    as(email, fn, args) { user = email; return JSON.parse(JSON.stringify(ctx[fn].apply(null, args || []))); },
    fill(name, rows) { const sh = sheets[name]; sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows); }
  };
}

(async () => {
  const G = makeGas();
  G.ctx.setup();
  const D = '@kyoiku.edu.nishi.or.jp';
  G.fill('名簿', [
    ['a01' + D, 'A', 1, 1], ['a02' + D, 'A', 1, 2], ['a05' + D, 'A', 2, 5], ['b01' + D, 'B', 1, 1], ['b05' + D, 'B', 2, 5]
  ]);
  G.fill('先生', [['ta@edu.nishi.or.jp', 'A']]);
  G.fill('スポット', [['A', 1, '阪急西宮北口'], ['A', 2, '甲山'], ['B', 1, '甲子園球場'], ['B', 2, '西宮神社']]);

  // 名簿に ない人・メールが 空
  let threw = ''; try { G.as('x99' + D, 'boot'); } catch (e) { threw = String(e.message); }
  ok(/NOT_IN_ROSTER/.test(threw), '名簿に ない 児童は 開けない');
  threw = ''; try { G.as('', 'boot'); } catch (e) { threw = String(e.message); }
  ok(/NO_EMAIL/.test(threw), 'メールが 読めない時は 理由を 出す');
  ok(G.as('tb@edu.nishi.or.jp', 'boot').me.role === 'teacher', '先生ドメインは 先生として 開ける');
  const reload = async p => { await p.reload(); await p.waitForSelector('.head, .teacher, .gal'); };

  const browser = await chromium.launch();
  const calls = {}; let failBoot = 0, failApply = 0, bootErr = '';
  const errors = [];
  async function open(email, w = 1366) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 768 } });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'assert') errors.push(email + ': ' + m.text()); });
    page.on('pageerror', e => errors.push(email + ': ' + e));
    await page.exposeFunction('__gas', (fn, args) => { calls[fn] = (calls[fn] || 0) + 1; if (fn === 'apply' && failApply > 0) { failApply--; return { ng: 'Exception: Service Spreadsheets timed out' }; } if (fn === 'boot' && failBoot > 0) { failBoot--; return { ng: 'Service invoked too many times for one user per minute' }; } if (fn === 'boot' && bootErr) { return { ng: bootErr }; } try { return { ok: G.as(email, fn, args) }; } catch (e) { return { ng: String(e.message) }; } });
    await page.addInitScript(() => {
      window.TOI_POLL_MS = 400; window.TOI_POLL_JIT = 0;
      const mk = (okf, ngf) => new Proxy({}, { get: (t, k) => {
        if (k === 'withSuccessHandler') return f => mk(f, ngf);
        if (k === 'withFailureHandler') return f => mk(okf, f);
        return (...a) => { window.__gas(k, a).then(r => setTimeout(() => (r.ng ? ngf && ngf(new Error(r.ng)) : okf && okf(r.ok)), 0)); };
      } });
      window.google = { script: { run: mk(null, null) } };
    });
    await page.goto(FILE);
    await page.waitForFunction(() => document.querySelector('.head, .teacher, .gal') || (document.getElementById('app') || {}).textContent.includes('ひらけません'));
    return page;
  }
  const write = async (p, t) => { await p.click('[data-act=add]'); await p.fill('#w-text', t); await p.press('#w-text', 'Enter'); };
  const settle = () => sleep(1300);

  const a01 = await open('a01' + D), a02 = await open('a02' + D), b01 = await open('b01' + D), ta = await open('ta@edu.nishi.or.jp');
  ok(!(await a01.isVisible('#who')), '本番では 見本の 切り替えが 出ない');
  ok(await a01.isVisible('h1:has-text("阪急西宮北口")'), 'アカウントから 自分の班の スポットが 出る');

  await write(a01, 'どうして 北口なの？');
  await a01.click('.face[data-face=back]'); await write(a01, 'うらの 問い');
  await a01.click('.face[data-face=front]');
  await settle();
  ok(await a02.isVisible('#board .note:has-text("どうして 北口なの？")'), '同じ班の 別の端末に 届く');
  ok(G.sheets.items.data.length === 3, 'スプレッドシートに 1まい 1行で 書かれる');

  // 同じ班で 2人が 別々の付箋を ほぼ同時に 動かしても 両方 残る
  await write(a02, 'いつ できたの？');
  await settle();
  const ids = await a01.evaluate(() => S.items.filter(x => x.face === 'front').map(x => x.id));
  await a01.evaluate(id => commit(() => { item(id).x = 20; }), ids[0]);
  await a02.evaluate(id => commit(() => { item(id).x = 30; }), ids[1]);
  await settle();
  const xs = await a01.evaluate(ids => ids.map(id => item(id).x), ids);
  ok(xs[0] === 20 && xs[1] === 30, '同じ班の 2人の 変更が 両方 のこる');

  // B組：モードが 切なら ほかの班は 見えない。サーバーも 送らない
  ok(!(await b01.isVisible('[data-act=look]')), 'モードが 切なら ほかの班の ボタンは 出ない');
  let r = G.as('b01' + D, 'poll', [{ teams: { 'B-1': 0, 'A-1': 0 } }]);
  ok(!r.items.some(x => x.team === 'A-1'), 'モードが 切なら サーバーは ほかの班の 付箋を 送らない');

  // 先生：A組だけ 学年で 共同閲覧 → B組の 児童には まだ 届かない（モードは 見る側の 組で 決まる）
  await ta.click('[data-act=mode][data-k=view][data-v=grade]');
  ok(await ta.isVisible('text=10秒ほどで 届きます（ページの 更新は いりません）'), 'モードを 変えると 先生に「10秒ほどで 届く」と 出る');
  await settle();
  ok(!(await b01.isVisible('[data-act=teams]')), 'A組の モードは B組の 児童に 効かない');
  await ta.click('[data-act=tcls][data-c=B]');
  await ta.click('[data-act=mode][data-k=view][data-v=grade]');
  await ta.click('[data-act=mode][data-k=propose][data-v=grade]');
  await settle();
  const bootsBefore = calls.boot;
  ok(await b01.isVisible('[data-act=teams]') && calls.boot === bootsBefore, 'モードは ページを 開き直さなくても ふだんの 確認で 届く（「ほかの組」が 出る）');
  await b01.click('[data-act=teams]'); await b01.click('[data-act=look][data-t="A-1"]');
  // 模擬の サーバーは すぐ 返すので、まだ 読みこみ中なら「よみこんでいます」、もう 届いていれば 付箋が 出ていれば よい
  ok(await b01.isVisible('text=よみこんでいます') || await b01.isVisible('#board .note'), 'ほかの班を 開くと 取りに行く間は「よみこんでいます」（届けば 付箋）');
  await settle();
  ok(await b01.isVisible('#board .note:has-text("どうして 北口なの？")'), 'ほかの組の 班の 表がわを 見られる');
  r = G.as('b01' + D, 'poll', [{ teams: { 'B-1': 0, 'A-1': 0 } }]);
  ok(!r.items.some(x => x.face === 'back' && x.team === 'A-1') && r.items.every(x => !x.author), 'サーバーは ほかの班の うらがわ と 書いた人を 送らない');

  // アイデア提案：B組1はん → A組1はんの いただきもの
  await b01.click('.face[data-face=gift]');
  await b01.click('[data-act=add]'); await b01.fill('#w-text', 'ホームは いくつ あるの？'); await b01.click('[data-act=w-save]');
  await settle();
  await a01.click('.face[data-face=gift]');
  ok(await a01.isVisible('text=B組1はんから'), 'いただきものに ほかの組の 班名だけ 出る');
  await a01.screenshot({ path: SHOTS + '/g1-gift.png' });

  // サーバーは 権限の ない 書き込みを はねる
  r = G.as('b01' + D, 'apply', [{ up: [{ id: 'evil', kind: 'note', team: 'A-1', face: 'front', x: 1, y: 1, text: 'x' }], del: [ids[0]], star: [], modes: { cls: 'A', m: { view: 'off' } } }]);
  ok(r.rejected.includes('evil') && r.rejected.includes(ids[0]) && r.rejected.includes('modes') && !G.sheets.items.data.some(x => x[0] === 'evil'), 'ほかの班への 書き込み・消去・モード変更は はねられる');

  // シール：A組1はんが 1まいを「見てほしい」に。B組 班の外を 学年に → b01 は シール貼り画面
  await a01.click('.face[data-face=front]');
  await a01.evaluate(id => commit(() => { item(id).showcase = true; }), ids[0]);
  await ta.click('[data-act=mode][data-k=view][data-v=off]');
  await ta.click('[data-act=mode][data-k=starOut][data-v=grade]');
  await settle(); await reload(b01);
  ok(await b01.isVisible('text=シールを 貼ろう'), 'B組が シール貼り画面に なる');
  const bigs = await b01.$$eval('.big', els => els.map(e => e.dataset.id));
  ok(bigs.length === 1 && bigs[0] === ids[0], '開いた時に 範囲の 班の「見てほしい付箋」だけが 届く（共同閲覧が 切でも）');
  const bb = await b01.locator(`.big[data-id="${ids[0]}"]`).boundingBox();
  await b01.mouse.click(bb.x + 60, bb.y + 60);
  await b01.click('[data-act=kind][data-k=pick]');
  await b01.mouse.click(bb.x + 150, bb.y + 90);
  G.as('b05' + D, 'apply', [{ up: [], del: [], star: [{ noteId: ids[0], k: 'star', on: true, x: 20, y: 20, r: 3 }] }]);
  await sleep(1600); await settle();  // シールは 1.5秒 ためて 送る
  ok((await a01.textContent(`[data-stars="${ids[0]}"] [data-kind=star] .cnt`)).trim() === '2' && await a01.locator(`[data-stars="${ids[0]}"] [data-kind=pick]`).count() === 1, '自分の班では 種類ごとの 数が 見える');
  r = G.as('a01' + D, 'poll', [{ teams: { 'A-1': 0 } }]);
  ok(r.stars.length === 3 && r.stars.every(s => /^o[0-9a-f]+$/.test(s.viewer) && s.x === undefined), '貼った人は 記号に なり、場所は 本人にしか 届かない');
  await reload(b01);
  ok(await b01.locator(`.big[data-id="${ids[0]}"] .seal`).count() === 2, '開き直しても 自分の シールは 貼った 場所に のこる');
  r = G.as('b01' + D, 'poll', [{ teams: { 'B-1': 0, 'A-1': 0 } }]);
  ok(r.stars.length === 2 && r.stars.every(s => s.viewer === 'b01' + D), 'ほかの班の 付箋は 自分の シールだけ 届く');
  await b01.screenshot({ path: SHOTS + '/g3-gallery.png' });

  // 持ち分（サーバー）：1つの班に 種類ごとに 2まいまで
  r = G.as('b05' + D, 'apply', [{ up: [], del: [], star: [{ noteId: ids[1], k: 'pick', on: true }, { noteId: 'ax0', k: 'pick', on: true }] }]);
  G.as('a01' + D, 'apply', [{ up: ['az1', 'az2'].map((id, i) => ({ id, kind: 'note', team: 'A-1', face: 'front', x: 30 + i * 8, y: 1, text: 'もう1まい' + i })), del: [], star: [] }]);
  const aNotes = G.as('ta@edu.nishi.or.jp', 'poll', [{ all: 0 }]).items.filter(x => x.team === 'A-1' && x.kind === 'note' && x.face === 'front').map(x => x.id);
  r = G.as('b05' + D, 'apply', [{ up: [], del: [], star: aNotes.slice(0, 3).map(id => ({ noteId: id, k: 'wow', on: true })) }]);
  ok(aNotes.length >= 3 && r.rejected.length === 1 && r.rejected[0] === '*' + aNotes[2] + '|wow', 'サーバーも 同じ班への 同じ種類の 3まい目を はねる');
  r = G.as('b05' + D, 'apply', [{ up: [], del: [], star: [{ noteId: aNotes[0], k: 'wow', on: false }, { noteId: aNotes[2], k: 'wow', on: true }] }]);
  ok(r.rejected.length === 0, 'はがせば また 貼れる');

  // コメント（サーバー）：シール（班の外）が 届く 班の 付箋にだけ。相手の 班には だれが 書いたか 届かない
  r = G.as('b01' + D, 'apply', [{ up: [], del: [], star: [], cmt: [{ noteId: ids[0], text: 'ホームは いくつ？', on: true }] }]);
  ok(r.rejected.length === 0, 'ほかの班の 付箋に コメントを 書ける');
  r = G.as('a01' + D, 'apply', [{ up: [], del: [], star: [], cmt: [{ noteId: ids[0], text: '自分の 班', on: true }] }]);
  ok(r.rejected.length === 1, '自分の班の 付箋には（シール貼りの 範囲の外なので）書けない');
  r = G.as('a01' + D, 'poll', [{ teams: { 'A-1': 0 } }]);
  ok(r.comments.length === 1 && r.comments[0].text === 'ホームは いくつ？' && /^o[0-9a-f]+$/.test(r.comments[0].viewer), '書かれた 班には コメントが 届き、書いた人は 記号');
  await reload(a01); await a01.click('.face[data-face=front]');
  ok(await a01.isVisible(`#board .note[data-id="${ids[0]}"] .cicon`), '児童の 画面に コメントの しるしが 出る');
  r = G.as('b01' + D, 'apply', [{ up: [], del: [], star: [], cmt: [{ noteId: ids[0], on: false }] }]);
  r = G.as('a01' + D, 'poll', [{ teams: { 'A-1': 0 } }]);
  ok(r.comments.every(c => !c.on), 'コメントを けせる');

  // 回（サーバー）：B組の 回を 2に すると、A組の 付箋への シールは A組の 回（1）、持ち分は 回ごと
  G.as('ta@edu.nishi.or.jp', 'apply', [{ up: [], del: [], star: [], modes: { cls: 'A', m: Object.assign({}, JSON.parse((G.sheets.modes.data.find(r => r[0] === 'A') || [0, '{}'])[1]), { round: 2 }) } }]);
  r = G.as('b05' + D, 'apply', [{ up: [], del: [], star: aNotes.slice(0, 2).map(id => ({ noteId: id, k: 'wow', on: true })) }]);
  ok(r.rejected.length === 0, '回が 進むと 同じ班に また 2まい 貼れる（持ち分が もどる）');
  r = G.as('b05' + D, 'poll', [{ teams: { 'B-2': 0, 'A-1': 0 } }]);
  ok(r.stars.filter(s => s.k === 'wow' && s.rd === 2).length === 2 && r.stars.some(s => s.k === 'wow' && s.rd === 1), 'シールは 回ごとに 分けて 記録される');

  ok(G.as('ta@edu.nishi.or.jp', 'boot').trialUrl.endsWith('/exec?trial=1') && (await ta.click('[data-act=ttab][data-k=more]'), await ta.isVisible('a[href$="/exec?trial=1"]')) && (await ta.click('[data-act=ttab][data-k=mode]'), true), '先生画面の「体験する」は 本番の URL に ?trial=1 を つけて ひらく');

  // 班の中の いいね（サーバー）：自分の班の 付箋だけ、持ち分・回に 関係なく
  r = G.as('a02' + D, 'apply', [{ up: [], del: [], star: [{ noteId: ids[0], k: 'thumb', rd: 0, on: true }] }]);
  ok(r.rejected.length === 0, '自分の班の 付箋に いいねを つけられる');
  r = G.as('b01' + D, 'apply', [{ up: [], del: [], star: [{ noteId: ids[0], k: 'thumb', rd: 0, on: true }] }]);
  ok(r.rejected.length === 1, 'ほかの班の 付箋には いいねは つけられない');
  r = G.as('a01' + D, 'poll', [{ teams: { 'A-1': 0 } }]);
  ok(r.stars.some(s => s.k === 'thumb' && s.rd === 0), 'いいねは 回に 関係ない（rd=0）');
  ok(r.stars.some(s => s.k === 'thumb' && s.slot === 1) && JSON.stringify(G.as('a01' + D, 'boot').me.mates.map(m => [m.slot, m.no])) === '[[0,1],[1,2]]', 'いいねには 班の 中の 番号順（色・形）が つき、メンバーの 番号が 届く（メールは 届かない）');
  ok(!JSON.stringify(G.as('a01' + D, 'boot').me.mates).includes('a02'), 'ほかの メンバーの メールは 届かない');

  // 90人の 同時アクセスへの そなえ
  // ① 開くのに 失敗（混雑）しても、間を おいて 自動で やり直す
  failBoot = 2;
  const busy = await open('a05' + D);
  ok(await busy.isVisible('.head, .gal') && failBoot === 0, '開くのに 2回 失敗しても 自動で やり直して 開ける');
  // ② シールの 書きこみは 1.5秒 ためて まとめて 送る
  await ta.click('[data-act=tcls][data-c=A]'); await ta.click('[data-act=mode][data-k=starOut][data-v=class]');
  await sleep(1500);
  ok(await busy.isVisible('text=シールを 貼ろう'), 'シール（班の外）も ページの 開き直し なしで 切りかわる');
  const ap0 = calls.apply || 0;
  const bigs2 = await busy.$$eval('.big', els => els.map(e => e.dataset.id));
  for (const [i, kk] of [['star', 0], ['pick', 1], ['wow', 2]].map((x, j) => [j, x[0]])) {
    await busy.click(`[data-act=kind][data-k=${kk}]`);
    const bb = await busy.locator(`.big[data-id="${bigs2[0]}"]`).boundingBox(); await busy.mouse.click(bb.x + 40 + i * 40, bb.y + 60);
  }
  await sleep(2600);
  ok((calls.apply || 0) - ap0 === 1, 'シールを 3まい つづけて 貼っても 書きこみは 1回に まとまる');
  const ap1 = calls.apply || 0;
  await busy.click('[data-act=kind][data-k=bulb]');
  { const bb2 = await busy.locator(`.big[data-id="${bigs2[0]}"]`).boundingBox(); await busy.mouse.click(bb2.x + 160, bb2.y + 60); }
  await busy.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await sleep(300);
  ok((calls.apply || 0) - ap1 === 1, 'ためている 間に 画面を はなれても すぐ 送る（消えない）');
  // ③ シールだけの 書きこみでは 付箋の シートを 読まない（キャッシュで 班を 引く）
  let itemReads = 0; const orig2 = G.ctx.rows_; G.ctx.rows_ = n => { if (n === 'items') itemReads++; return orig2(n); };
  G.as('a05' + D, 'apply', [{ up: [], del: [], star: [{ noteId: bigs2[0], k: 'bulb', on: true }] }]);
  G.ctx.rows_ = orig2;
  ok(itemReads === 0, 'シールだけの 書きこみでは 付箋の シートを 読まない');
  await ta.click('[data-act=mode][data-k=starOut][data-v=off]');
  await busy.close();

  // データが 勝手に 消えない（サーバー）
  {
  // ① setup を もう一度 実行しても 版は もどらない
  const vBefore = G.props.ver;
  G.ctx.setup();
  ok(G.props.ver === vBefore && Number(vBefore) > 0, 'setup を もう一度 実行しても 版が 0 に もどらない');
  // ② 同じ班の 2人が 同じ 付箋の 別の 項目を ほぼ同時に 変えても 両方 のこる
  const nid2 = 'safe1';
  G.as('a01' + D, 'apply', [{ up: [{ id: nid2, kind: 'note', team: 'A-1', face: 'front', x: 2, y: 30, text: 'もとの 文' }], del: [], star: [] }]);
  G.as('a02' + D, 'apply', [{ up: [{ id: nid2, team: 'A-1', p: { text: 'B が 直した 文' }, u: [] }], del: [], star: [] }]);
  G.as('a01' + D, 'apply', [{ up: [{ id: nid2, team: 'A-1', p: { x: 9 }, u: [] }], del: [], star: [] }]);  // A は 古い 画面のまま 動かした
  const got1 = JSON.parse(G.sheets.items.data.find(r => r[0] === nid2)[3]);
  ok(got1.text === 'B が 直した 文' && got1.x === 9, '同じ 付箋を 2人が 別々に 変えても 両方 のこる（文は 消えない）');
  r = G.as('b01' + D, 'apply', [{ up: [{ id: nid2, team: 'A-1', p: { text: 'x' }, u: [] }], del: [], star: [] }]);
  ok(r.rejected.includes(nid2) && JSON.parse(G.sheets.items.data.find(x => x[0] === nid2)[3]).text === 'B が 直した 文', 'ほかの班は 変えられない');
  r = G.as('a01' + D, 'apply', [{ up: [{ id: nid2, team: 'A-1', p: { team: 'B-1', author: 'x' }, u: ['text'] }], del: [], star: [] }]);
  const got2 = JSON.parse(G.sheets.items.data.find(x => x[0] === nid2)[3]);
  ok(got2.team === 'A-1' && got2.author === 'a01' + D && got2.text === undefined, '班・書いた人は 変えられない（文を 消すのは 自分の 班なら できる）');
  // ④ 消した 付箋を 同じ班なら もどせる（やり直し）
  G.as('a01' + D, 'apply', [{ up: [], del: [nid2], star: [] }]);
  r = G.as('a01' + D, 'apply', [{ up: [{ id: nid2, kind: 'note', team: 'A-1', face: 'front', x: 9, y: 30, text: 'もどした 文' }], del: [], star: [] }]);
  ok(r.rejected.length === 0 && !G.sheets.items.data.find(x => x[0] === nid2)[5], '消した 付箋を 同じ班なら もどせる');
  r = G.as('b01' + D, 'apply', [{ up: [{ id: nid2, kind: 'note', team: 'A-1', face: 'gift', x: 1, y: 1, text: 'x' }], del: [], star: [] }]);
  ok(JSON.parse(G.sheets.items.data.find(x => x[0] === nid2)[3]).text === 'もどした 文', 'ほかの班は その 付箋を 書きかえられない');
  // ⑦ 先生の 完全削除：中身を 消し、重なりは 単独に、矢印・シール・コメントも 消す。児童は もどせない
  G.as('a01' + D, 'apply', [{ up: [{ id: 'kid1', kind: 'note', team: 'A-1', face: 'front', x: 9, y: 30, text: '下の 付箋', stackOf: nid2 }, { id: 'arw1', kind: 'arrow', team: 'A-1', face: 'front', from: nid2, to: ids[0] }], del: [], star: [] }]);
  G.as('a02' + D, 'apply', [{ up: [], del: [], star: [{ noteId: nid2, k: 'thumb', rd: 0, on: true }] }]);
  r = G.as('a01' + D, 'apply', [{ up: [], del: [], star: [], purge: [nid2] }]);
  ok(r.rejected.length === 1, '児童は 完全削除できない');
  const vp = G.props.ver;
  r = G.as('ta@edu.nishi.or.jp', 'apply', [{ up: [], del: [], star: [], purge: [nid2] }]);
  const prow = G.sheets.items.data.find(x => x[0] === nid2), kid = JSON.parse(G.sheets.items.data.find(x => x[0] === 'kid1')[3]);
  ok(r.rejected.length === 0 && prow[5] === true && !prow[3].includes('もどした') && JSON.parse(prow[3]).purged && kid.stackOf === undefined && G.sheets.items.data.find(x => x[0] === 'arw1')[5] === true, '先生は 付箋を 完全に 消せる（文は のこらない・重なりは 単独に・矢印も 消える）');
  r = G.as('a01' + D, 'poll', [{ teams: { 'A-1': Number(vp) } }]);
  ok(r.items.some(x => x.id === nid2 && x.del) && !r.stars.some(s => s.noteId === nid2 && s.on), '完全削除は 児童の 画面に「消えた」と 届き、シールも 消える');
  r = G.as('a01' + D, 'apply', [{ up: [{ id: nid2, kind: 'note', team: 'A-1', face: 'front', x: 1, y: 1, text: 'もどす' }], del: [], star: [] }]);
  ok(r.rejected.includes(nid2), '先生が 完全に 消した 付箋は 児童が もどせない');
  }

  // データが 勝手に 消えない（画面から）
  {
  // ② 古い 画面の 子が 動かしても、別の 子が 直した 文は のこる
  await a01.click('.face[data-face=front]'); await a02.click('.face[data-face=front]');
  const sid = await a01.evaluate(() => { const id = nid(); commit(() => { S.items.push({ id, kind: 'note', team: 'A-1', face: 'front', x: 30, y: 2, text: 'はじめ', author: me }); }); return id; });
  await settle();
  await a02.evaluate(id => commit(() => { item(id).text = 'B が 直した'; }), sid);
  await a01.evaluate(id => commit(() => { item(id).x = 33; }), sid);   // a01 は まだ「はじめ」の 画面
  await settle(); await settle();
  const sv = JSON.parse(G.sheets.items.data.find(r => r[0] === sid)[3]);
  ok(sv.text === 'B が 直した' && sv.x === 33 && (await a01.evaluate(id => item(id).text, sid)) === 'B が 直した', '古い 画面の 子が 動かしても、別の 子が 直した 文は 消えない（画面にも 届く）');
  // ③ もとに もどす（Ctrl+Z）は 自分が 変えた 項目だけ
  await a01.evaluate(id => commit(() => { item(id).y = 9; }), sid);
  await settle();
  await a02.evaluate(id => commit(() => { item(id).text = 'B が もう一度 直した'; }), sid);
  await settle(); await settle();
  await a01.evaluate(() => undo());
  await settle(); await settle();
  const sv2 = JSON.parse(G.sheets.items.data.find(r => r[0] === sid)[3]);
  ok(sv2.y === 2 && sv2.text === 'B が もう一度 直した', 'もとに もどす は 自分が 変えた 項目だけ（ほかの 子の 文は のこる）');
  // ④ 書いて → もどす（消える）→ やり直す で 付箋が もどる
  const rid = await a01.evaluate(() => { const id = nid(); commit(() => { S.items.push({ id, kind: 'note', team: 'A-1', face: 'front', x: 30, y: 8, text: 'やり直しの 付箋', author: me }); }); return id; });
  await settle();
  await a01.evaluate(() => undo()); await settle();
  await a01.evaluate(() => redo()); await settle(); await settle();
  const rr = G.sheets.items.data.find(r => r[0] === rid);
  ok(rr && rr[5] === false && JSON.parse(rr[3]).text === 'やり直しの 付箋', '書いて → もどす → やり直す で 付箋が もどる');
  // ⑤ 通信が 切れている 間に 書いて 閉じても、次に 開いた 時に 送る
  const lost = await open('a02' + D);
  failApply = 50;
  const lid = await lost.evaluate(() => { const id = nid(); commit(() => { S.items.push({ id, kind: 'note', team: 'A-1', face: 'front', x: 40, y: 2, text: '切れている 間の 付箋', author: me }); }); return id; });
  await sleep(800);
  ok(!G.sheets.items.data.some(r => r[0] === lid), '（準備）通信が 切れていて まだ 届いていない');
  const ctxL = lost.context(); const again2 = await ctxL.newPage();
  await lost.close();
  failApply = 0;
  await again2.exposeFunction('__gas', (fn, args) => { calls[fn] = (calls[fn] || 0) + 1; try { return { ok: G.as('a02' + D, fn, args) }; } catch (e) { return { ng: String(e.message) }; } });
  await again2.addInitScript(() => { window.TOI_POLL_MS = 400; window.TOI_POLL_JIT = 0; const mk = (okf, ngf) => new Proxy({}, { get: (t, k) => { if (k === 'withSuccessHandler') return f => mk(f, ngf); if (k === 'withFailureHandler') return f => mk(okf, f); return (...a) => { window.__gas(k, a).then(r => setTimeout(() => (r.ng ? ngf && ngf(new Error(r.ng)) : okf && okf(r.ok)), 0)); }; } }); window.google = { script: { run: mk(null, null) } }; });
  await again2.goto(FILE); await again2.waitForSelector('.head, .gal');
  await sleep(1500);
  ok(G.sheets.items.data.some(r => r[0] === lid && JSON.parse(r[3]).text === '切れている 間の 付箋'), '通信が 切れている 間に 書いて 閉じても、次に 開いた 時に 送られる');
  await again2.close();
  }

  // 学習が 止まらない（サーバー）
  {
  // 1つの 変な 書きこみで ほかの 書きこみが 止まらない
  const big = 'あ'.repeat(6000);
  r = G.as('a01' + D, 'apply', [{ up: [
    { id: 'bad1', kind: 'note', team: 'A-1', face: 'front', x: 1, y: 40, text: 'ふつう', junk: { deep: big } },
    { id: 'ok1', kind: 'note', team: 'A-1', face: 'front', x: 9, y: 40, text: 'い'.repeat(500) }
  ], del: [], star: [] }]);
  const okRow = G.sheets.items.data.find(x => x[0] === 'ok1');
  ok(r.rejected.includes('bad1') && okRow && JSON.parse(okRow[3]).text.length === 200, '大きすぎる 付箋は その1まいだけ はねて、ほかは 保存（長い 文は 200字まで）');
  // 見てほしい付箋は 1つの 班で 今の 回に 4まいまで
  const sh = ['sh1', 'sh2', 'sh3', 'sh4', 'sh5'];
  r = G.as('a02' + D, 'apply', [{ up: sh.map((id, i) => ({ id, kind: 'note', team: 'A-1', face: 'front', x: 1 + i * 8, y: 46, text: '見て' + i })), del: [], star: [] }]);
  const rdA = JSON.parse(G.sheets.modes.data.find(x => x[0] === 'A')[1]).round || 1;
  const already = G.sheets.items.data.filter(x => x[1] === 'A-1' && !x[5] && (o => o.face === 'front' && (o.showcase === true ? 1 : +o.showcase || 0) === rdA)(JSON.parse(x[3]))).length;
  r = G.as('a02' + D, 'apply', [{ up: sh.map(id => ({ id, team: 'A-1', p: { showcase: rdA }, u: [] })), del: [], star: [] }]);
  const nowShown = G.sheets.items.data.filter(x => x[1] === 'A-1' && !x[5] && (o => o.face === 'front' && (o.showcase === true ? 1 : +o.showcase || 0) === rdA)(JSON.parse(x[3]))).length;
  ok(nowShown === Math.max(4, already) && r.rejected.length === sh.length - Math.max(0, 4 - already), '見てほしい付箋は 1つの 班で 今の 回に 4まいまで（サーバーでも）');
  // 先生は コメントを 1つずつ 消せる、児童は 消せない
  G.as('b01' + D, 'apply', [{ up: [], del: [], star: [], cmt: [{ noteId: ids[0], text: 'ふさわしくない ことば', on: true }] }]);
  r = G.as('a01' + D, 'apply', [{ up: [], del: [], star: [], cmtDel: [{ noteId: ids[0], viewer: 'b01' + D }] }]);
  ok(r.rejected.includes('cmtDel'), '児童は ほかの 子の コメントを 消せない');
  G.as('ta@edu.nishi.or.jp', 'apply', [{ up: [], del: [], star: [], cmtDel: [{ noteId: ids[0], viewer: 'b01' + D }] }]);
  const crow = G.sheets.comments.data.find(x => x[1] === ids[0] && x[3] === 'b01' + D);
  ok(crow && crow[5] === false && crow[4] === '', '先生は コメントを 1つずつ 消せる（文も のこらない）');
  }

  // 開けない 時は 理由を 出す／シートが 足りなくても 開ける
  {
  delete G.sheets.comments;
  const okb = G.as('a01' + D, 'boot');
  ok(okb.me && G.sheets.comments && G.sheets.comments.data[0][0] === 'key', 'シートが 足りなくても 開ける（その場で 作る）');
  bootErr = "TypeError: Cannot read properties of null (reading 'getLastRow')";
  const bc0 = calls.boot || 0, t0 = Date.now();
  const e1 = await open('a05' + D);
  ok(await e1.isVisible('text=ひらけません') && await e1.isVisible("text=getLastRow") && await e1.isVisible('text=selfCheck') && (calls.boot - bc0) === 1 && Date.now() - t0 < 3000, '設定の まちがいの エラーは やり直さず すぐ 理由と 調べ方を 出す');
  await e1.close();
  bootErr = '';
  ok(/スプレッドシートに つながっているか：はい/.test(G.as('ta@edu.nishi.or.jp', 'selfCheck')), 'selfCheck で 原因を しらべられる');
  }

  // 先生の 一覧
  await ta.click('[data-act=ttab][data-k=list]');
  await ta.click('[data-act=fface][data-f=all]');
  const tsv = await ta.evaluate(() => opinionTSV());
  ok(tsv.includes('A組\t1はん\t阪急西宮北口\t表がわ\tどうして 北口なの？') && !tsv.includes('@'), '先生の 一覧に ずらりと 出て、メールは 入らない');
  await ta.screenshot({ path: SHOTS + '/g2-teacher.png', fullPage: true });

  // 版の 確認：自分の班に 変化が なければ シートを 読まない（ほかの班の 書き込みでは 読まない）
  const tvA = G.as('a01' + D, 'poll', [{ teams: { 'A-1': 0 } }]).tv['A-1'];
  G.as('b05' + D, 'apply', [{ up: [{ id: 'bx', kind: 'note', team: 'B-2', face: 'front', x: 1, y: 1, text: 'B組の 問い' }], del: [], star: [] }]);
  let reads = 0; const orig = G.ctx.rows_; G.ctx.rows_ = n => { reads++; return orig(n); };
  r = G.as('a01' + D, 'poll', [{ teams: { 'A-1': tvA } }]);
  G.ctx.rows_ = orig;
  ok(r.same === true && reads === 0, 'ほかの班が 書いても 自分の班に 変化が なければ シートを 読まない');
  G.as('a02' + D, 'apply', [{ up: [{ id: 'ax', kind: 'note', team: 'A-1', face: 'front', x: 9, y: 9, text: 'A組の 問い' }], del: [], star: [] }]);
  r = G.as('a01' + D, 'poll', [{ teams: { 'A-1': tvA } }]);
  ok(!r.same && r.items.length === 1 && r.items[0].id === 'ax', '自分の班に 変化が あれば 差分だけ 届く');

  // 児童の 端末幅（CZ1104 は 1366x768 だが タブレット縦も 確かめる）
  const small = await open('a05' + D, 800);
  ok(await small.isVisible('[data-act=add]'), '幅 800 でも 付箋を 書ける');

  // 組を 数字（1・2）で 書いた 学校：班の 名前「1-1」が 日付に 変わっても、班の 付箋が 見えて 消えない
  {
  const N = makeGas(); N.ctx.setup();
  N.fill('名簿', [['n1' + D, 1, 1, 1], ['n2' + D, 1, 1, 2], ['n3' + D, 1, 2, 3]]);
  N.fill('スポット', [[1, 1, '甲山'], [1, 2, '夙川']]);
  N.as('n1' + D, 'apply', [{ up: [{ id: 'm1', kind: 'note', team: '1-1', face: 'front', x: 1, y: 1, text: 'n1 の 付箋' }], del: [], star: [] }]);
  N.as('n2' + D, 'apply', [{ up: [{ id: 'm2', kind: 'note', team: '1-1', face: 'front', x: 9, y: 1, text: 'n2 の 付箋' }], del: [], star: [] }]);
  const b2 = N.as('n2' + D, 'boot');
  ok(b2.me.team === '1-1' && ['m1', 'm2'].every(id => b2.items.some(x => x.id === id)), '組が 数字でも、同じ班の 子の 付箋が 見える（n2 に n1 の 付箋が 届く）');
  const r2 = N.as('n2' + D, 'apply', [{ up: [{ id: 'm1', team: '1-1', p: { x: 20 }, u: [] }], del: [], star: [] }]);
  ok(r2.rejected.length === 0 && JSON.parse(N.sheets.items.data.find(x => x[0] === 'm1')[3]).x === 20, '組が 数字でも、同じ班の 付箋を 動かせる（はねられない）');
  const b3 = N.as('n3' + D, 'boot');
  ok(!b3.items.some(x => x.id === 'm1'), '組が 数字でも、ほかの班には 見えない');
  ok(typeof N.sheets.items.data[1][1] === 'string', 'items の 班の 列は 文字の まま 残る（日付に ならない）');
  // すでに 日付に 変わって しまった データ（直す 前の 版で 書いた 分）も 読める
  N.sheets.items.data.push(['old1', new Date(2026, 0, 1), 'front', JSON.stringify({ id: 'old1', kind: 'note', team: '1-1', face: 'front', x: 1, y: 9, text: '前の 版で 書いた 付箋' }), 1, false, 'n1' + D, new Date()]);
  const b4 = N.as('n2' + D, 'boot');
  ok(b4.items.some(x => x.id === 'old1'), 'すでに 日付に 変わった 班の 値も「1-1」と して 読める（前に 書いた 付箋も 見える）');
  }
  ok(errors.length === 0, 'コンソールに エラー・アサートが無い' + (errors.length ? '：' + errors.join(' / ') : ''));
  await browser.close();
  console.log(failed ? `\n${failed} 件 失敗` : '\nすべて合格');
  process.exit(failed ? 1 : 0);
})();
