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
DETAIL.bulb = '<path d="M12.4 20.4L12.4 16.8Q13.6 13.6 14.8 16.8Q16 13.6 17.2 16.8Q18.4 13.6 19.6 16.8L19.6 20.4" stroke="#1A1A1A" stroke-width="1.1" stroke-linecap="round" fill="none"/><path d="M11.4 27.6H20.6" stroke="#1A1A1A" stroke-width="1" stroke-linecap="round"/>';
/* 1つの形の中で 色を塗り分ける部分（形で切り抜いて 上に重ねる）。stops は [位置, 色] */
var PARTS = {
  // つるはしの刃：メタリックな黒（明暗の帯で 金属らしく）。柄は 下地の茶色
  pick:[{ d: rot('M1 13.6Q16 -6 31 13.6L31 12.2Q23 10.6 19 11.9L13 11.9Q9 10.6 1 12.2Z', 40, 16, 16.5),
          x1:0, y1:0, x2:1, y2:1,
          stops:[[0,'#8C939E'],[0.35,'#3A3F47'],[0.55,'#A9B0BA'],[0.75,'#2E3238'],[1,'#5C636D']] }]
};
/* 後ろに置く形（外形は 本体と ひとつながりの 1枚の シール。本体の 刃先は その手前に 来る） */
var FRONT = {
  // つるはしの刃の 左上の先に 黄色い 衝撃のギザギザ
  pick:{ d:(function(){ var p = []; for(var i = 0; i < 16; i++){ var r = i % 2 ? 3.7 : 6.1, a = -Math.PI/2 + i*Math.PI/8; p.push((7.6 + r*Math.cos(a)).toFixed(2) + " " + (7.2 + r*Math.sin(a)).toFixed(2)); } return 'M' + p.join('L') + 'Z'; })(),
         colors:['#FFF27A', '#FFC23A'], glint:'<path d="M5.2 6.2L6.4 4.8" />' }
};
// 流れ星（とくに 面白い・知りたい）：右上の 星と、左下へ のびる 尾（尾は 後ろの 形として 別の 色）
SHAPES.shoot = (function(){ var p = []; for(var i = 0; i < 10; i++){ var r = i % 2 ? 4.9 : 9.6, a = -Math.PI/2 + i*Math.PI/5; p.push((21.4 + r*Math.cos(a)).toFixed(2) + ' ' + (11.6 + r*Math.sin(a)).toFixed(2)); } return 'M' + p.join('L') + 'Z'; })();
GLINT.shoot = '<path d="M14.6 9.2L17.4 8.8" />';
FRONT.shoot = { d:'M15.2 9.4Q8 15 2.4 29.2Q4.6 27.6 6.4 28.2Q8.4 22.6 11 20.2Q11.2 24 13.2 25.2Q14.6 20 18.6 17.4Z',
  colors:['#C9F0FF', '#8FA6FF'], glint:'<path d="M6.6 23.2Q8.4 18.4 11.2 15.2" />' };
STICKER_COLORS['#FFD54A'] = ['#FFF7A6', '#FFC23A'];  // 流れ星の 星：クリーム → 山吹（ふつうの 星より 明るく）
// 柄の ツヤ（柄の 左上がわの 輪郭に 平行）
GLINT.pick += rot('<path d="M14.5 15.5L14.5 25.5" />', 40, 16, 16.5);
function frontLayer(F, gid){
  var fid = gid + 'f';
  return '<defs><linearGradient id="' + fid + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + F.colors[0] + '"/><stop offset="1" stop-color="' + F.colors[1] + '"/></linearGradient>'
    + '<clipPath id="c' + fid + '"><path d="' + F.d + '"/></clipPath></defs>'
    + '<path d="' + F.d + '" fill="url(#' + fid + ')"/>'
    + '<g clip-path="url(#c' + fid + ')"><path d="' + F.d + '" fill="none" stroke="#fff" stroke-width="1.2" stroke-linejoin="round" filter="url(#f' + gid + ')"/></g>'
    + '<path d="' + F.d + '" fill="none" stroke="#fff" stroke-width="0.95" stroke-linejoin="round"/>'
    + '<g fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" filter="url(#f' + gid + ')">' + (F.glint || '') + '</g>';
}
/* 流れ星：星と 3本の 帯（尾）を 1つの シールに。黒い 縁と 白い 縁は 星＋尾 を 合わせた 形から フィルタで 作る
   （形ごとに 縁を 描くと 継ぎ目に 線が 出るため。黒は 外へ 広げ、白は 内側の 細い 輪） */
function shootSVG(size){
  var star = (function(){ var p = []; for(var i = 0; i < 10; i++){ var r = i % 2 ? 5.3 : 10.5, a = -Math.PI/2 - 0.12 + i*Math.PI/5; p.push((12.5 + r*Math.cos(a)).toFixed(2) + ' ' + (19.6 + r*Math.sin(a)).toFixed(2)); } return 'M' + p.join('L') + 'Z'; })();
  var tail = 'M9.6 14.2Q18 4.6 28.2 2.8L30.1 7.6L30.6 12.6L29.2 17.8Q22.6 17.4 15.6 23.6Z';
  var b1 = 'M9.6 14.2Q18 4.6 28.2 2.8L30.1 7.6Q20.4 9.2 12.2 17Z';
  var b2 = 'M12.2 17Q20.4 9.2 30.1 7.6L30.6 12.6Q21.8 13.2 14.4 20.6Z';
  var b3 = 'M14.4 20.6Q21.8 13.2 30.6 12.6L29.2 17.8Q22.6 17.4 15.6 23.6Z';
  var U = '<path d="' + tail + '"/><path d="' + star + '"/>';
  var g = function(id, a, b){ return '<linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient>'; };
  return '<svg viewBox="0 0 33 33"' + (size ? ' width="' + size + '" height="' + size + '"' : '') + ' aria-hidden="true"><defs>'
    + g('shS', '#FFF6A8', '#FFC94A') + g('sh1', '#FFD3E6', '#F79CC6') + g('sh2', '#D6F1FF', '#9FD2F5') + g('sh3', '#E6E0FF', '#B9AEEB')
    + '<filter id="shO" x="-20%" y="-20%" width="140%" height="140%"><feMorphology in="SourceAlpha" operator="dilate" radius="1.15" result="d"/><feFlood flood-color="#1A1A1A"/><feComposite in2="d" operator="in"/></filter>'
    + '<filter id="shR" x="-20%" y="-20%" width="140%" height="140%"><feMorphology in="SourceAlpha" operator="erode" radius="0.55" result="e"/><feComposite in="SourceAlpha" in2="e" operator="out" result="ring"/><feFlood flood-color="#fff"/><feComposite in2="ring" operator="in"/><feGaussianBlur stdDeviation="0.18"/></filter>'
    + '</defs>'
    + '<g filter="url(#shO)" transform="translate(0.65 0.65)">' + U + '</g>'
    + '<g filter="url(#shO)">' + U + '</g>'
    + '<path d="' + b1 + '" fill="url(#sh1)"/><path d="' + b2 + '" fill="url(#sh2)"/><path d="' + b3 + '" fill="url(#sh3)"/>'
    + '<path d="' + star + '" fill="url(#shS)"/>'
    + '<g filter="url(#shR)">' + U + '</g>'
    + '<path d="M6.4 17.6L9.6 17" stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none"/>'
    + '</svg>';
}
/* 班の中の いいね：メンバーごとに 色を 変える（緑・赤・青・黄・紫。絵と 光の 向きは 同じ） */
var VARIANT = {
  thumb1:{c:['#DDF8A8', '#6CCB8E'], v:[0, 0, 1, 1]},  // 緑（元の いいね）
  thumb2:{c:['#FFC9C2', '#FF6F6F'], v:[0, 0, 1, 1]},  // 赤
  thumb3:{c:['#B9E6FF', '#6A9CFF'], v:[0, 0, 1, 1]},  // 青
  thumb4:{c:['#FFF58A', '#FFC93C'], v:[0, 0, 1, 1]},  // 黄
  thumb5:{c:['#F0DEFF', '#AA80FF'], v:[0, 0, 1, 1]}   // 紫
};
function sticker(shape, color, size, variant){
  if(shape === 'shoot') return shootSVG(size);
  var V = VARIANT[variant] || null;
  var d = SHAPES[shape], c = V ? V.c : (STICKER_COLORS[color] || [color, color]), gid = 'g' + (variant || shape) + color.replace('#', '');
  var gv = V ? V.v : [0, 0, 1, 1];
  var F = FRONT[shape], whole = F ? d + F.d : d;
  return '<svg viewBox="0 0 33 33"' + (size ? ' width="' + size + '" height="' + size + '" style="vertical-align:middle"' : '') + ' aria-hidden="true">'
    + '<path d="' + whole + '" fill="#1A1A1A" stroke="#1A1A1A" stroke-width="2.3" stroke-linejoin="round" transform="translate(0.65 0.65)"/>'
    + '<path d="' + whole + '" fill="#1A1A1A" stroke="#1A1A1A" stroke-width="2.3" stroke-linejoin="round"/>'
    + (F ? frontLayer(F, gid) : '')   // 後ろに置く形（外形は 上の黒で ひとつながり）
    + '<defs><linearGradient id="' + gid + '" x1="' + gv[0] + '" y1="' + gv[1] + '" x2="' + gv[2] + '" y2="' + gv[3] + '"><stop offset="0" stop-color="' + c[0] + '"/><stop offset="1" stop-color="' + c[1] + '"/></linearGradient></defs>'
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
    // 後ろの形（ギザギザ）に重なった所だけ、手前の形（刃先）の縁を 細い黒線で区切る
    + (F ? '<defs><clipPath id="o' + gid + '"><path d="' + F.d + '"/></clipPath></defs><path d="' + d + '" fill="none" stroke="#1A1A1A" stroke-width="1" stroke-linejoin="round" clip-path="url(#o' + gid + ')"/>' : '')
    + '<g fill="#fff" stroke="#fff" stroke-width="1.7" stroke-linecap="round" style="fill-opacity:1" filter="url(#f' + gid + ')">' + GLINT[shape].replace('<path', '<path fill="none"') + '</g>'
    + '</svg>';
}
`;
const KINDS = [['star', '#E0A43A'], ['circle', '#FF8FB5'], ['bolt', '#7CC4FF'], ['thumb', '#8EDB8A'], ['pick', '#7FB8FF'], ['wow', '#C9A8FF'], ['bulb', '#FFB38A'], ['shoot', '#FFD54A'],
  ['thumb', '#8EDB8A', 'thumb1'], ['thumb', '#8EDB8A', 'thumb2'], ['thumb', '#8EDB8A', 'thumb3'], ['thumb', '#8EDB8A', 'thumb4'], ['thumb', '#8EDB8A', 'thumb5']];
const SIZE = 128; // 表示は最大 64px 程度。2倍密度の画面でも足りる大きさ
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: SIZE, height: SIZE } });
  const out = {};
  for (const [k, c, va] of KINDS) {
    await p.setContent('<style>html,body{margin:0;background:transparent}</style><body></body>');
    await p.evaluate(([src, k, c, s, va]) => { eval(src + ';window.__s=sticker'); document.body.innerHTML = window.__s(k, c, s, va); }, [SRC.replace(/^var /gm, 'var '), k, c, SIZE, va || null]);
    const buf = await p.locator('svg').screenshot({ omitBackground: true });
    const name = va || k;
    fs.writeFileSync(path.join(__dirname, '..', 'stickers', name + '.png'), buf);
    out[name] = 'data:image/png;base64,' + buf.toString('base64');
  }
  fs.writeFileSync(path.join(__dirname, '..', 'stickers', 'stickers.js'), 'var SEAL_IMG = ' + JSON.stringify(out) + ';\n');
  await b.close(); console.log('ok', Object.keys(out).join(','));
})();
