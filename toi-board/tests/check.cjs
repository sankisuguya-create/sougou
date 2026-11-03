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
  // 動かす・枠は 整理役だけ：まだ だれも 整理役で なければ「整理する」を 押す
  // 見合い会：先生が はじめて、その 班の 番に する（時刻を ずらして 班を 合わせる）
  const rotTo = async team => { await who('teacher'); await page.click('[data-act=ttab][data-k=mode]'); await page.evaluate(tm => commit(() => { const m = S.modes.A; m.starOut = 'class'; const i = rotTeams('A').indexOf(tm); m.rot = { min: 4, start: nowMs() - i * 240000 - 500, paused: null }; }), team); };
  const used = k => page.locator(`.book .page[data-kind=${k}] .slot.used`).count();
  const claim = async () => { if (await page.isVisible('[data-act=org-claim]')) { await page.click('[data-act=org-claim]'); await page.waitForTimeout(30); } };
  const dragTo = async (id, x, y) => { await claim(); const b = await box(id); await page.mouse.move(b.x + 30, b.y + 30); await page.mouse.down(); await page.mouse.move(b.x + 60, b.y + 60, { steps: 4 }); await page.mouse.move(x, y, { steps: 8 }); await page.mouse.up(); };

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
  await page.click(`#board .note[data-id="${c}"]`); await page.click('[data-act=stackpop].stackbtn');
  ok(await page.isVisible('text=重なっている 付箋（3まい）'), 'タップで 重なりの中身を 見られる');
  await page.screenshot({ path: SHOTS + '/2-stack.png' });
  await page.click(`[data-act=unstack][data-id="${d}"]`);
  s = await st();
  ok(!s.items.find(x => x.id === d).stackOf, 'とりだすと 単独に もどる');
  await page.click('.stackbg', { position: { x: 5, y: 5 } });
  ok(!(await page.isVisible('.stackpop')) && await page.isVisible('.bignote'), '重なりの 小窓の 外を 押すと 小窓だけ とじる');
  await page.click('.sheet-bg', { position: { x: 5, y: 5 } });

  // 印・えらぶ番号は ない
  await page.click(`#board .note[data-id="${a}"]`);
  ok(!(await page.isVisible('[data-act=mark]')) && !(await page.isVisible('[data-act=pick]')), '付箋の メニューに 印・えらぶ番号は ない');
  await page.click('.sheet-bg', { position: { x: 5, y: 5 } });
  await page.click(`#board .note[data-id="${d}"]`);
  // 大きい 付箋で そのまま 直す：ほかの ボタンを 押しても 直した 文は のこる
  ok(await page.isVisible('.bignote #w-text'), '付箋を タップすると 大きい 付箋で 文字を 直せる');
  await page.fill('#w-text', 'なおした 問い');
  await page.click(`[data-act=toface][data-f=trash][data-id="${d}"]`);
  s = await st();
  ok(s.items.some(x => x.id === d && x.text === 'なおした 問い' && x.face === 'trash'), '直した 文は ほかの ボタンを 押しても 保存される');
  await page.click('.face[data-face=trash]'); await page.click(`#board .note[data-id="${d}"]`);
  await page.click(`[data-act=toface][data-f=front][data-id="${d}"]`); await page.click('.face[data-face=front]');
  await page.click(`#board .note[data-id="${d}"]`);
  await page.fill('#w-text', ''); await page.keyboard.press('Escape');
  s = await st();
  ok(s.items.some(x => x.id === d && x.text === 'なおした 問い'), '文を 空に して とじても もとの 文の まま');
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
  await claim(); await page.click('[data-act=frame]');
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
  await page.click('[data-act=ttab][data-k=more]'); await page.click('[data-act=seed]'); await page.click('[data-act=ttab][data-k=mode]');
  await page.click('[data-act=mode][data-k=view][data-v=class]');
  await page.click('[data-act=mode][data-k=propose][data-v=class]');
  await page.click('[data-act=orgmin][data-v="10"]');
  ok(await page.evaluate(() => S.modes.A.orgMin === 10 && orgMs('A-3') === 600000), '先生が 整理役の 時間を 組ごとに 決められる');
  await page.click('[data-act=orgmin][data-v="5"]');
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
  ok(await p3.isVisible('.gal.wait') && !(await p3.isVisible('.big')), '先生が シール（班の外）を 入れると 別タブの児童画面も 待ち画面に なる（まだ 貼れない）');
  await page.click('[data-act=rot][data-v=start]');
  await p3.waitForTimeout(300);
  ok(await p3.isVisible('.book'), '「はじめる」で 別タブの児童画面も シール貼りに なる');
  await p3.close();
  await who('B01');
  ok(!(await page.isVisible('.gal')), 'ほかの組（B組）は 切り替わらない');
  await who('A05');
  ok(await page.isVisible('.rothead:has-text("1はん")') && await page.isVisible('.book'), '1はんの 番：シール貼り画面と 右の シール帳');
  ok(await page.isVisible(`.big[data-id="${c}"]`) && await page.isVisible(`.big[data-id="${e}"]`), '今の 班の 見てほしい付箋が 大きく 出る');
  ok(!(await page.isVisible(`.big[data-id="${own.id}"]`)), '自分の班の 付箋は 出ない');
  ok(await page.locator('.book .page').count() === 4 && await page.locator('.book .page img').count() === 8 && !(await page.locator('.gal svg').count()), 'シール帳は 4種類 × 2まい（画像で 出る）');
  const bk = await page.$$eval('.book .page[data-kind=star] .slot', els => els.map(e => e.getBoundingClientRect()));
  ok(bk.length === 2 && Math.abs(bk[0].y - bk[1].y) < 2 && bk[1].x > bk[0].x && await page.isVisible('.book .page[data-kind=pick] .cap:has-text("「知りたい！」の シール")'), '同じ 種類の 2まいは 横に ならび、下に 説明');
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
  ok(await used('star') === 1 && await used('pick') === 1, 'シール帳は 貼った 分だけ 空く（★ のこり1）');
  const third = await page.evaluate(() => { const id = nid(); commit(() => { S.items.push({ id, kind: 'note', team: 'A-1', face: 'front', x: 40, y: 1, text: '3まいめの 付箋', author: 'A01', showcase: true }); }); return id; });
  await page.reload();
  await page.click('[data-act=kind][data-k=star]');
  for (const id of [e, third]) { await page.locator(`.big[data-id="${id}"]`).scrollIntoViewIfNeeded(); const bx = await page.locator(`.big[data-id="${id}"]`).boundingBox(); await page.mouse.click(bx.x + 120, bx.y + 60); await page.waitForTimeout(150); }
  s = await st();
  const starA1 = s.stars.filter(x => x.viewer === 'A05' && x.k === 'star' && s.items.find(n => n.id === x.noteId).team === 'A-1');
  ok(starA1.length === 2 && await page.isVisible('text=この 班には もう 面白い！ を 2まい 貼りました'), '同じ班に 同じ種類は 3まい目を 貼れない');
  ok(await used('star') === 2, 'シール帳の ★が 2まいとも 空く');
  await page.evaluate(id => commit(() => { S.items = S.items.filter(x => x.id !== id); S.stars = S.stars.filter(x => x.noteId !== id); }), third);
  await rotTo('A-3'); await who('A05');
  ok(await page.isVisible('.rothead:has-text("3はん")') && await used('star') === 0, '時間が たつと つぎの 班に 切り替わり、持ち分は 班ごと（★ 2まい もどる）');

  // 今の 班（1はん）の 児童は 見るだけ、シールは 実際の まい数だけ ならぶ。先生も 同じ 画面を 見られる
  await rotTo('A-1');
  ok(await page.isVisible(`.rotnow .stnote[data-id="${e}"]`), '先生は 今の 班と 同じ 画面を 見られる');
  await who('A01');
  s = await st();
  const stN = s.stars.filter(x => x.noteId === e && x.k !== 'thumb').length;
  ok(await page.isVisible('.stage') && !(await page.isVisible('#board')) && !(await page.isVisible('.fab')), '今の 班の 児童は 見るだけの 画面に なる');
  ok(stN >= 1 && await page.locator(`.stnote[data-id="${e}"] .seals .s`).count() === stN && !(await page.isVisible(`.stnote[data-id="${e}"] .cnt`)), 'シールは まとめず 実際の まい数だけ ならぶ');
  await page.evaluate(() => commit(() => { const m = S.modes.A; m.rot.start -= 7 * 240000; }));
  await page.waitForTimeout(1200);
  ok(await page.isVisible('#board'), '最後の 班が おわると 全員 ボードに もどる');
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
  ok(cx > ib.x + ib.width / 2 && cy > ib.y + ib.height / 2 && cb.x < ib.x + ib.width && cb.y < ib.y + ib.height, '数（7）は シールの 右下に 重ねて 出る（×は つけない）');
  ok((await page.textContent(`[data-stars="${c}"] [data-kind=star] .cnt`)).trim() === '7' && await page.locator(`[data-stars="${c}"] [data-kind=pick]`).count() === 1, '自分の班の ボードでは 種類ごとに まとめて 出る（×7 など）');
  await who('A05'); await page.click('[data-act=look][data-t="A-1"]');
  ok(!(await page.locator(`[data-stars="${c}"] .cnt`).count()), 'ほかの班では シールの数は 見えない（自分が貼った 種類だけ）');
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
  ok(await page.isVisible('.ttab.on:has-text("授業の 設定")') && await page.locator('.ttab').count() === 5, '先生画面は 用途ごとの タブに 分かれ、はじめは「授業の 設定」');
  await page.click('[data-act=ttab][data-k=list]');
  ok(await page.isVisible('text=意見の 一覧'), '先生画面に 意見の一覧が 出る');
  const tsv = await page.evaluate(() => opinionTSV());
  const lines = tsv.split('\n');
  ok(lines[0].split('\t').length === 11 && lines.length > 60 && !/[ABC]\d\d|ばん（/.test(tsv), '一覧は TSV で コピーでき、書いた児童は 入らない');
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
  await who('teacher'); await page.click('[data-act=ttab][data-k=list]');
  await page.click('[data-act=fcls][data-c=all]');
  await page.fill('#t-q', '灯台');
  const tq = await page.evaluate(() => opinionTSV().split('\n').slice(1));
  ok(tq.length >= 0 && tq.every(l => l.includes('灯台')), '先生の 一覧を ことばで しぼれる');
  await page.fill('#t-q', '');
  await page.click('[data-act=fkind][data-k=star]');
  const ts = await page.evaluate(() => opinionTSV().split('\n').slice(1));
  ok(ts.length > 0 && ts.every(l => /面白い！\d/.test(l.split('\t')[7])), '先生の 一覧を シールの 種類で しぼれる');

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
  await claim();
  const sk1 = await box(tops[1]); const sk0 = await box(tops[0]);
  await page.mouse.move(sk1.x + 30, sk1.y + 30); await page.mouse.down(); await page.mouse.move(sk1.x + 60, sk1.y + 60, { steps: 4 }); await page.mouse.move(sk0.x + 60, sk0.y + 50, { steps: 8 }); await page.mouse.up();
  const lay = await page.$eval(`#board .note[data-id="${tops[0]}"] .layer`, el => el.style.transform);
  ok(/translate\(\d+px,\s?\d+px\)\s?rotate/.test(lay), '下の 付箋は 斜めに 少し ずれて 見える');
  await page.click(`#board .note[data-id="${tops[0]}"]`); await page.click('[data-act=stackpop].stackbtn');
  await page.click(`[data-act=totop][data-id="${tops[1]}"]`);
  s = await st();
  const nt = s.items.find(x => x.id === tops[1]), ot = s.items.find(x => x.id === tops[0]);
  ok(!nt.stackOf && ot.stackOf === tops[1] && await page.isVisible(`#board .note[data-id="${tops[1]}"]`) && !(await page.isVisible(`#board .note[data-id="${tops[0]}"]`)), '重なりの 中から「いちばん 上に する」を 選べる');
  await page.keyboard.press('Escape');

  // コメント：シール貼りの 時に ほかの班の 付箋へ（付箋の 右下）。ふだんの 画面では 右上の しるしから 見る
  await page.evaluate(id => commit(() => { item(id).showcase = true; }), tops[1]);
  await rotTo('A-1');
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
  ok(!(await page.evaluate(() => opinionTSV())).includes('ホームベースは どこに あるの？'), 'コメントは はじめは 一覧に 入らない（名前が 書かれて いる ことが ある）');
  await page.click('[data-act=ttab][data-k=list]'); await page.click('[data-act=fcmt]');
  ok((await page.evaluate(() => opinionTSV())).includes('ホームベースは どこに あるの？'), '「コメントも 入れる」で 一覧に コメントが 入る');
  await page.click('[data-act=fcmt]');
  // しらべた人の 名前・前の 回の シール・まとまり・Gemini 用の 指示文
  const gx = await page.evaluate(() => {
    const free = tm => S.items.filter(x => x.kind === 'note' && x.team === tm && x.face === 'front' && !x.stackOf && !stackOf(x.id).length);
    const ns = free(SPOTS.map(s => s.team).find(tm => free(tm).length >= 3));
    commit(() => { ns[0].done = true; ns[0].doneBy = 'やまだ はなこ'; ns[2].stackOf = ns[1].id; S.stars.push({ noteId: ns[0].id, viewer: 'A09', k: 'pick', rd: 1 }, { noteId: ns[0].id, viewer: 'A10', k: 'star', rd: 2 }); });
    ui.fFace = 'all'; ui.fCls = 'all'; ui.fQ = ''; ui.fKind = '';
    const rows = opinionTSV().split('\n').map(l => l.split('\t'));
    const r0 = rows.find(r => r[4] === ns[0].text), r1 = rows.find(r => r[4] === ns[1].text), r2 = rows.find(r => r[4] === ns[2].text);
    return { tsv: opinionTSV(), r0, r1, r2, ai: aiText('next') };
  });
  ok(!gx.tsv.includes('やまだ') && gx.r0[5] === '○', 'しらべた人の 名前は 一覧に 入らない（○だけ）');
  ok(/第1回 [^／]*知りたい！1/.test(gx.r0[7]) && /第2回 面白い！1/.test(gx.r0[7]), 'シールは 前の 回も ふくめて 回ごとに 出る');
  ok(gx.r1[9] && gx.r1[9].includes('（上）') && gx.r2[9] === gx.r1[9].replace('（上）', ''), '重なりは 同じ まとまり番号で 出る');
  ok(gx.ai.startsWith('次の表は') && gx.ai.includes('\n\n組\t班') && !gx.ai.includes('やまだ'), 'Gemini 用は 指示文の あとに 表が つく');
  }
  {
  // ？のたね：付箋を 書く 画面の 上の ボタン → 上から カード → 押すと 言葉が 入る／自分で つくれる
  await who('A01'); await page.click('.face[data-face=front]');
  await page.click('.fab');
  await page.fill('#w-text', 'ホタルは ');
  await page.click('[data-act=tanes]');
  ok(await page.isVisible('.seeds') && await page.locator('.seeds .seedcard[data-act=tane]').count() >= 8, '「？のたね」を 押すと カードが 出る（8まい）');
  const sb = await page.locator('.seeds').boundingBox();
  const wb = await page.locator('.sheet.bigsheet').boundingBox();
  ok(sb.y + sb.height <= wb.y + 1 && wb.y + wb.height >= (page.viewportSize().height - 2), 'カードは 窓の すぐ上に 出て、窓は 画面の 下に 寄る');
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
  ok(await page.isVisible('button[disabled]:has-text("第1回で えらんだ")') && !(await page.isVisible(`[data-act=showcase][data-id="${old}"]`)), '前の 回で えらんだ 付箋は えらべない');
  await page.keyboard.press('Escape');
  const nw = before.other[0];
  await page.click(`#board .note[data-id="${nw}"]`);
  await page.click(`[data-act=showcase][data-id="${nw}"]`);
  ok((await st()).items.find(x => x.id === nw).showcase === 2, 'ほかの 付箋は 第2回の 見てほしい付箋に できる');
  await page.keyboard.press('Escape');
  await rotTo('A-1');
  await who('A05');
  ok(await page.isVisible(`.big[data-id="${nw}"]`) && !(await page.isVisible(`.big[data-id="${old}"]`)), 'シール貼り画面には 今の 回の 見てほしい付箋だけ 出る');
  ok(await used('star') === 0, '持ち分は 回ごとに もどる（★ のこり2）');
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
  await page.click('[data-act=ttab][data-k=tally]');
  ok(await page.isVisible('h2:has-text("シールの 集計")') && await page.locator('table.tally').count() > 0, '先生画面から シールの 集計の ページに 飛べる');
  await page.click('[data-act=tround][data-r="1"]');
  const t1 = await page.$$eval('table.tally tr', trs => trs.slice(1).map(tr => tr.textContent));
  ok(t1.length > 0, '回を えらんで 班ごと・付箋ごとの シールの 数が 見える');
  await page.screenshot({ path: SHOTS + '/13-tally.png', fullPage: true });
  await page.click('[data-act=ttab][data-k=list]');
  ok(await page.isVisible('text=意見の 一覧'), 'タブで 一覧に もどれる');
  await page.click('[data-act=ttab][data-k=more]');
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
  ok(await tp.isVisible('.book') && await tp.locator('.big').count() > 0, '② シール貼りの 画面に なる');
  await tp.click('.trial [data-act=trial-go][data-n="2"]');
  ok(await tp.isVisible('.stage') && await tp.locator('.stnote .s').count() > 0, '③ 見られる班の 画面（見本の シールが 1まいずつ）');
  await tp.click('.trial [data-act=trial-go][data-n="3"]');
  ok(await tp.isVisible('h2:has-text("シールの 集計")') && (await tp.$$eval('table.tally td.num:not(.zero)', els => els.length)) > 0, '③ 先生の 集計（見本の シールが 入っている）');
  await tp.click('.trial [data-act=trial-go][data-n="4"]');
  ok(await tp.isVisible('[data-act=mode][data-k=starOut]') && await tp.isVisible('[data-act=rotmin]') && await tp.isVisible('[data-act=round-next]'), '④ 先生の モード・回の 設定');
  await tp.screenshot({ path: SHOTS + '/14-trial.png' });
  ok(await page.evaluate(() => localStorage.getItem('toiboard.v3')) === realBefore, '体験の データは 本番の 保存場所に 入らない');
  await tp.close();
  }
  {
  // 枠：タイトル案ボタン／タイトルを 辺の 上で ドラッグ
  await who('A01'); await page.click('.face[data-face=front]');
  await page.evaluate(() => { const sc = document.querySelector('.wrap'); sc.scrollTop = 0; });
  await claim(); await page.click('[data-act=frame]');
  const fid = await page.evaluate(() => S.items.filter(x => x.kind === 'frame').slice(-1)[0].id);
  await page.click(`#board .frame[data-id="${fid}"] .label`);
  ok(await page.locator('.tsug .btn').count() === 6 && await page.isVisible('.tsug .btn:has-text("ヘルプミー！")'), '枠の 設定に タイトル案が 6つ ある');
  await page.click('.tsug .btn:has-text("本命こうほ")');
  ok(await page.inputValue('#f-text') === '本命こうほ', 'タイトル案を 押すと 欄に 入る');
  await page.click('[data-act=f-save]');
  await claim();
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
  const lkb = await page.locator(`#board .note[data-id="${ln}"] .likes .lk`).first().boundingBox();
  const textTop = await page.$eval(`#board .note[data-id="${ln}"]`, el => { const r = document.createRange(); const tn = [...el.childNodes].find(n => n.nodeType === 3); r.selectNodeContents(tn); return r.getBoundingClientRect().top; });
  const nbx = await box(ln), lks2 = await page.$$eval(`#board .note[data-id="${ln}"] .likes .lk`, els => els.map(e => { const r = e.getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom]; }));
  const midY = (lks2[0][2] + lks2[lks2.length - 1][3]) / 2;
  ok(lks2.length === 2 && lkb.width >= 15 && lkb.width <= 20 && nbx.x + nbx.width - lks2[0][1] <= 6 && Math.abs(lks2[0][0] - lks2[1][0]) < 5 && lks2[1][2] > lks2[0][2] + 8 && Math.abs(midY - (nbx.y + nbx.height / 2)) < 5, 'いいねは 半分の 大きさで、付箋の 右の 辺 ぎりぎりに 縦に ならび、高さの 中央に そろう（シール感の 小さな ずれは ゆるす）');
  ok(await page.$eval(`#board .note[data-id="${ln}"] .likes`, el => +getComputedStyle(el).zIndex >= 2), '文字と 重なっても シールが 上に くる');
  const tf1 = await page.$$eval(`#board .note[data-id="${ln}"] .likes .lk`, els => els.map(e => e.style.transform));
  await page.evaluate(() => render());
  const tf2 = await page.$$eval(`#board .note[data-id="${ln}"] .likes .lk`, els => els.map(e => e.style.transform));
  ok(tf1.every(x => /rotate\(-?\d+deg\)/.test(x)) && tf1[0] !== tf1[1] && JSON.stringify(tf1) === JSON.stringify(tf2), 'シールは 1まいずつ 少し ずれて 傾き、描き直しても 動かない');
  const lks = await page.$$eval(`#board .note[data-id="${ln}"] .likes .lk`, els => els.map(e => [e.dataset.m, e.title, !!e.querySelector('img')]));
  ok(lks[0][0] === 'thumb1' && lks[1][0] === 'thumb2' && lks[0][1] === '1ばん' && lks[1][1] === '2ばん' && lks.every(x => x[2]), 'いいねは 元の シールの 絵のまま、メンバーごとに グラデーションの ちがう シール（1ばん・2ばん）');
  ok(await page.isVisible('.mates:has-text("1ばん")') && await page.isVisible('.mates:has-text("2ばん（じぶん）")') && await page.locator('.mates img').count() >= 2, '班の ボードに メンバーごとの いいねの 見本が 出る');
  ok(!(await page.isVisible(`#board .note[data-id="${ln}"] .stars [data-kind=thumb]`)), 'いいねは 下の シールの 列には 出ない');
  await who('A05'); await page.click('[data-act=look][data-t="A-1"]');
  ok(!(await page.isVisible(`#board .note[data-id="${ln}"] .likes`)), 'ほかの班には いいねは 見えない');
  await page.click('[data-act=home]');
  }
  {
  // 理念の チェック
  // ・漢字は 日本語の 字形（描画に 使われた フォントに 中国語フォントが ない）
  await who('A01'); await page.click('.face[data-face=front]');
  const e0 = errors.length;
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const fonts = new Set();
  for (const sel of ['h1', '#board .note', '.tbtn', '.face']) {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
    if (!nodeId) continue;
    const r = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    r.fonts.forEach(f => fonts.add(f.familyName));
  }
  const bad = [...fonts].filter(f => /WenQuanYi|SimSun|YaHei|PingFang|CJK SC|CJK TC|Zen Hei|Micro Hei/i.test(f));
  ok(fonts.size > 0 && bad.length === 0 && await page.evaluate(() => document.documentElement.lang) === 'ja', '漢字は 日本語の フォントで 描く（' + [...fonts].join('・') + '）');
  // CDP で 文書を 読むと file:// では ブラウザが この 警告を 出す（アプリの エラーでは ない）
  for (let i = errors.length - 1; i >= e0; i--) if (/Unsafe attempt to load URL file:/.test(errors[i])) errors.splice(i, 1);
  // ・消す 操作は 注意色
  await claim(); await page.click('[data-act=frame]');
  const fid2 = await page.evaluate(() => S.items.filter(x => x.kind === 'frame').slice(-1)[0].id);
  await page.click(`#board .frame[data-id="${fid2}"] .label`);
  const dc = await page.$eval('.sheet [data-act=del]', el => getComputedStyle(el).color);
  ok(dc === 'rgb(192, 51, 10)' && !(await page.$eval('.sheet [data-act=del]', el => el.classList.contains('primary'))), '消す ボタンは 注意色（主操作の 強調は しない）');
  await page.click('.sheet [data-act=del]');
  // ・調査済みは 色だけに たよらない
  await page.evaluate(() => commit(() => { const n = S.items.find(x => x.team === 'A-1' && x.face === 'front' && x.kind === 'note' && !x.stackOf); n.done = true; }));
  ok(await page.locator('#board .note.done .donemark:has-text("調査済み")').count() > 0, '調査済みは 緑に 加えて「✓ 調査済み」の 文字');
  // ・先生：ひとおしで ぜんぶ 切に もどせる
  await who('teacher');
  await page.click('[data-act=mode][data-k=view][data-v=class]');
  await page.click('[data-act=modes-off]');
  const mA = await page.evaluate(() => S.modes.A);
  ok(mA.view === 'off' && mA.propose === 'off' && mA.starOut === 'off' && await page.isDisabled('[data-act=modes-off]'), '先生は ひとおしで その組を ぜんぶ 切に もどせる');
  }
  {
  // 先生は 付箋を 完全に 消せる（2回 押して 確定）
  await who('teacher'); await page.click('[data-act=ttab][data-k=board]');
  const pid = await page.evaluate(() => S.items.find(x => x.team === 'A-1' && x.face === 'front' && x.kind === 'note' && !x.stackOf).id);
  await page.click(`#board .note[data-id="${pid}"]`);
  ok(await page.isVisible('.bignote #w-text') && !(await page.isVisible('[data-act=done]')) && !(await page.isVisible('[data-act=toface]')), '先生は 児童の 付箋の 文字を 直せる（しるし・移動の ボタンは 出ない）');
  await page.fill('#w-text', '先生が 直した 問い'); await page.keyboard.press('Escape');
  ok(await page.evaluate(id => item(id).text, pid) === '先生が 直した 問い', '先生の 直した 文が 保存される');
  await page.click(`#board .note[data-id="${pid}"]`);
  await page.click(`[data-act=purge][data-id="${pid}"]`);
  ok(await page.isVisible('text=もう一度 押すと 完全に 消えます（もどせません）') && await page.evaluate(id => !!item(id), pid), '完全削除は 1回目では 消えず、もどせないと 知らせる');
  await page.click(`[data-act=purge][data-id="${pid}"]`);
  const gone = await page.evaluate(id => !item(id) && !S.stars.some(s => s.noteId === id) && !S.comments.some(c => c.noteId === id), pid);
  ok(gone && !(await page.isVisible(`#board .note[data-id="${pid}"]`)), '2回目で 付箋と その シール・コメントが 完全に 消える');
  await who('A01');
  ok(!(await page.isVisible('[data-act=purge]')), '児童には 完全削除の ボタンが ない');
  }
  {
  // 学習が 止まらない（画面）
  await who('A01'); await page.click('.face[data-face=front]');
  // 入力は 字数で 止まる（あとで 切られて 消えない）
  await page.click('.fab');
  ok(await page.getAttribute('#w-text', 'maxlength') === '200', '付箋の 文は 200字で 入力が 止まる');
  await page.keyboard.press('Escape');
  // 見てほしい付箋は SHOW_PER_TEAM（8）まいまで
  const LIM = await page.evaluate(() => SHOW_PER_TEAM);
  await page.evaluate(n => commit(() => { for (let i = 0; i <= n; i++) S.items.push({ id: nid(), kind: 'note', team: 'A-1', face: 'front', x: 1 + (i % 6) * 8, y: 60 + Math.floor(i / 6) * 7, text: 'え' + i, author: me }); }), LIM);
  const five = await page.evaluate(n => S.items.filter(x => x.team === 'A-1' && x.face === 'front' && x.kind === 'note' && !x.stackOf).slice(-(n + 1)).map(x => x.id), LIM);
  await page.evaluate(([ids, n]) => commit(() => { S.items.forEach(x => { if (x.team === 'A-1' && shownNow(x) && !ids.includes(x.id)) x.showcase = 0; }); ids.slice(0, n).forEach(id => { item(id).showcase = curRound('A-1'); }); }), [five, LIM]);
  await page.locator(`#board .note[data-id="${five[LIM]}"]`).scrollIntoViewIfNeeded();
  await page.click(`#board .note[data-id="${five[LIM]}"]`);
  await page.click(`[data-act=showcase][data-id="${five[LIM]}"]`);
  ok(LIM === 8 && await page.isVisible('text=見てほしい付箋は 8まいまで') && !(await page.evaluate(id => shownNow(item(id)), five[LIM])), '見てほしい付箋は 8まいまで（9まい目は 知らせて とめる）');
  await page.keyboard.press('Escape');
  // 先生：見てほしい付箋が ない 班を 知らせる
  await who('teacher');
  ok(await page.isVisible('.warn:has-text("見てほしい付箋が まだ ない 班")') && !(await page.textContent('.warn')).includes('1はん'), '先生の 画面に 見てほしい付箋が ない 班が 出る（1はんは ある）');
  // 先生：コメントを 1つずつ 消せる
  const cn = await page.evaluate(() => { const n = S.items.find(x => x.team === 'A-1' && x.face === 'front' && x.kind === 'note' && !x.stackOf); S.comments.push({ noteId: n.id, viewer: 'B03', text: 'ふさわしくない ことば' }); Platform.push(null); return n.id; });
  await page.click('[data-act=ttab][data-k=board]');
  await page.click(`#board .note[data-id="${cn}"] .cicon`);
  await page.click('[data-act=cmt-purge]');
  ok(!(await page.evaluate(id => S.comments.some(c => c.noteId === id && c.text === 'ふさわしくない ことば'), cn)), '先生は コメントを 1つずつ 消せる');
  }
  ok(errors.length === 0, 'コンソールに エラー・アサートが無い' + (errors.length ? '：' + errors.join(' / ') : ''));
  await browser.close();
  console.log(failed ? `\n${failed} 件 失敗` : '\nすべて合格');
  process.exit(failed ? 1 : 0);
})();
