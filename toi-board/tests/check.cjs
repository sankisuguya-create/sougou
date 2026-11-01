/* といボード 見本の検査
   実行: node tests/check.cjs  （Playwright の chromium を使う）
   - 全段階の操作が通るか
   - 予想を書く前はシールを貼れない／1人3枚まで（不変条件）
   - IMEで変換中の Enter では付箋が貼られない
   - 描画に中国語フォントが使われていない
   - コンソールにエラーが出ない
   画面写真を tests/shots/ に保存する */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const FILE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const SHOTS = path.resolve(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

let failed = 0;
function ok(cond, msg) { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) failed++; }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'assert') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto(FILE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const who = v => page.selectOption('#who', v);
  const phase = async n => { await who('teacher'); await page.click(`[data-act=phase][data-n="${n}"]`); };
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('toiboard.v1')));

  // ① 問いを出す
  await phase(1);
  await who('c01');
  ok(await page.isVisible('text=4年 かけて 作った') === false, '1ばんは1はん（阪急西宮北口）の焦点が出る');
  ok(await page.isVisible('text=ホームベース'), '焦点の文が表示される');
  for (const q of ['どうして うめたの？', 'いつ なくなったの？', 'だれが きめたの？', 'ホームベースは 本物なの？']) {
    await page.fill('#draft', q);
    await page.press('#draft', 'Enter');
  }
  let st = await state();
  ok(st.notes.filter(n => n.author === 'c01').length === 4, 'Enter で付箋が4まい貼れる');
  ok(await page.evaluate(() => document.activeElement.id) === 'draft', '貼ったあとも書く欄にカーソルが残る（続けて書ける）');

  // IME変換中の Enter では貼られない
  await page.fill('#draft', 'へんかんちゅう');
  await page.evaluate(() => {
    const el = document.getElementById('draft');
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true, bubbles: true }));
  });
  st = await state();
  ok(st.notes.filter(n => n.author === 'c01').length === 4, 'IMEの変換中の Enter では付箋が増えない');
  await page.fill('#draft', '');

  // 別の児童（同じ班）
  await who('c02');
  await page.fill('#draft', 'どうして 野球場が なくなったの？'); await page.press('#draft', 'Enter');
  await page.fill('#draft', 'ホームベースは 何こ あるの？'); await page.press('#draft', 'Enter');
  await page.screenshot({ path: SHOTS + '/1-produce.png', fullPage: true });

  // ② 問いを直す
  await phase(2);
  await who('c01');
  const first = (await state()).notes[0];
  await page.click(`[data-act=lane][data-id="${first.id}"]`);
  st = await state();
  ok(st.notes[0].lane === 1, 'タップで「ひとことで 答えられる」へ移る');
  await page.click(`[data-act=lane][data-id="${first.id}"]`);
  ok((await state()).notes[0].lane === 2, 'もう一度タップで「せつめいが いる」へ移る');
  const closed = (await state()).notes.find(n => n.text.startsWith('いつ'));
  await page.click(`[data-act=edit][data-id="${closed.id}"]`);
  await page.click('[data-act=starter][data-i="6"]');
  await page.fill('#edit-text', 'どうして 野球場は なくなったのに ホームベースは のこしたの？');
  await page.screenshot({ path: SHOTS + '/2-henshin.png' });
  await page.click('[data-act=edit-save]');
  st = await state();
  const changed = st.notes.find(n => n.parent === closed.id);
  ok(!!changed && st.notes.find(n => n.id === closed.id).changedTo === changed.id, 'へんしんした付箋が元とつながって残る');
  await page.screenshot({ path: SHOTS + '/2-improve.png', fullPage: true });

  // ③ えらぶ
  await phase(3);
  await who('c01');
  const cand = (await state()).notes.filter(n => n.team === 1 && !n.changedTo);
  for (const n of cand.slice(0, 4)) await page.click(`[data-act=pick][data-id="${n.id}"]`);
  st = await state();
  ok(st.picks[1].length === 3, '4つ目はえらべない（3つまで）');
  await page.click(`[data-act=pick][data-id="${cand[1].id}"]`);
  ok((await state()).picks[1].length === 2, 'もう一度タップでやめられる');
  await page.click(`[data-act=pick][data-id="${cand[3].id}"]`);
  st = await state();
  for (const p of st.picks[1]) await page.fill(`#why-${p.noteId}`, 'みんなが 知らなそうだから');
  st = await state();
  ok(st.picks[1].every(p => p.reason), 'えらんだ わけが保存される');
  await page.screenshot({ path: SHOTS + '/3-pick.png', fullPage: true });

  // 見本のデータ
  await who('teacher');
  await page.click('[data-act=tab][data-t=demo]');
  await page.click('[data-act=seed]');
  st = await state();
  ok(Object.keys(st.picks).length === 7, '見本のデータで7はんぶんの「えらんだ3つ」がそろう');
  ok(st.picks[1].length === 3 && st.picks[1][0].reason, '見本のデータは自分たちの班を書きかえない');

  // ④ 見合い会
  await phase(4);
  await who('c01');
  const target = st.picks[3][0].noteId;
  ok(await page.isDisabled(`[data-star="${target}"]`), '予想を書く前はシールを押せない');
  await page.fill(`#pred-${target}`, '戦争が 終わったから');
  ok(!(await page.isDisabled(`[data-star="${target}"]`)), '予想を書くとシールを押せる');
  await page.click(`[data-star="${target}"]`);
  ok((await state()).stars.some(s => s.viewer === 'c01' && s.noteId === target), 'シールを押すと記録に残る');
  await page.screenshot({ path: SHOTS + '/4-gallery.png' });
  // 「よそうできない！」でも貼れる
  const t2 = st.picks[4][0].noteId;
  await page.check(`[data-cant="${t2}"]`);
  ok(!(await page.isDisabled(`[data-star="${t2}"]`)), '「よそうできない！」でもシールを押せる');
  await page.click(`[data-star="${t2}"]`);
  const t3 = st.picks[5][0].noteId;
  await page.fill(`#pred-${t3}`, 'たくさん いる'); await page.click(`[data-star="${t3}"]`);
  const t4 = st.picks[6][0].noteId;
  await page.fill(`#pred-${t4}`, 'ゆうめいだから');
  ok(await page.isDisabled(`[data-star="${t4}"]`), '4まい目は押せない（1人3まいまで）');
  await page.click(`[data-star="${target}"]`);
  ok(!(await page.isDisabled(`[data-star="${t4}"]`)), 'はがすと また貼れる');
  // 予想を消すとシールも外れる（予想の無いシールを残さない）
  await page.fill(`#pred-${t3}`, '');
  st = await state();
  ok(!st.stars.some(s => s.viewer === 'c01' && s.noteId === t3), '予想を消すとその問いのシールも外れる');
  ok(!(await page.isVisible(`[data-star="${st.picks[1][0].noteId}"]`)), '自分の班の問いにはシールの欄が出ない');
  await page.screenshot({ path: SHOTS + '/4-gallery-full.png', fullPage: true });

  // ⑤ けっか
  await phase(5);
  await who('c01');
  const mine = st.picks[1];
  await page.click(`[data-act=type][data-id="${mine[0].noteId}"][data-t=nazo]`);
  await page.click(`[data-act=main][data-id="${mine[1].noteId}"]`);
  await page.fill('#main-why', 'しりたい！が いちばん 多かったから');
  st = await state();
  ok(st.types[mine[0].noteId] === 'nazo' && st.main[1].noteId === mine[1].noteId && st.main[1].reason, '問いの種類とメインの問いが保存される');
  await page.screenshot({ path: SHOTS + '/5-result.png', fullPage: true });

  // 先生：焦点の「？」警告・書き出し
  await who('teacher');
  await page.click('[data-act=tab][data-t=focus]');
  await page.fill('#focus-3', 'どうして 使われなかったの？');
  ok(await page.isVisible('[data-fwarn="3"]'), '焦点が「？」で終わると注意が出る');
  await page.fill('#focus-3', '4年 かけて 作った 砲台は、一ども 使われなかった。');
  ok(!(await page.isVisible('[data-fwarn="3"]')), 'ふつうの文に直すと注意が消える');
  await page.click('[data-act=tab][data-t=export]');
  ok(await page.isVisible('text=変わった'), '1ばんに選んだ問いからの変化が書き出しに出る');
  await page.screenshot({ path: SHOTS + '/6-teacher-export.png', fullPage: true });
  await page.click('[data-act=tab][data-t=watch]');
  await page.screenshot({ path: SHOTS + '/6-teacher-watch.png', fullPage: true });

  // 別タブへの即時反映（本番の「先生の切り替えが届く」の代わり）
  // 同じ context の別タブは localStorage を共有する
  const p2 = await ctx.newPage();
  await p2.goto(FILE);
  await p2.selectOption('#who', 'c05');
  await page.click('[data-act=phase][data-n="1"]');
  await p2.waitForTimeout(300);
  ok(await p2.isVisible('.compose'), '先生の切り替えが別タブの児童画面にすぐ届く');

  // 日本語フォント
  const cdp = await ctx.newCDPSession(p2);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const sels = ['.ftext', 'h1', '.rules li', '.btn.primary'];
  const bad = /WenQuanYi|SimSun|YaHei|PingFang|CJK SC|CJK TC|Heiti|Ming/i;
  for (const s of sels) {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: s });
    if (!nodeId) { ok(false, 'フォント検査の対象が無い ' + s); continue; }
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    const names = fonts.map(f => f.familyName).join(', ');
    ok(!bad.test(names), `日本語フォントで描画（${s}: ${names}）`);
  }

  ok(errors.length === 0, 'コンソールにエラー・アサートが無い' + (errors.length ? '：' + errors.join(' / ') : ''));
  await browser.close();
  console.log(failed ? `\n${failed} 件 失敗` : '\nすべて合格');
  process.exit(failed ? 1 : 0);
})();
