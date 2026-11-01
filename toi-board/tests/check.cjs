/* といボード v2（ダッシュボード式）の検査
   実行: NODE_PATH=$(npm root -g) node tests/check.cjs */
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const FILE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const SHOTS = path.resolve(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
let failed = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) failed++; };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'assert') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(FILE); await page.evaluate(() => localStorage.clear()); await page.reload();
  const who = v => page.selectOption('#who', v);
  const st = () => page.evaluate(() => JSON.parse(localStorage.getItem('toiboard.v3')));
  const write = async t => { await page.click('[data-act=add]'); await page.fill('#w-text', t); await page.press('#w-text', 'Enter'); };
  const box = async id => page.locator(`#board .note[data-id="${id}"]`).boundingBox();
  const dragTo = async (id, x, y) => { const b = await box(id); await page.mouse.move(b.x + 30, b.y + 30); await page.mouse.down(); await page.mouse.move(b.x + 60, b.y + 60, { steps: 4 }); await page.mouse.move(x, y, { steps: 8 }); await page.mouse.up(); };

  await who('A01');
  for (const q of ['どうして うめたの？', 'いつ なくなったの？', 'ホームベースは 本物なの？', 'だれが きめたの？']) await write(q);
  let s = await st();
  ok(s.items.filter(x => x.kind === 'note' && x.face === 'front').length === 4, '付箋を4まい 表がわに貼れる');
  const [a, b, c, d] = s.items.map(x => x.id);

  // ドラッグ → 方眼に吸い付く
  const ba = await box(a);
  await dragTo(a, ba.x + 30 + 200, ba.y + 30 + 290);
  s = await st();
  const A = s.items.find(x => x.id === a);
  ok(Number.isInteger(A.x) && Number.isInteger(A.y) && (A.x !== 1 || A.y !== 1), 'ドラッグで動き、方眼に そろう');

  // 重ねる
  const bc = await box(c); await dragTo(b, bc.x + 60, bc.y + 50);
  const bc2 = await box(c); await dragTo(d, bc2.x + 60, bc2.y + 50);
  s = await st();
  ok(s.items.filter(x => x.stackOf === c).length === 2, '付箋に 重ねると まとまる（2まい）');
  ok(await page.getAttribute(`#board .note[data-id="${c}"]`, 'data-kids') === '2' && await page.locator(`#board .note[data-id="${c}"] .layer`).count() === 2, '重なりは 紙の層の数で 見える');
  ok(!(await page.isVisible(`#board .note[data-id="${b}"]`)), '重ねた付箋は 単独では 表示されない');
  await page.screenshot({ path: SHOTS + '/1-board.png' });

  // 取り出し
  await page.click(`#board .note[data-id="${c}"]`);
  ok(await page.isVisible('text=重なっている 付箋（3まい）'), 'タップで 重なりの中身を 見られる');
  await page.screenshot({ path: SHOTS + '/2-stack.png' });
  await page.click(`[data-act=unstack][data-id="${d}"]`);
  s = await st();
  ok(!s.items.find(x => x.id === d).stackOf, 'とりだすと 単独に もどる');
  await page.click('.sheet-bg', { position: { x: 5, y: 5 } });

  // 印・えらぶ
  await page.click(`#board .note[data-id="${a}"]`);
  await page.click(`[data-act=mark][data-m="2"][data-id="${a}"]`);
  await page.click(`[data-act=pick][data-r="1"][data-id="${a}"]`);
  s = await st();
  ok(s.items.find(x => x.id === a).mark === 2 && s.items.find(x => x.id === a).pick === 1, '印と えらんだ順が 付箋に つく');
  await page.click('.sheet-bg', { position: { x: 5, y: 5 } });
  await page.click(`#board .note[data-id="${d}"]`);
  await page.click(`[data-act=pick][data-r="1"][data-id="${d}"]`);
  s = await st();
  ok(s.items.find(x => x.id === a).pick === 0 && s.items.find(x => x.id === d).pick === 1, '同じ順位は 班で1まいだけ');

  // ゴミ箱（消えない）
  await page.click(`[data-act=toface][data-f=trash][data-id="${d}"]`);
  s = await st();
  ok(s.items.some(x => x.id === d && x.face === 'trash'), 'ゴミばこへ 移しても 消えずに のこる');
  // ドラッグで うらがわタブへ
  const tab = await page.locator('.face[data-face=back]').boundingBox();
  await dragTo(a, tab.x + 40, tab.y + 20);
  s = await st();
  ok(s.items.find(x => x.id === a).face === 'back', '付箋を タブへ ドラッグすると その面へ 移る');

  // 矢印と枠
  await write('つぎの 問い');
  s = await st(); const e = s.items[s.items.length - 1].id;
  await page.click('[data-act=tool][data-t=arrow]');
  await page.click(`#board .note[data-id="${c}"]`);
  await page.click(`#board .note[data-id="${e}"]`);
  s = await st();
  ok(s.items.some(x => x.kind === 'arrow' && x.from === c && x.to === e), '2まいを タップすると 矢印で つながる');
  await page.click('[data-act=frame]');
  s = await st();
  ok(s.items.some(x => x.kind === 'frame'), '枠を おける');
  await page.screenshot({ path: SHOTS + '/3-arrow-frame.png' });

  // 権限：モードが切ってある間
  await who('A05');
  ok(!(await page.isVisible('[data-act=look]')), '共同閲覧が 切ってあれば ほかの班は 見られない');

  // 先生：見本・モード
  await who('teacher');
  await page.click('[data-act=seed]');
  await page.click('[data-act=mode][data-k=view][data-v=class]');
  await page.click('[data-act=mode][data-k=propose][data-v=class]');
  await page.click('[data-act=mode][data-k=starOut][data-v=class]');
  await page.screenshot({ path: SHOTS + '/4-teacher.png', fullPage: true });

  // 別の班の児童
  await who('A05');
  await page.click('[data-act=look][data-t="A-1"]');
  ok(await page.isVisible('text=1はん「阪急西宮北口」を 見ています'), '共同閲覧で ほかの班を 見られる');
  ok(!(await page.isVisible('.face[data-face=back]')) && !(await page.isVisible('.face[data-face=trash]')), 'ほかの班の うらがわ・ゴミばこは 見えない');
  ok(!(await page.isVisible('[data-act=frame]')), 'ほかの班の ボードは 動かせない');
  // シール（班の外）上限なし・1まいの付箋に1人1まい
  await page.click(`#board .note[data-id="${c}"]`);
  await page.click(`[data-act=star][data-id="${c}"]`);
  await page.click(`#board .note[data-id="${e}"]`);
  await page.click(`[data-act=star][data-id="${e}"]`);
  s = await st();
  ok(s.stars.filter(x => x.viewer === 'A05').length === 2, 'シール（班の外）を 何まいでも 貼れる');
  for (const v of ['A06', 'A07', 'A08', 'A09', 'A10', 'A11']) { await page.evaluate(v => { const s = JSON.parse(localStorage.getItem('toiboard.v3')); s.stars.push({ noteId: s.items.find(x => x.text === 'ホームベースは 本物なの？').id, viewer: v }); localStorage.setItem('toiboard.v3', JSON.stringify(s)); }, v); }
  await page.reload(); await page.click('[data-act=look][data-t="A-1"]');
  ok(!(await page.textContent(`[data-stars="${c}"]`)).includes('×'), 'ほかの班では シールの数は 見えない（自分が貼ったかだけ）');
  await who('A01');
  ok((await page.textContent(`[data-stars="${c}"]`)).includes('×7'), '自分の班では 同じシールが「×7」と まとまる');
  await who('A05'); await page.click('[data-act=look][data-t="A-1"]');
  // 提案
  await page.click('.face[data-face=gift]');
  await page.click('[data-act=add]'); await page.fill('#w-text', 'ホームベースは だれが ふむの？'); await page.click('[data-act=w-save]');
  s = await st();
  const g = s.items.find(x => x.fromTeam === 'A-2');
  ok(g && g.team === 'A-1' && g.face === 'gift', 'アイデア提案で ほかの班の いただきものに 貼れる');
  // 自分の班へ シール（班の中）は 切ってあるので 出ない
  await page.click('[data-act=home]');
  const own = (await st()).items.find(x => x.team === 'A-2' && x.face === 'front');
  await page.click(`#board .note[data-id="${own.id}"]`);
  ok(!(await page.isVisible(`[data-act=star][data-id="${own.id}"]`)), 'シール（班の中）が 切ってあれば 自分の班には 貼れない');
  await page.click('.sheet-bg', { position: { x: 5, y: 5 } });

  // 班1 の いただきもの：班名だけ
  await who('A01'); await page.click('.face[data-face=gift]');
  ok(await page.isVisible('text=2はんから') && !(await page.isVisible('text=5ばん')), 'いただきものは 班名だけ 出る');
  await page.screenshot({ path: SHOTS + '/5-gift.png' });

  // 別タブへ モードが 届く
  const p2 = await ctx.newPage(); await p2.goto(FILE); await p2.selectOption('#who', 'A09');
  await who('teacher'); await page.click('[data-act=mode][data-k=view][data-v=off]'); await page.click('[data-act=mode][data-k=propose][data-v=off]');
  await p2.waitForTimeout(300);
  ok(!(await p2.isVisible('[data-act=look]')), '先生の モード切り替えが 別タブに すぐ届く');

  // 組をまたぐ：A組で学年にすると B組の班が 見え、B組は 自分の組の設定（切）のまま
  await who('teacher'); await page.click('[data-act=mode][data-k=view][data-v=grade]');
  await who('A05');
  ok(await page.isVisible('[data-act=teams]'), '学年にすると「ほかの組」が 出る');
  await page.click('[data-act=teams]'); await page.click('[data-act=look][data-t="B-3"]');
  ok(await page.isVisible('text=B組3はん「御前浜・香櫨園浜」を 見ています'), 'ほかの組の班を 見られる');
  await who('B01');
  ok(!(await page.isVisible('[data-act=look]')), 'モードは 組ごと（B組は 切のまま）');
  // 先生の 意見の一覧
  await who('teacher');
  ok(await page.isVisible('text=意見の 一覧'), '先生画面に 意見の一覧が 出る');
  const tsv = await page.evaluate(() => opinionTSV());
  const lines = tsv.split('\n');
  ok(lines[0].split('\t').length === 10 && lines.length > 60 && !/[ABC]\d\d|ばん（/.test(tsv), '一覧は TSV で コピーでき、書いた児童は 入らない');
  await page.click('[data-act=fcls][data-c=B]');
  ok((await page.evaluate(() => opinionTSV())).split('\n').slice(1).every(l => l.startsWith('B組')), '組で しぼれる');
  await page.screenshot({ path: SHOTS + '/6-teacher-table.png', fullPage: true });
  // 検索：児童は 自分の班だけ。ことば・シールで しぼり、タップで その付箋へ 飛ぶ
  await who('A01');
  await page.click('[data-act=search]');
  await page.fill('#s-text', 'どうして');
  const hitTexts = await page.$$eval('.hit .t', els => els.map(e => e.textContent));
  const mineAll = await page.evaluate(() => S.items.filter(x => x.kind === 'note' && x.team === 'A-1').map(x => x.text));
  ok(hitTexts.length > 0 && hitTexts.every(t => t.includes('どうして') && mineAll.includes(t)), '児童の 検索は 自分の班の 付箋だけ・ことばで しぼれる');
  ok(!(await page.evaluate(() => searchHits(myTeam(), 'どうして').some(n => n.team !== 'A-1'))), 'ほかの班の 付箋は 検索に 出ない');
  await page.fill('#s-text', '');
  await page.click('[data-act=s-star]');
  const starHits = await page.$$eval('.hit', els => els.length);
  const starred = await page.evaluate(() => S.items.filter(x => x.team === 'A-1' && x.kind === 'note' && S.stars.some(s => s.noteId === x.id)).length);
  ok(starHits === starred && starHits > 0, 'シールが ある 付箋だけに しぼれる（数の 多い順）');
  await page.click('[data-act=s-star]');
  await page.fill('#s-text', 'うらの');
  if (!(await page.isVisible('.hit'))) { await page.fill('#s-text', 'どこに'); }
  const backHit = await page.$('.hit');
  if (backHit) {
    await backHit.click();
    ok(await page.isVisible('.note.flash') && await page.isVisible('.face.on[data-face=back], .face.on[data-face=front], .face.on[data-face=trash]'), 'タップすると その面へ 移り 付箋が 光る');
  } else ok(false, '検索の 結果から 飛べる');
  await page.screenshot({ path: SHOTS + '/7-search.png' });
  // 先生：学年の 全部を ことば・シールで しぼる（表と コピーに 効く）
  await who('teacher');
  await page.click('[data-act=fcls][data-c=all]');
  await page.fill('#t-q', '灯台');
  const tq = await page.evaluate(() => opinionTSV().split('\n').slice(1));
  ok(tq.length >= 0 && tq.every(l => l.includes('灯台')), '先生の 一覧を ことばで しぼれる');
  await page.fill('#t-q', '');
  await page.click('[data-act=fstar]');
  const ts = await page.evaluate(() => opinionTSV().split('\n').slice(1));
  ok(ts.length > 0 && ts.every(l => /\t\d+\t[^\t]*\t[^\t]*$/.test(l)), '先生の 一覧を シールで しぼれる');
  ok(errors.length === 0, 'コンソールに エラー・アサートが無い' + (errors.length ? '：' + errors.join(' / ') : ''));
  await browser.close();
  console.log(failed ? `\n${failed} 件 失敗` : '\nすべて合格');
  process.exit(failed ? 1 : 0);
})();
