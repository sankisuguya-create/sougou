/* シールの絵の正本。node tools/make-stickers.cjs で stickers/*.png と index.html 埋め込み用 stickers/stickers.js を作り直す */
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const SRC = String.raw`
var SHAPES = {
  star:(function(){ var p = []; for(var i = 0; i < 10; i++){ var r = i % 2 ? 6.8 : 13, a = -Math.PI/2 + i*Math.PI/5; p.push((16 + r*Math.cos(a)).toFixed(2) + ' ' + (17 + r*Math.sin(a)).toFixed(2)); } return 'M' + p.join('L') + 'Z'; })(),
  circle:'M16 4a12 12 0 1 1 0 24a12 12 0 1 1 0-24Z',
  bolt:'M20 3L6 18h8.5l-3.5 11l15-17h-8.5l2.5-9Z',
  // いいね（分かった）：親指を立てた手＋袖
  thumb:'M11.5 15L15.2 6.8Q16.6 3.6 18.8 5Q20.4 6.2 19.6 9.2L18.6 13H25.6Q28.7 13 28.2 16.2L26.7 25Q26.2 28.2 23.1 28.2H11.5ZM4.6 14.6H9.6V28.6H4.6Z'
};
/* 立てた形で描いて 回転させる（M/L/Q の絶対座標だけ使う） */
function rot(d, deg, cx, cy){
  var a = deg*Math.PI/180, c = Math.cos(a), si = Math.sin(a), i = 0, nums = [];
  return d.replace(/-?\d*\.?\d+/g, function(v){
    nums.push(+v); var k = i++;
    if(k % 2 === 0) return '\u0000';
    var x = nums[k-1], y = +v, X = cx + (x-cx)*c - (y-cy)*si, Y = cy + (x-cx)*si + (y-cy)*c;
    return X.toFixed(2) + ' ' + Y.toFixed(2);
  }).replace(/\u0000\s*/g, '');
}
var DETAIL = {
  wow:'<g stroke="#1A1A1A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M12.4 10.4L12.4 18"/><path d="M17 12.6Q17.3 9.8 20.1 9.8Q23 9.8 23 12.4Q23 14.4 20.7 15.3Q19.9 15.7 19.9 17.8"/></g><circle cx="12.4" cy="22.2" r="1.45" fill="#1A1A1A"/><circle cx="19.9" cy="22.2" r="1.45" fill="#1A1A1A"/>', thumb:'<path d="M20.5 18.4H27.2M20.5 23H26.4" stroke="#1A1A1A" stroke-width="1" stroke-linecap="round" fill="none"/>' };
var GLINT = {
  star:'<path d="M6.9 14.3L10.8 13.6" />',
  circle:'<path d="M9 12.5q1.6-4 6-5.2" /><circle cx="8.4" cy="15.6" r="1.15" stroke="none"/>',
  bolt:'<path d="M16.6 9.6L12.4 14.1" />',
  thumb:'<path d="M14.4 13.2L16.5 8.8" />'
};
/* 固有色は 明るい／パステルな 2色の グラデーション。黒っぽい色は使わない。種類ごとに 色の系統を分ける（左上が明るく 右下が濃い：光の向きと そろえる） */
var STICKER_COLORS = {
  '#E0A43A':['#FFF27A', '#FFAE4D'],  // 星（しりたい！）：レモン → アプリコット
  '#FF8FB5':['#FFC2D6', '#FF7AAE'],  // 円（予備）：さくら → ピンク
  '#7CC4FF':['#B2F0FF', '#7FA8FF'],  // 稲妻（予備）：水色 → そら色
  '#8EDB8A':['#DDF8A8', '#6CCB8E'],  // いいね（分かった）：ライム → ミント
  '#7FB8FF':['#D9A06A', '#8A5530'],  // つるはし（もっと知りたい）：柄は 茶色（刃は PARTS で メタリックな黒）
  '#FFB38A':['#FFE6CC', '#FF9A6B'],  // 豆電球（参考になった）：ピーチ → コーラル（星の黄と分ける）
  '#C9A8FF':['#EEDCFF', '#B38BFF']   // !?（その発想はなかった）：うすむらさき → ラベンダー
};
SHAPES.pick = rot('M2.6 13.2Q16 -4.4 29.4 13.2Q23 10.6 19 11.6L19 29Q19 31.4 16 31.4Q13 31.4 13 29L13 11.6Q9 10.6 2.6 13.2Z', 40, 16, 16.5);
SHAPES.wow = (function(){ var p = []; for(var i = 0; i < 24; i++){ var r = i % 2 ? 11.2 : 14.6, a = -Math.PI/2 + i*Math.PI/12; p.push((16 + r*Math.cos(a)).toFixed(2) + ' ' + (16.5 + r*Math.sin(a)).toFixed(2)); } return 'M' + p.join('L') + 'Z'; })();
GLINT.pick = rot('<path d="M7.6 8.4Q10 6.2 13 5.2" />', 40, 16, 16.5);
GLINT.wow = '<path d="M7.6 11.2L9.6 8.6" />';
// 豆電球（自分の問い出しの参考になった！）：ガラス球＋口金（口金のすき間は黒の輪郭で埋まり、ねじ山に見える）
SHAPES.bulb = 'M16 3Q26.2 3 26.2 13Q26.2 18.2 21.6 21.6L21.6 24L10.4 24L10.4 21.6Q5.8 18.2 5.8 13Q5.8 3 16 3ZM11 25.4L21 25.4L21 28Q21 30.8 16 30.8Q11 30.8 11 28Z';
GLINT.bulb = '<path d="M9.4 11.6Q10.2 7.6 13.8 6.4" />';
DETAIL.bulb = '<path d="M14 20.4L14 16.4Q16 12.4 18 16.4L18 20.4" stroke="#1A1A1A" stroke-width="1.1" stroke-linecap="round" fill="none"/><path d="M11.4 27.6H20.6" stroke="#1A1A1A" stroke-width="1" stroke-linecap="round"/>';
/* 1つの形の中で 色を塗り分ける部分（形で切り抜いて 上に重ねる）。stops は [位置, 色] */
var PARTS = {
  // つるはしの刃：メタリックな黒（明暗の帯で 金属らしく）。柄は 下地の茶色
  pick:[{ d: rot('M1 13.6Q16 -6 31 13.6L31 12.2Q23 10.6 19 11.9L13 11.9Q9 10.6 1 12.2Z', 40, 16, 16.5),
          x1:0, y1:0, x2:1, y2:1,
          stops:[[0,'#8C939E'],[0.35,'#3A3F47'],[0.55,'#A9B0BA'],[0.75,'#2E3238'],[1,'#5C636D']] }]
};
/* 手前に重ねる形（外形は 下の形と ひとつながりになり、重なった所の 下の形の輪郭は 隠れる） */
var FRONT = {
  // つるはしの刃の 左上の先に 黄色い 衝撃のギザギザ
  pick:{ d:(function(){ var p = []; for(var i = 0; i < 16; i++){ var r = i % 2 ? 3.7 : 6.1, a = -Math.PI/2 + i*Math.PI/8; p.push((7.6 + r*Math.cos(a)).toFixed(2) + " " + (7.2 + r*Math.sin(a)).toFixed(2)); } return 'M' + p.join('L') + 'Z'; })(),
         colors:['#FFF27A', '#FFC23A'], glint:'<path d="M5.2 6.2L6.4 4.8" />' }
};
// 柄の ツヤ（柄の 左上がわの 輪郭に 平行）
GLINT.pick += rot('<path d="M14.5 15.5L14.5 25.5" />', 40, 16, 16.5);
function frontLayer(F, gid){
  var fid = gid + 'f';
  return '<path d="' + F.d + '" fill="#1A1A1A" stroke="#1A1A1A" stroke-width="2.3" stroke-linejoin="round"/>'
    + '<defs><linearGradient id="' + fid + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + F.colors[0] + '"/><stop offset="1" stop-color="' + F.colors[1] + '"/></linearGradient>'
    + '<clipPath id="c' + fid + '"><path d="' + F.d + '"/></clipPath></defs>'
    + '<path d="' + F.d + '" fill="url(#' + fid + ')"/>'
    + '<g clip-path="url(#c' + fid + ')"><path d="' + F.d + '" fill="none" stroke="#fff" stroke-width="1.2" stroke-linejoin="round" filter="url(#f' + gid + ')"/></g>'
    + '<path d="' + F.d + '" fill="none" stroke="#fff" stroke-width="0.95" stroke-linejoin="round"/>'
    + '<g fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" filter="url(#f' + gid + ')">' + (F.glint || '') + '</g>';
}
function sticker(shape, color, size){
  var d = SHAPES[shape], c = STICKER_COLORS[color] || [color, color], gid = 'g' + shape + color.replace('#', '');
  var F = FRONT[shape], whole = F ? d + F.d : d;
  return '<svg viewBox="0 0 33 33"' + (size ? ' width="' + size + '" height="' + size + '" style="vertical-align:middle"' : '') + ' aria-hidden="true">'
    + '<path d="' + whole + '" fill="#1A1A1A" stroke="#1A1A1A" stroke-width="2.3" stroke-linejoin="round" transform="translate(0.65 0.65)"/>'
    + '<path d="' + whole + '" fill="#1A1A1A" stroke="#1A1A1A" stroke-width="2.3" stroke-linejoin="round"/>'
    + '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c[0] + '"/><stop offset="1" stop-color="' + c[1] + '"/></linearGradient></defs>'
    + '<path d="' + d + '" fill="url(#' + gid + ')"/>'
    + (PARTS[shape] || []).map(function(pt, j){
        var pid = gid + 'p' + j;
        return '<defs><linearGradient id="' + pid + '" x1="' + pt.x1 + '" y1="' + pt.y1 + '" x2="' + pt.x2 + '" y2="' + pt.y2 + '">'
          + pt.stops.map(function(st){ return '<stop offset="' + st[0] + '" stop-color="' + st[1] + '"/>'; }).join('') + '</linearGradient>'
          + '<clipPath id="k' + pid + '"><path d="' + d + '"/></clipPath></defs>'
          + '<path d="' + pt.d + '" fill="url(#' + pid + ')" clip-path="url(#k' + pid + ')"/>';
      }).join('')
    // 白と固有色の境目をぼかす：形の内側だけに、ぼかした白をにじませる（外側の黒との境はくっきり保つ）
    + '<defs><clipPath id="c' + gid + '"><path d="' + d + '"/></clipPath><filter id="f' + gid + '" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.3"/></filter></defs>'
    + '<g clip-path="url(#c' + gid + ')"><path d="' + d + '" fill="none" stroke="#fff" stroke-width="1.2" stroke-linejoin="round" filter="url(#f' + gid + ')"/></g>'
    + '<path d="' + d + '" fill="none" stroke="#fff" stroke-width="0.95" stroke-linejoin="round"/>'
    + (DETAIL[shape] || '')
    + (F ? frontLayer(F, gid) : '')
    + '<g fill="#fff" stroke="#fff" stroke-width="1.7" stroke-linecap="round" style="fill-opacity:1" filter="url(#f' + gid + ')">' + GLINT[shape].replace('<path', '<path fill="none"') + '</g>'
    + '</svg>';
}
`;
const KINDS = [['star', '#E0A43A'], ['circle', '#FF8FB5'], ['bolt', '#7CC4FF'], ['thumb', '#8EDB8A'], ['pick', '#7FB8FF'], ['wow', '#C9A8FF'], ['bulb', '#FFB38A']];
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
