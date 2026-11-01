/* シールの絵の正本。node tools/make-stickers.cjs で stickers/*.png と index.html 埋め込み用 stickers/stickers.js を作り直す */
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const SRC = String.raw`
var SHAPES = {
  star:(function(){ var p = []; for(var i = 0; i < 10; i++){ var r = i % 2 ? 6.8 : 13, a = -Math.PI/2 + i*Math.PI/5; p.push((16 + r*Math.cos(a)).toFixed(2) + ' ' + (17 + r*Math.sin(a)).toFixed(2)); } return 'M' + p.join('L') + 'Z'; })(),
  circle:'M16 4a12 12 0 1 1 0 24a12 12 0 1 1 0-24Z',
  bolt:'M20 3L6 18h8.5l-3.5 11l15-17h-8.5l2.5-9Z'
};
var GLINT = {
  star:'<path d="M6.9 14.3L10.8 13.6" />',
  circle:'<path d="M9 12.5q1.6-4 6-5.2" /><circle cx="8.4" cy="15.6" r="1.15" stroke="none"/>',
  bolt:'<path d="M16.6 9.6L12.4 14.1" />'
};
/* 固有色は 明るい／パステルな 2色の グラデーション。黒っぽい色は使わない。種類ごとに 色の系統を分ける（左上が明るく 右下が濃い：光の向きと そろえる） */
var STICKER_COLORS = {
  '#E0A43A':['#FFF27A', '#FFAE4D'],  // 星（しりたい！）：レモン → アプリコット
  '#FF8FB5':['#FFC2D6', '#FF7AAE'],  // 円（予備）：さくら → ピンク
  '#7CC4FF':['#B2F0FF', '#7FA8FF']   // 稲妻（予備）：水色 → そら色
};
function sticker(shape, color, size){
  var d = SHAPES[shape], c = STICKER_COLORS[color] || [color, color], gid = 'g' + shape + color.replace('#', '');
  return '<svg viewBox="0 0 33 33"' + (size ? ' width="' + size + '" height="' + size + '" style="vertical-align:middle"' : '') + ' aria-hidden="true">'
    + '<path d="' + d + '" fill="#1A1A1A" stroke="#1A1A1A" stroke-width="2.3" stroke-linejoin="round" transform="translate(0.65 0.65)"/>'
    + '<path d="' + d + '" fill="#1A1A1A" stroke="#1A1A1A" stroke-width="2.3" stroke-linejoin="round"/>'
    + '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c[0] + '"/><stop offset="1" stop-color="' + c[1] + '"/></linearGradient></defs>'
    + '<path d="' + d + '" fill="url(#' + gid + ')"/>'
    // 白と固有色の境目をぼかす：形の内側だけに、ぼかした白をにじませる（外側の黒との境はくっきり保つ）
    + '<defs><clipPath id="c' + gid + '"><path d="' + d + '"/></clipPath><filter id="f' + gid + '" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.3"/></filter></defs>'
    + '<g clip-path="url(#c' + gid + ')"><path d="' + d + '" fill="none" stroke="#fff" stroke-width="1.2" stroke-linejoin="round" filter="url(#f' + gid + ')"/></g>'
    + '<path d="' + d + '" fill="none" stroke="#fff" stroke-width="0.95" stroke-linejoin="round"/>'
    + '<g fill="#fff" stroke="#fff" stroke-width="1.7" stroke-linecap="round" style="fill-opacity:1" filter="url(#f' + gid + ')">' + GLINT[shape].replace('<path', '<path fill="none"') + '</g>'
    + '</svg>';
}
`;
const KINDS = [['star', '#E0A43A'], ['circle', '#FF8FB5'], ['bolt', '#7CC4FF']];
const SIZE = 128; // 表示は最大 64px 程度。2倍密度の画面でも足りる大きさ
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: SIZE, height: SIZE } });
  const out = {};
  for (const [k, c] of KINDS) {
    await p.setContent('<style>html,body{margin:0;background:transparent}</style><body></body>');
    await p.evaluate(([src, k, c, s]) => { eval(src + ';window.__s=sticker'); document.body.innerHTML = window.__s(k, c, s); }, [SRC.replace(/^var /gm, 'var '), k, c, SIZE]);
    const buf = await p.locator('svg').screenshot({ omitBackground: true });
    fs.writeFileSync(path.join(__dirname, '..', 'stickers', k + '.png'), buf);
    out[k] = 'data:image/png;base64,' + buf.toString('base64');
  }
  fs.writeFileSync(path.join(__dirname, '..', 'stickers', 'stickers.js'), 'var SEAL_IMG = ' + JSON.stringify(out) + ';\n');
  await b.close(); console.log('ok', Object.keys(out).join(','));
})();
