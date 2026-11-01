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
  function Sheet(name) {
    const data = [];
    const sh = {
      name, data,
      getLastRow: () => data.length,
      getLastColumn: () => data.reduce((m, r) => Math.max(m, r.length), 0),
      getRange: (r, c, nr = 1, nc = 1) => ({
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const row = data[r - 1 + i] || []; const v = row[c - 1 + j]; return v === undefined ? '' : v; })),
        setValues: vals => { vals.forEach((row, i) => { while (data.length < r + i) data.push([]); row.forEach((v, j) => { data[r - 1 + i][c - 1 + j] = v; }); }); }
      })
    };
    return sh;
  }
  const ss = {
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = Sheet(n))
  };
  const ctx = {
    SpreadsheetApp: { getActive: () => ss, flush: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, setProperties: o => Object.assign(props, o) }) },
    CacheService: { getScriptCache: () => ({ get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = String(v); }, putAll: o => Object.assign(cache, o), remove: k => delete cache[k], removeAll: ks => ks.forEach(k => delete cache[k]) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Session: { getActiveUser: () => ({ getEmail: () => user }) },
    Utilities: { DigestAlgorithm: { MD5: 'md5' }, computeDigest: (a, s) => Array.from(crypto.createHash('md5').update(s).digest()).map(b => (b > 127 ? b - 256 : b)) },
    HtmlService: {},
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
  const errors = [];
  async function open(email, w = 1366) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 768 } });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'assert') errors.push(email + ': ' + m.text()); });
    page.on('pageerror', e => errors.push(email + ': ' + e));
    await page.exposeFunction('__gas', (fn, args) => { try { return { ok: G.as(email, fn, args) }; } catch (e) { return { ng: String(e.message) }; } });
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
    await page.waitForSelector('.head, .teacher, .gal');
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
  ok(await ta.isVisible('text=A組の 児童に「ページを 更新して」と 伝えてください'), 'モードを 変えると 先生に 更新の 合図を 出すよう 表示する');
  await reload(b01);
  ok(!(await b01.isVisible('[data-act=teams]')), 'A組の モードは B組の 児童に 効かない');
  await ta.click('[data-act=tcls][data-c=B]');
  await ta.click('[data-act=mode][data-k=view][data-v=grade]');
  await ta.click('[data-act=mode][data-k=propose][data-v=grade]');
  await settle();
  ok(!(await b01.isVisible('[data-act=teams]')), '更新するまでは 前の モードの まま（モードを 確かめに 行かない）');
  await reload(b01);
  ok(await b01.isVisible('[data-act=teams]'), 'B組を 学年に すると 「ほかの組」が 出る');
  await b01.click('[data-act=teams]'); await b01.click('[data-act=look][data-t="A-1"]');
  ok(await b01.isVisible('text=よみこんでいます'), 'ほかの班を 開くと 取りに行く間は「よみこんでいます」');
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
  await settle();
  ok((await a01.textContent(`[data-stars="${ids[0]}"] [data-kind=star]`)).includes('×2') && await a01.locator(`[data-stars="${ids[0]}"] [data-kind=pick]`).count() === 1, '自分の班では 種類ごとの 数が 見える');
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

  ok(G.as('ta@edu.nishi.or.jp', 'boot').trialUrl.endsWith('/exec?trial=1') && await ta.isVisible('a[href$="/exec?trial=1"]'), '先生画面の「体験する」は 本番の URL に ?trial=1 を つけて ひらく');

  // 班の中の いいね（サーバー）：自分の班の 付箋だけ、持ち分・回に 関係なく
  r = G.as('a02' + D, 'apply', [{ up: [], del: [], star: [{ noteId: ids[0], k: 'thumb', rd: 0, on: true }] }]);
  ok(r.rejected.length === 0, '自分の班の 付箋に いいねを つけられる');
  r = G.as('b01' + D, 'apply', [{ up: [], del: [], star: [{ noteId: ids[0], k: 'thumb', rd: 0, on: true }] }]);
  ok(r.rejected.length === 1, 'ほかの班の 付箋には いいねは つけられない');
  r = G.as('a01' + D, 'poll', [{ teams: { 'A-1': 0 } }]);
  ok(r.stars.some(s => s.k === 'thumb' && s.rd === 0), 'いいねは 回に 関係ない（rd=0）');
  ok(r.stars.some(s => s.k === 'thumb' && s.slot === 1) && JSON.stringify(G.as('a01' + D, 'boot').me.mates.map(m => [m.slot, m.no])) === '[[0,1],[1,2]]', 'いいねには 班の 中の 番号順（色・形）が つき、メンバーの 番号が 届く（メールは 届かない）');
  ok(!JSON.stringify(G.as('a01' + D, 'boot').me.mates).includes('a02'), 'ほかの メンバーの メールは 届かない');

  // 先生の 一覧
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

  ok(errors.length === 0, 'コンソールに エラー・アサートが無い' + (errors.length ? '：' + errors.join(' / ') : ''));
  await browser.close();
  console.log(failed ? `\n${failed} 件 失敗` : '\nすべて合格');
  process.exit(failed ? 1 : 0);
})();
