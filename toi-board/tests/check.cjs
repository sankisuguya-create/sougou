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

  // 印・えらぶ番号は ない
  await page.click(`#board .note[data-id="${a}"]`);
  ok(!(await page.isVisible('[data-act=mark]')) && !(await page.isVisible('[data-act=pick]')), '付箋の メニューに 印・えらぶ番号は ない');
  await page.click('.sheet-bg', { position: { x: 5, y: 5 } });
  await page.click(`#board .note[data-id="${d}"]`);

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
  // 見てほしい付箋
  await page.click(`#board .note[data-id="${c}"]`);
  await page.click(`[data-act=showcase][data-id="${c}"]`);
  await page.click('.sheet-bg', { position: { x: 5, y: 5 } });
  await page.click(`#board .note[data-id="${e}"]`);
  await page.click(`[data-act=showcase][data-id="${e}"]`);
  await page.click('.sheet-bg', { position: { x: 5, y: 5 } });
  s = await st();
  ok(s.items.find(x => x.id === c).showcase && s.items.find(x => x.id === e).showcase, '「見てほしい付箋」を 設定できる');
  ok(await page.isVisible(`#board .note[data-id="${c}"] .show`), '見てほしい付箋に しるしが 出る');

  // 権限：モードが切ってある間
  await who('A05');
  ok(!(await page.isVisible('[data-act=look]')), '共同閲覧が 切ってあれば ほかの班は 見られない');

  // 先生：見本・モード
  await who('teacher');
  await page.click('[data-act=seed]');
  await page.click('[data-act=mode][data-k=view][data-v=class]');
  await page.click('[data-act=mode][data-k=propose][data-v=class]');
  await page.screenshot({ path: SHOTS + '/4-teacher.png', fullPage: true });

  // 別の班の児童：共同閲覧・提案
  await who('A05');
  await page.click('[data-act=look][data-t="A-1"]');
  ok(await page.isVisible('text=1はん「阪急西宮北口」を 見ています'), '共同閲覧で ほかの班を 見られる');
  ok(!(await page.isVisible('.face[data-face=back]')) && !(await page.isVisible('.face[data-face=trash]')), 'ほかの班の うらがわ・ゴミばこは 見えない');
  ok(!(await page.isVisible('[data-act=frame]')), 'ほかの班の ボードは 動かせない');
  await page.click('.face[data-face=gift]');
  await page.click('[data-act=add]'); await page.fill('#w-text', 'ホームベースは だれが ふむの？'); await page.click('[data-act=w-save]');
  s = await st();
  const g = s.items.find(x => x.fromTeam === 'A-2');
  ok(g && g.team === 'A-1' && g.face === 'gift', 'アイデア提案で ほかの班の いただきものに 貼れる');
  await page.click('[data-act=home]');
  const own = (await st()).items.find(x => x.team === 'A-2' && x.face === 'front');
  await page.click(`#board .note[data-id="${own.id}"]`);
  ok(!(await page.isVisible(`[data-act=star][data-id="${own.id}"]`)), 'シール（班の中）が 切ってあれば 自分の班には 貼れない');
  await page.click('.sheet-bg', { position: { x: 5, y: 5 } });

  // 先生が シール（班の外）を 同じ組で 入れる → A組の 児童が シール貼り画面へ（別タブにも届く）
  const p3 = await ctx.newPage(); await p3.goto(FILE); await p3.selectOption('#who', 'A20');
  await who('teacher'); await page.click('[data-act=mode][data-k=starOut][data-v=class]');
  await p3.waitForTimeout(300);
  ok(await p3.isVisible('text=シールを 貼ろう'), '先生が シール（班の外）を 入れると 別タブの児童画面も 切り替わる');
  await p3.close();
  await who('B01');
  ok(!(await page.isVisible('text=シールを 貼ろう')), 'ほかの組（B組）は 切り替わらない');
  await who('A05');
  ok(await page.isVisible('text=シールを 貼ろう'), 'シール貼り画面に 切り替わる');
  ok(await page.isVisible(`.big[data-id="${c}"]`) && await page.isVisible(`.big[data-id="${e}"]`), 'ほかの班の 見てほしい付箋が 大きく 出る');
  ok(!(await page.isVisible(`.big[data-id="${own.id}"]`)), '自分の班の 付箋は 出ない');
  ok(!(await page.locator('.gteam:has-text("組）")').count()), '「同じ組」なら ほかの組の 班は 出ない');
  ok(await page.locator('.kpick img').count() === 4 && !(await page.locator('.gal svg').count()), 'シールは 画像で 出る（SVGを その場で 描かない）');
  await page.waitForTimeout(1800);
  await page.locator(`.big[data-id="${c}"]`).scrollIntoViewIfNeeded();
  const bigC = await page.locator(`.big[data-id="${c}"]`).boundingBox();
  await page.mouse.click(bigC.x + 180, bigC.y + 130);
  await page.click('[data-act=kind][data-k=pick]');
  await page.locator(`.big[data-id="${c}"]`).scrollIntoViewIfNeeded();
  Object.assign(bigC, await page.locator(`.big[data-id="${c}"]`).boundingBox());
  await page.mouse.click(bigC.x + 50, bigC.y + 140);
  await page.mouse.click(bigC.x + 120, bigC.y + 150);
  s = await st();
  const mineC = s.stars.filter(x => x.viewer === 'A05' && x.noteId === c);
  ok(mineC.length === 2 && mineC.every(x => x.x > 0 && x.y > 0), 'タップした 場所に シールが 貼れる（種類ごとに 1まい）');
  ok(await page.isVisible('text=この 付箋には もう 同じ シールを 貼って あります'), '同じ種類を 2まい目は 貼れない');
  const textBottom = await page.$eval(`.big[data-id="${c}"]`, el => { const r = document.createRange(); r.selectNodeContents(el.firstChild); return r.getBoundingClientRect().bottom; });
  const sealTops = await page.$$eval(`.big[data-id="${c}"] .seal`, els => els.map(e => e.getBoundingClientRect().top));
  ok(sealTops.length === 2 && sealTops.every(t => t >= textBottom - 2), 'シールは 付箋の 下の 帯に 貼られ、文字に かからない');
  await page.screenshot({ path: SHOTS + '/5-gallery.png' });
  await page.click(`.big[data-id="${c}"] .seal >> nth=0`);
  await page.click('[data-act=peel]');
  s = await st();
  ok(s.stars.filter(x => x.viewer === 'A05' && x.noteId === c).length === 1, 'はがせる');
  await page.evaluate(id => { const s = JSON.parse(localStorage.getItem('toiboard.v3')); for (const v of ['A06','A07','A08','A09','A10','A11']) s.stars.push({ noteId: id, viewer: v, k: 'star', x: 50, y: 50, r: 0 }); localStorage.setItem('toiboard.v3', JSON.stringify(s)); }, c);
  await page.reload();
  ok(await page.locator(`.big[data-id="${c}"] .seal`).count() === 1, 'シール貼り画面では ほかの子の シールは 見えない');
  await page.click('[data-act=kind][data-k=star]');
  await page.locator(`.big[data-id="${c}"]`).scrollIntoViewIfNeeded();
  const bigC2 = await page.locator(`.big[data-id="${c}"]`).boundingBox();
  await page.mouse.click(bigC2.x + 200, bigC2.y + 40);

  // 持ち分：1つの班に 種類ごとに 2まいまで
  ok((await page.textContent('[data-left="A-1"] [data-kind=star]')).includes('1'), '班ごとの のこりの まい数が 出る（★ のこり1）');
  const third = await page.evaluate(() => { const id = nid(); commit(() => { S.items.push({ id, kind: 'note', team: 'A-1', face: 'front', x: 40, y: 1, text: '3まいめの 付箋', author: 'A01', showcase: true }); }); return id; });
  await page.reload();
  await page.click('[data-act=kind][data-k=star]');
  for (const id of [e, third]) { await page.locator(`.big[data-id="${id}"]`).scrollIntoViewIfNeeded(); const bx = await page.locator(`.big[data-id="${id}"]`).boundingBox(); await page.mouse.click(bx.x + 120, bx.y + 60); await page.waitForTimeout(150); }
  s = await st();
  const starA1 = s.stars.filter(x => x.viewer === 'A05' && x.k === 'star' && s.items.find(n => n.id === x.noteId).team === 'A-1');
  ok(starA1.length === 2 && await page.isVisible('text=この 班には もう 面白い！ を 2まい 貼りました'), '同じ班に 同じ種類は 3まい目を 貼れない');
  ok((await page.textContent('[data-left="A-1"] [data-kind=star]')).includes('0') && (await page.textContent('[data-left="A-3"] [data-kind=star]')).includes('2'), 'のこりは 班ごとに 数える（ほかの班は 2まい のこる）');
  await page.evaluate(id => commit(() => { S.items = S.items.filter(x => x.id !== id); S.stars = S.stars.filter(x => x.noteId !== id); }), third);

  // 先生が 切ると もどる・集計は 自分の班の ボードに 種類別「×N」、ほかの班には 数を 出さない
  await who('teacher'); await page.click('[data-act=mode][data-k=starOut][data-v=off]');
  await who('A01');
  ok(await page.isVisible('#board'), '先生が 切ると ボードに もどる');
  const nb = await page.locator(`#board .note[data-id="${c}"]`).boundingBox(), sb = await page.locator(`[data-stars="${c}"]`).boundingBox();
  const sStar = await page.locator(`[data-stars="${c}"] [data-kind=star]`).boundingBox(), sCirc = await page.locator(`[data-stars="${c}"] [data-kind=pick]`).boundingBox();
  ok(Math.abs(sStar.y - sCirc.y) < 6 && sStar.x < sCirc.x && sStar.x < nb.x + nb.width / 3 && sStar.y + sStar.height <= nb.y + nb.height + 2, 'シールは 種類ごとに 決まった 位置（★は 最下段の 左、つるはしは その右）で 付箋の 中に 貼られる');
  const textBox = await page.$eval(`#board .note[data-id="${c}"]`, el => { const r = document.createRange(); r.selectNodeContents(el.firstChild.nodeType === 3 ? el.firstChild : el.childNodes[[...el.childNodes].findIndex(n => n.nodeType === 3)]); return r.getBoundingClientRect().bottom; });
  ok(sCirc.y >= textBox - 2, 'シールは 文字に かからない');
  const cb = await page.locator(`[data-stars="${c}"] [data-kind=star] .cnt`).boundingBox(), ib = await page.locator(`[data-stars="${c}"] [data-kind=star] img`).boundingBox();
  const cx = cb.x + cb.width / 2, cy = cb.y + cb.height / 2;
  ok(cx > ib.x + ib.width / 2 && cy > ib.y + ib.height / 2 && cb.x < ib.x + ib.width && cb.y < ib.y + ib.height, '「×7」は シールの 右下に 重ねて 出る');
  ok((await page.textContent(`[data-stars="${c}"] [data-kind=star]`)).includes('×7') && await page.locator(`[data-stars="${c}"] [data-kind=pick]`).count() === 1, '自分の班の ボードでは 種類ごとに まとめて 出る（×7 など）');
  await who('A05'); await page.click('[data-act=look][data-t="A-1"]');
  ok(!(await page.textContent(`[data-stars="${c}"]`)).includes('×'), 'ほかの班では シールの数は 見えない（自分が貼った 種類だけ）');
  await page.click('[data-act=home]');

  // 班1 の いただきもの：班名だけ
  await who('A01'); await page.click('.face[data-face=gift]');
  ok(await page.isVisible('text=2はんから') && !(await page.isVisible('text=5ばん')), 'いただきものは 班名だけ 出る');
  await page.screenshot({ path: SHOTS + '/6-gift.png' });

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
  ok(lines[0].split('\t').length === 17 && lines.length > 60 && !/[ABC]\d\d|ばん（/.test(tsv), '一覧は TSV で コピーでき、書いた児童は 入らない');
  await page.click('[data-act=fcls][data-c=B]');
  ok((await page.evaluate(() => opinionTSV())).split('\n').slice(1).every(l => l.startsWith('B組')), '組で しぼれる');
  await page.screenshot({ path: SHOTS + '/7-teacher-table.png', fullPage: true });
  // 検索：児童は 自分の班だけ。ことば・シールで しぼり、タップで その付箋へ 飛ぶ
  await who('A01');
  await page.click('[data-act=search]');
  await page.fill('#s-text', 'どうして');
  const hitTexts = await page.$$eval('.hits .hcard .t', els => els.map(e => e.textContent));
  const mineAll = await page.evaluate(() => S.items.filter(x => x.kind === 'note' && x.team === 'A-1').map(x => x.text));
  ok(hitTexts.length > 0 && hitTexts.every(t => t.includes('どうして') && mineAll.includes(t)), '児童の 検索は 自分の班の 付箋だけ・ことばで しぼれる');
  ok(!(await page.evaluate(() => searchHits(myTeam(), 'どうして').some(n => n.team !== 'A-1'))), 'ほかの班の 付箋は 検索に 出ない');
  await page.fill('#s-text', '');
  await page.click('[data-act=s-kind][data-k=any]');
  const starHits = await page.$$eval('.hits .hcard', els => els.length);
  const starred = await page.evaluate(() => S.items.filter(x => x.team === 'A-1' && x.kind === 'note' && S.stars.some(s => s.noteId === x.id)).length);
  ok(starHits === starred && starHits > 0, 'シールが ある 付箋だけに しぼれる');
  await page.click('[data-act=s-kind][data-k=pick]');
  const circ = await page.evaluate(() => S.items.filter(x => x.team === 'A-1' && S.stars.some(s => s.noteId === x.id && s.k === 'pick')).length);
  ok(await page.locator('.hits .hcard').count() === circ && circ > 0, 'シールの 種類で しぼれる');
  await page.click('[data-act=s-kind][data-k=""]');
  await page.fill('#s-text', 'うめた');
  await page.click('.hits .hcard');
  ok(await page.isVisible('.face.on[data-face=back]') && await page.isVisible('.note.flash'), 'タップすると その付箋の 面（うらがわ）へ 移り 光る');
  await page.screenshot({ path: SHOTS + '/8-search.png' });
  // 先生：学年の 全部を ことば・シールで しぼる（表と コピーに 効く）
  await who('teacher');
  await page.click('[data-act=fcls][data-c=all]');
  await page.fill('#t-q', '灯台');
  const tq = await page.evaluate(() => opinionTSV().split('\n').slice(1));
  ok(tq.length >= 0 && tq.every(l => l.includes('灯台')), '先生の 一覧を ことばで しぼれる');
  await page.fill('#t-q', '');
  await page.click('[data-act=fkind][data-k=star]');
  const ts = await page.evaluate(() => opinionTSV().split('\n').slice(1));
  ok(ts.length > 0 && ts.every(l => /^\d+$/.test(l.split('\t')[7])), '先生の 一覧を シールの 種類で しぼれる');

  // 背景色：いただきもの 茶／うらがわ 灰／ゴミばこ 薄青
  await who('A01');
  const bg = async f => { await page.click(`.face[data-face=${f}]`); return page.$eval('#board', el => getComputedStyle(el).backgroundColor); };
  const cols = { front: await bg('front'), back: await bg('back'), gift: await bg('gift'), trash: await bg('trash') };
  const rgb = c => c.match(/\d+/g).map(Number);
  const [gr, gg, gb] = rgb(cols.gift), [br, bgG, bb] = rgb(cols.back), [tr, tg, tb] = rgb(cols.trash);
  ok(gr > gb + 20 && Math.abs(br - bb) < 8 && br < 240 && tb > tr + 15 && new Set(Object.values(cols)).size === 4, '面ごとの 背景色（いただきもの 茶・うらがわ 灰・ゴミばこ 薄青）');

  // ゴミばこ：あいうえお順／書いた順、動かせない
  await page.click('.face[data-face=front]');
  for (const t of ['んまで', 'あいう', 'かきく']) await write(t);
  s = await st();
  const tIds = ['んまで', 'あいう', 'かきく'].map(t => s.items.find(x => x.text === t && x.team === 'A-1').id);
  for (const id of tIds) { await page.click(`#board .note[data-id="${id}"]`); await page.click(`[data-act=toface][data-f=trash][data-id="${id}"]`); }
  await page.click('.face[data-face=trash]');
  const order = async () => page.$$eval('#board .note', els => els.map(e => [e.textContent, e.offsetTop * 10000 + e.offsetLeft]).sort((a, b) => a[1] - b[1]).map(a => a[0]));
  let o = (await order()).filter(t => ['んまで', 'あいう', 'かきく'].some(w => t.startsWith(w)));
  ok(o.map(t => t.slice(0, 3)).join() === 'あいう,かきく,んまで', 'ゴミばこは あいうえお順に 並ぶ');
  await page.click('[data-act=tsort][data-v=time]');
  o = (await order()).filter(t => ['んまで', 'あいう', 'かきく'].some(w => t.startsWith(w)));
  ok(o.map(t => t.slice(0, 3)).join() === 'んまで,あいう,かきく', '書いた順にも できる');
  const before = (await st()).items.find(x => x.id === tIds[0]);
  const tb0 = await box(tIds[0]);
  await page.mouse.move(tb0.x + 30, tb0.y + 30); await page.mouse.down(); await page.mouse.move(tb0.x + 300, tb0.y + 300, { steps: 8 }); await page.mouse.up();
  const after = (await st()).items.find(x => x.id === tIds[0]);
  ok(before.x === after.x && before.y === after.y && after.face === 'trash', 'ゴミばこの 中では 動かせない');
  await page.click('.sheet-bg', { position: { x: 5, y: 5 } }).catch(() => {});

  // ショートカット：Ctrl+Z／Ctrl+Y／Esc
  await page.click(`#board .note[data-id="${tIds[1]}"]`);
  await page.click(`[data-act=toface][data-f=front][data-id="${tIds[1]}"]`);
  ok((await st()).items.find(x => x.id === tIds[1]).face === 'front', '（準備）表がわへ もどす');
  await page.keyboard.press('Control+z');
  ok((await st()).items.find(x => x.id === tIds[1]).face === 'trash', 'Ctrl+Z で 直前の 操作を もとに もどす');
  await page.keyboard.press('Control+y');
  ok((await st()).items.find(x => x.id === tIds[1]).face === 'front', 'Ctrl+Y で やり直す');
  await page.keyboard.press('Control+Shift+z');
  ok(await page.isVisible('text=やり直せる 操作は ありません'), 'やり直す ものが なければ そう 出る');
  await page.click('.face[data-face=front]');
  await write('けす 付箋');
  await page.keyboard.press('Control+z');
  ok(!(await st()).items.some(x => x.text === 'けす 付箋'), '付箋を 書いたのも もどせる');
  await page.click('[data-act=add]'); await page.fill('#w-text', 'あいうえ');
  await page.keyboard.press('Control+z');
  ok(await page.isVisible('#w-text'), '文字を 打っている 欄の Ctrl+Z は その欄の ふつうの 動き');
  await page.keyboard.press('Escape');
  ok(!(await page.isVisible('#w-text')), 'Esc で とじる');
  await page.keyboard.press('Control+f');
  ok(await page.isVisible('#s-text'), 'Ctrl+F で さがす');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: SHOTS + '/9-trash.png' });

  // 調査済み → 緑／いただきもの → 茶色の テープに「頂き物」
  await who('A01'); await page.click('.face[data-face=front]');
  const dn = (await st()).items.find(x => x.team === 'A-1' && x.face === 'front' && x.kind === 'note' && !x.stackOf);
  const colOf = id => page.$eval(`#board .note[data-id="${id}"]`, el => getComputedStyle(el).backgroundColor);
  const c0 = await colOf(dn.id);
  await page.click(`#board .note[data-id="${dn.id}"]`); await page.click(`[data-act=done][data-id="${dn.id}"]`);
  await page.fill('#d-text', 'たろう・はなこ'); await page.press('#d-text', 'Enter');
  const c1 = await colOf(dn.id), g1 = c1.match(/\d+/g).map(Number);
  ok((await st()).items.find(x => x.id === dn.id).done && c1 !== c0 && g1[1] > g1[0] + 20 && g1[1] > g1[2] + 20, '「調査済み」を 選ぶと 付箋が 緑に なる');
  ok((await st()).items.find(x => x.id === dn.id).doneBy === 'たろう・はなこ' && (await page.getAttribute(`#board .note[data-id="${dn.id}"]`, 'title')).includes('しらべた人：たろう・はなこ') && !(await page.textContent(`#board .note[data-id="${dn.id}"]`)).includes('たろう'), 'しらべた人は 付箋には 書かず、カーソルを 合わせると 出る');
  await page.click('.face[data-face=gift]');
  const tape = await page.$eval('#board .note.gift', el => { const cs = getComputedStyle(el, '::before'); return [cs.content, cs.backgroundColor, getComputedStyle(el).backgroundColor]; });
  const tpb = tape[1].match(/\d+/g).map(Number), body = tape[2];
  ok(tape[0].includes('頂き物') && tpb[0] > tpb[2] + 40 && body !== c1, 'いただきものの 付箋は テープが 茶色で「頂き物」、緑（調査済み）とは 別の 色');
  await page.screenshot({ path: SHOTS + '/10-done-gift.png' });
  await page.click('.face[data-face=front]');
  {
  // 画面のつくり：右上の モード表示は ない／＋は 左下／横スクロール なし（児童用PC 1366・拡大時 1093 も）
  await who('A01'); await page.click('.face[data-face=front]');
  ok(!(await page.isVisible('.modes')) && !(await page.isVisible('.head >> text=シール（班の外）')), '右上の モード表示は 出ない');
  const fab = await page.locator('.fab').boundingBox();
  ok(fab && fab.x < 40 && fab.y + fab.height > 768 - 40 && (await page.textContent('.fab')).trim() === '＋', '＋ボタンは 左下に 固定（＋だけ）');
  for (const w of [1366, 1093]) {
    await page.setViewportSize({ width: w, height: 768 });
    await page.waitForTimeout(100);
    const sc = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth, document.querySelector('.wrap').scrollWidth, document.querySelector('.wrap').clientWidth, Math.max(...[...document.querySelectorAll('#board .note')].map(n => n.getBoundingClientRect().right))]);
    ok(sc[0] <= sc[1] && sc[2] <= sc[3] && sc[4] <= sc[1], `幅 ${w}px で 横スクロールが ない（付箋も はみ出ない）`);
  }
  await page.setViewportSize({ width: 1366, height: 768 });

  // 重なり：下の付箋は 斜めに ずらして 厚みに 見せる／どれを いちばん上に するか 選べる
  const tops = await page.evaluate(() => { const ns = S.items.filter(x => x.team === 'A-1' && x.face === 'front' && x.kind === 'note' && !x.stackOf); return [ns[0].id, ns[1].id]; });
  await page.waitForTimeout(200);
  for (const id of tops) await page.locator(`#board .note[data-id="${id}"]`).scrollIntoViewIfNeeded();
  const sk1 = await box(tops[1]); const sk0 = await box(tops[0]);
  await page.mouse.move(sk1.x + 30, sk1.y + 30); await page.mouse.down(); await page.mouse.move(sk1.x + 60, sk1.y + 60, { steps: 4 }); await page.mouse.move(sk0.x + 60, sk0.y + 50, { steps: 8 }); await page.mouse.up();
  const lay = await page.$eval(`#board .note[data-id="${tops[0]}"] .layer`, el => el.style.transform);
  ok(/translate\(\d+px,\s?\d+px\)\s?rotate/.test(lay), '下の 付箋は 斜めに 少し ずれて 見える');
  await page.click(`#board .note[data-id="${tops[0]}"]`);
  await page.click(`[data-act=totop][data-id="${tops[1]}"]`);
  s = await st();
  const nt = s.items.find(x => x.id === tops[1]), ot = s.items.find(x => x.id === tops[0]);
  ok(!nt.stackOf && ot.stackOf === tops[1] && await page.isVisible(`#board .note[data-id="${tops[1]}"]`) && !(await page.isVisible(`#board .note[data-id="${tops[0]}"]`)), '重なりの 中から「いちばん 上に する」を 選べる');
  await page.keyboard.press('Escape');

  // コメント：シール貼りの 時に ほかの班の 付箋へ（付箋の 右下）。ふだんの 画面では 右上の しるしから 見る
  await page.evaluate(id => commit(() => { item(id).showcase = true; }), tops[1]);
  await who('teacher'); await page.click('[data-act=mode][data-k=starOut][data-v=class]');
  await who('A05');
  const cb = page.locator(`.big[data-id="${tops[1]}"] .cbtn`);
  await page.waitForTimeout(1800);
  await cb.scrollIntoViewIfNeeded();
  const cbb = await cb.boundingBox(), bgb = await page.locator(`.big[data-id="${tops[1]}"]`).boundingBox();
  ok(cbb.x > bgb.x + bgb.width / 2 && cbb.y > bgb.y + bgb.height / 2, 'コメントの ボタンは 付箋の 右下');
  await cb.click();
  await page.fill('#c-text', 'ホームベースは どこに あるの？');
  await page.click('[data-act=c-save]');
  s = await st();
  ok(s.comments.some(c => c.noteId === tops[1] && c.viewer === 'A05' && c.text.includes('ホームベース')) && !s.stars.some(x => x.viewer === 'A05' && x.noteId === tops[1] && x.k === 'pick'), 'コメントを 書ける（シールは 貼られない）');
  await who('teacher'); await page.click('[data-act=mode][data-k=starOut][data-v=off]');
  await who('A01'); await page.click('.face[data-face=front]');
  const ci = await page.locator(`#board .note[data-id="${tops[1]}"] .cicon`).boundingBox(), nb2 = await box(tops[1]);
  ok(ci && ci.x > nb2.x + nb2.width / 2 && ci.y < nb2.y + 20, 'ふだんの 画面では 付箋の 右上に コメントの しるし');
  await page.click(`#board .note[data-id="${tops[1]}"] .cicon`);
  ok(await page.isVisible('.clist .c:has-text("ホームベースは どこに あるの？")') && !(await page.isVisible('.clist small:has-text("A05")')), 'しるしを 押すと コメントが 見える（だれが 書いたかは 出ない）');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: SHOTS + '/11-new-ui.png' });
  await who('teacher');
  ok((await page.evaluate(() => opinionTSV())).includes('ホームベースは どこに あるの？'), '先生の 一覧に コメントが 入る');
  }
  {
  // ？のたね：付箋を 書く 画面の 上の ボタン → 上から カード → 押すと 言葉が 入る／自分で つくれる
  await who('A01'); await page.click('.face[data-face=front]');
  await page.click('.fab');
  await page.fill('#w-text', 'ホタルは ');
  await page.click('[data-act=tanes]');
  ok(await page.isVisible('.seeds') && await page.locator('.seeds .seedcard[data-act=tane]').count() >= 8, '「？のたね」を 押すと カードが 出る（8まい）');
  const sb = await page.locator('.seeds').boundingBox();
  ok(sb.y <= 2, 'カードは 画面の 上から 出る');
  await page.click('.seedcard[data-w="いつ"]');
  ok(await page.inputValue('#w-text') === 'ホタルは いつ', '「いつ」を 押すと 付箋に「いつ」が 入る');
  await page.click('.seedcard[data-w="どうして"]');
  ok(await page.inputValue('#w-text') === 'ホタルは いつどうして', 'つづけて 押すと うしろに 足される');
  await page.fill('#seed-new', 'なんさい'); await page.click('[data-act=tane-add]');
  ok(await page.isVisible('.seedcard[data-w="なんさい"]'), '自分の たねを つくれる');
  await page.click('[data-act=close]', { force: true }).catch(() => {});
  await page.keyboard.press('Escape');
  await page.reload();
  await page.click('.fab'); await page.click('[data-act=tanes]');
  ok(await page.isVisible('.seedcard[data-w="なんさい"]'), 'つくった たねは のこる（その子の 端末）');
  await page.screenshot({ path: SHOTS + '/12-seeds.png' });
  await page.click('[data-act=tane-del]');
  ok(!(await page.isVisible('.seedcard[data-w="なんさい"]')), '自分の たねは けせる');
  await who('A02'); await page.click('.fab'); await page.click('[data-act=tanes]');
  ok(await page.locator('.seedcard[data-act=tane]').count() === 8, 'ほかの子の たねは 出ない');
  await page.keyboard.press('Escape');
  }
  {
  // 回：先生が 第2回を はじめると、シール・持ち分・見てほしい付箋が 回ごとに なる
  await who('A01'); await page.click('.face[data-face=front]');
  const before = await page.evaluate(() => { const ns = S.items.filter(x => x.team === 'A-1' && x.kind === 'note' && x.face === 'front' && !x.stackOf); return { shown: ns.filter(n => shownNow(n)).map(n => n.id), other: ns.filter(n => !showRound(n)).map(n => n.id), stars: S.stars.filter(s => rdOf(s) === 1).length }; });
  ok(before.shown.length > 0 && before.stars > 0, '（準備）第1回の 見てほしい付箋と シールが ある');
  await who('teacher'); await page.click('[data-act=tcls][data-c=A]');
  await page.click('[data-act=round-next]');
  ok(await page.isVisible('text=もう一度 押すと 第2回に なります'), '回を 進める 前に もう一度 たしかめる');
  await page.click('[data-act=round-next]');
  ok(await page.isVisible('.mode b:has-text("第2回")'), '先生が 第2回を はじめられる');
  await who('A01'); await page.click('.face[data-face=front]');
  const old = before.shown[0];
  ok(await page.isVisible(`#board .note[data-id="${old}"] .show.old:has-text("第1回")`) && !(await page.isVisible(`#board .note[data-id="${old}"] .stars`)), '前の 回の 付箋は「第1回」と 出て、シールの 数は 今の 回の 分だけ（0）');
  await page.click(`#board .note[data-id="${old}"]`);
  ok(await page.isVisible('button[disabled]:has-text("第1回で えらんだ 付箋")') && !(await page.isVisible(`[data-act=showcase][data-id="${old}"]`)), '前の 回で えらんだ 付箋は えらべない');
  await page.keyboard.press('Escape');
  const nw = before.other[0];
  await page.click(`#board .note[data-id="${nw}"]`);
  await page.click(`[data-act=showcase][data-id="${nw}"]`);
  ok((await st()).items.find(x => x.id === nw).showcase === 2, 'ほかの 付箋は 第2回の 見てほしい付箋に できる');
  await page.keyboard.press('Escape');
  await who('teacher'); await page.click('[data-act=mode][data-k=starOut][data-v=class]');
  await who('A05');
  ok(await page.isVisible(`.big[data-id="${nw}"]`) && !(await page.isVisible(`.big[data-id="${old}"]`)), 'シール貼り画面には 今の 回の 見てほしい付箋だけ 出る');
  ok((await page.textContent('[data-left="A-1"] [data-kind=star]')).includes('2'), '持ち分は 回ごとに もどる（★ のこり2）');
  await page.waitForTimeout(1800);
  await page.locator(`.big[data-id="${nw}"]`).scrollIntoViewIfNeeded();
  const nb3 = await page.locator(`.big[data-id="${nw}"]`).boundingBox();
  await page.mouse.click(nb3.x + 60, nb3.y + 60);
  s = await st();
  ok(s.stars.some(x => x.noteId === nw && x.viewer === 'A05' && x.rd === 2), '第2回の シールとして 貼られる');
  await who('teacher'); await page.click('[data-act=mode][data-k=starOut][data-v=off]');
  const csvRow = await page.evaluate(id => roundSummary(item(id)), before.shown[0]);
  ok(/第1回/.test(csvRow), '前の 回の シールの 数は 一覧（CSV）に のこる');
  }
  {
  // シールの 集計の ページ
  await who('teacher'); await page.click('[data-act=tcls][data-c=A]');
  await page.click('[data-act=tally]');
  ok(await page.isVisible('h2:has-text("シールの 集計")') && await page.locator('table.tally').count() > 0, '先生画面から シールの 集計の ページに 飛べる');
  await page.click('[data-act=tround][data-r="1"]');
  const t1 = await page.$$eval('table.tally tr', trs => trs.slice(1).map(tr => tr.textContent));
  ok(t1.length > 0, '回を えらんで 班ごと・付箋ごとの シールの 数が 見える');
  await page.screenshot({ path: SHOTS + '/13-tally.png', fullPage: true });
  await page.click('[data-act=tally-back]');
  ok(await page.isVisible('text=意見の 一覧'), '先生の 画面に もどれる');
  const href = await page.getAttribute('a:has-text("体験する")', 'href');
  ok(href && href.includes('trial=1'), '先生画面に「体験する」ボタンが ある');

  // 体験版：本番と 別の 保存場所に 見本の データ、①〜④の 案内
  const realBefore = await page.evaluate(() => localStorage.getItem('toiboard.v3'));
  const tp = await ctx.newPage();
  tp.on('pageerror', e => errors.push('trial: ' + e));
  await tp.goto(FILE + '?trial=1');
  await tp.waitForSelector('.trial');
  ok(await tp.isVisible('.trial b:has-text("① ボードで 付箋を 編集する")') && await tp.locator('#board .note').count() >= 4 && await tp.isVisible('.fab'), '① 児童の ボード（見本の 付箋つき）から 始まる');
  await tp.click('.trial [data-act=trial-go][data-n="1"]');
  ok(await tp.isVisible('text=シールを 貼ろう') && await tp.locator('.big').count() > 0, '② シール貼りの 画面に なる');
  await tp.click('.trial [data-act=trial-go][data-n="2"]');
  ok(await tp.isVisible('h2:has-text("シールの 集計")') && (await tp.$$eval('table.tally td.num:not(.zero)', els => els.length)) > 0, '③ 先生の 集計（見本の シールが 入っている）');
  await tp.click('.trial [data-act=trial-go][data-n="3"]');
  ok(await tp.isVisible('[data-act=mode][data-k=starOut]') && await tp.isVisible('[data-act=round-next]'), '④ 先生の モード・回の 設定');
  await tp.screenshot({ path: SHOTS + '/14-trial.png' });
  ok(await page.evaluate(() => localStorage.getItem('toiboard.v3')) === realBefore, '体験の データは 本番の 保存場所に 入らない');
  await tp.close();
  }
  {
  // 枠：タイトル案ボタン／タイトルを 辺の 上で ドラッグ
  await who('A01'); await page.click('.face[data-face=front]');
  await page.evaluate(() => { const sc = document.querySelector('.wrap'); sc.scrollTop = 0; });
  await page.click('[data-act=frame]');
  const fid = await page.evaluate(() => S.items.filter(x => x.kind === 'frame').slice(-1)[0].id);
  await page.click(`#board .frame[data-id="${fid}"] .label`);
  ok(await page.locator('.tsug .btn').count() === 6 && await page.isVisible('.tsug .btn:has-text("ヘルプミー！")'), '枠の 設定に タイトル案が 6つ ある');
  await page.click('.tsug .btn:has-text("本命こうほ")');
  ok(await page.inputValue('#f-text') === '本命こうほ', 'タイトル案を 押すと 欄に 入る');
  await page.click('[data-act=f-save]');
  const fb = await page.locator(`#board .frame[data-id="${fid}"]`).boundingBox();
  const lb = await page.locator(`#board .frame[data-id="${fid}"] .label`).boundingBox();
  await page.mouse.move(lb.x + 10, lb.y + lb.height / 2); await page.mouse.down();
  await page.mouse.move(lb.x + 40, lb.y + 30, { steps: 4 });
  await page.mouse.move(fb.x + fb.width + 30, fb.y + fb.height * 0.6, { steps: 10 }); await page.mouse.up();
  const fr = (await st()).items.find(x => x.id === fid);
  const lb2 = await page.locator(`#board .frame[data-id="${fid}"] .label`).boundingBox(), fb2 = await page.locator(`#board .frame[data-id="${fid}"]`).boundingBox();
  const cx = lb2.x + lb2.width / 2, cy = lb2.y + lb2.height / 2;
  ok(fr.lp > 0.25 && fr.lp < 0.5 && Math.abs(cx - (fb2.x + fb2.width)) < 6 && fr.x === (await page.evaluate(id => item(id).x, fid)), 'タイトルを ドラッグすると 枠の 辺（右の 辺）の 上に うつる（枠は 動かない）');
  await page.mouse.move(cx, cy); await page.mouse.down();
  await page.mouse.move(cx - 20, cy + 20, { steps: 4 });
  await page.mouse.move(fb2.x + fb2.width * 0.5, fb2.y + fb2.height + 40, { steps: 10 }); await page.mouse.up();
  const fr2 = (await st()).items.find(x => x.id === fid);
  ok(fr2.lp > 0.5 && fr2.lp < 0.75, '下の 辺にも うつせる（辺から はなれた ところで はなしても 辺に すいつく）');
  await page.screenshot({ path: SHOTS + '/15-frame.png' });
  }
  {
  // 検索：ポップアップ窓で 横5つずつ、ならびかえ
  await who('A01'); await page.click('.face[data-face=front]');
  for (const t of ['かきくけこ', 'あいうえお', 'さしすせそ']) { await page.click('.fab'); await page.fill('#w-text', t); await page.press('#w-text', 'Enter'); await page.waitForTimeout(5); }
  await page.click('[data-act=search]');
  const cards = await page.$$eval('.sheet.win .hits .hcard', els => els.map(e => e.getBoundingClientRect().top));
  const firstRow = cards.filter(t => Math.abs(t - cards[0]) < 2).length;
  ok(await page.isVisible('.sheet.win') && cards.length > 5 && firstRow === 5, '検索は ポップアップ窓で、付箋が 横5つずつ 下へ 並ぶ');
  const texts = async () => page.$$eval('.hits .hcard .t', els => els.map(e => e.textContent));
  let tx = await texts();
  ok(tx.indexOf('さしすせそ') < tx.indexOf('かきくけこ'), 'はじめは 新しい順');
  await page.click('[data-act=s-sort][data-k=old]'); tx = await texts();
  ok(tx.indexOf('かきくけこ') < tx.indexOf('さしすせそ'), '古い順に できる');
  await page.click('[data-act=s-sort][data-k=aiueo]'); tx = await texts();
  ok(tx.indexOf('あいうえお') < tx.indexOf('かきくけこ') && tx.indexOf('かきくけこ') < tx.indexOf('さしすせそ'), 'あいうえお順に できる');
  await page.click('[data-act=s-face][data-f=back]');
  ok((await page.$$eval('.hits .hcard .tag:first-of-type', els => els.map(e => e.textContent))).every(t => t.startsWith('うらがわ')), '面で しぼれる');
  await page.screenshot({ path: SHOTS + '/16-search.png' });
  await page.keyboard.press('Escape');

  // 班の中の いいね：自分の班の 付箋に、半分の 大きさで 文の 上に
  const ln = await page.evaluate(() => S.items.find(x => x.team === 'A-1' && x.kind === 'note' && x.face === 'front' && x.text === 'あいうえお').id);
  await page.click(`#board .note[data-id="${ln}"]`);
  await page.click(`[data-act=like][data-id="${ln}"]`);
  await who('A02'); await page.click('.face[data-face=front]');
  await page.click(`#board .note[data-id="${ln}"]`); await page.click(`[data-act=like][data-id="${ln}"]`);
  const lkb = await page.locator(`#board .note[data-id="${ln}"] .likes img`).boundingBox();
  const textTop = await page.$eval(`#board .note[data-id="${ln}"]`, el => { const r = document.createRange(); const tn = [...el.childNodes].find(n => n.nodeType === 3); r.selectNodeContents(tn); return r.getBoundingClientRect().top; });
  ok(lkb && Math.round(lkb.width) === 15 && lkb.y + lkb.height <= textTop + 1 && (await page.textContent(`#board .note[data-id="${ln}"] .likes`)).includes('×2'), 'いいねは 半分の 大きさ（15px）で 付箋の 文の 上に 出る（×2）');
  ok(!(await page.isVisible(`#board .note[data-id="${ln}"] .stars [data-kind=thumb]`)), 'いいねは 下の シールの 列には 出ない');
  await who('A05'); await page.click('[data-act=look][data-t="A-1"]');
  ok(!(await page.isVisible(`#board .note[data-id="${ln}"] .likes`)), 'ほかの班には いいねは 見えない');
  await page.click('[data-act=home]');
  }
  ok(errors.length === 0, 'コンソールに エラー・アサートが無い' + (errors.length ? '：' + errors.join(' / ') : ''));
  await browser.close();
  console.log(failed ? `\n${failed} 件 失敗` : '\nすべて合格');
  process.exit(failed ? 1 : 0);
})();
