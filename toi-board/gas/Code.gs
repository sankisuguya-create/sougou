/* といボード GAS版 サーバー
   学年で 1つの スプレッドシートに 紐づけて 使う（拡張機能 → Apps Script）。
   画面は Index.html（build.cjs で ../index.html から 作る。手で 直さない）。 */

var API_VER = 8;
var SH = {roster:'名簿', teachers:'先生', spots:'スポット', items:'items', stars:'stars', comments:'comments', modes:'modes'};
var HEAD = {
  '名簿':['メール', '組', '班', '番号'],
  '先生':['メール', '組（空なら最初の組）'],
  'スポット':['組', '班', 'スポット名'],
  'items':['id', 'team', 'face', 'json', 'ver', 'del', 'by', 'at'],
  'stars':['key', 'noteId', 'noteTeam', 'viewer', 'on', 'ver', 'k', 'pos', 'rd'],
  'comments':['key', 'noteId', 'noteTeam', 'viewer', 'text', 'on', 'ver'],
  'modes':['組', 'json', 'ver']
};
var TEACHER_DOMAIN = '@edu.nishi.or.jp';
var FACE_KEYS = ['front', 'back', 'gift', 'trash'];
var KINDS = ['note', 'arrow', 'frame'];
var SCOPE_KEYS = ['off', 'class', 'grade'];
var STAR_KINDS = ['star', 'pick', 'wow', 'bulb', 'circle', 'bolt', 'thumb'];
var STAR_PER_TEAM = 2;
var SHOW_PER_TEAM = 4;  // 見てほしい付箋は 1つの 班で 今の 回に 4まいまで（指導案の「4つ選ぶ」）  // 1人が 1つの班に 貼れるのは 種類ごとに 2まいまで

/* ?trial=1 で 体験版（見本の データ。ブラウザの 中だけで 動き、本番の シートには 書かない） */
function doGet(e){
  var trial = e && e.parameter && e.parameter.trial;
  return HtmlService.createHtmlOutputFromFile(trial ? 'Trial' : 'Index')
    .setTitle('といボード')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* 最初に 1回 実行：シートと 見出しを 作る */
function setup(){
  var ss = SpreadsheetApp.getActive();
  Object.keys(HEAD).forEach(function(n){
    var sh = ss.getSheetByName(n) || ss.insertSheet(n);
    if(sh.getLastRow() === 0) sh.getRange(1, 1, 1, HEAD[n].length).setValues([HEAD[n]]);
    textFormat_(n, sh);
  });
  // 版が もう あれば さわらない（0 に もどすと、児童の 画面が 以後の 書きこみを 取りに 行かなくなる）
  var pr = PropertiesService.getScriptProperties();
  if(pr.getProperty('ver') === null) pr.setProperty('ver', '0');
}

/* ===== 読み書きの 道具 ===== */
/* シートが 無ければ その場で 作る（新しい 版で シートが ふえた 時、setup を し忘れても 止まらない） */
function sheet_(n){
  var ss = SpreadsheetApp.getActive();
  if(!ss) throw new Error('NO_SPREADSHEET：スプレッドシートの「拡張機能 → Apps Script」から 作った スクリプトに 貼ってください（単独の スクリプトでは 動きません）');
  var sh = ss.getSheetByName(n);
  if(!sh){ sh = ss.insertSheet(n); sh.getRange(1, 1, 1, HEAD[n].length).setValues([HEAD[n]]); textFormat_(n, sh); }
  return sh;
}
/* エディタで 実行：動かない 時の 原因を ログに 出す（実行ログで 見る） */
function selfCheck(){
  var out = [], ss = SpreadsheetApp.getActive();
  out.push('スプレッドシートに つながっているか：' + (ss ? 'はい（' + ss.getName() + '）' : 'いいえ ← 拡張機能 → Apps Script から 作り直す'));
  if(ss) Object.keys(HEAD).forEach(function(n){
    var sh = ss.getSheetByName(n);
    out.push('シート ' + n + '：' + (sh ? (sh.getLastRow() - 1) + '行' : 'ない（開いた 時に 自動で 作ります）'));
  });
  if(ss){
    var sp = 0, ro = 0; try{ sp = spots_().length; ro = rows_(SH.roster).filter(function(r){ return r[0] !== ''; }).length; }catch(e){}
    if(!ro) out.push('⚠ 名簿が 空です（児童は 開けません）');
    if(!sp) out.push('⚠ スポットが 空です（班が ありません）');
  }
  out.push('版：' + PropertiesService.getScriptProperties().getProperty('ver'));
  try{ out.push('公開 URL：' + ScriptApp.getService().getUrl()); }catch(e){ out.push('公開 URL：まだ ありません（デプロイ → ウェブアプリ）'); }
  try{ out.push('開いた人の メール（エディタで 実行した 時は 先生）：' + Session.getActiveUser().getEmail()); }catch(e){}
  Logger.log(out.join('\n'));
  return out.join('\n');
}
/* 班（1-1 など）や id を 入れる 列。スプレッドシートは「1-1」を 日付に、「12」を 数に 自動で 変えるので、
   この 列だけ 書式を 文字（@）に する。シート全体を 文字に すると 削除の 印（false）が 文字の "FALSE" に なり、消えた 扱いに なるので しない */
var TEXT_COLS = {items:[1, 2, 3], stars:[1, 2, 3, 4, 7], comments:[1, 2, 3, 4], modes:[1]};
function textFormat_(n, sh){
  (TEXT_COLS[n] || []).forEach(function(c){ sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@'); });
}
/* いまの シートにも 1回だけ 書式を かける（版を 上げた 時、setup を し忘れても 効く） */
function ensureFormat_(){
  if(cache_().get('fmt1')) return;
  var pr = props_();
  if(!pr.getProperty('fmt1')){ Object.keys(TEXT_COLS).forEach(function(n){ textFormat_(n, sheet_(n)); }); pr.setProperty('fmt1', '1'); }
  cache_().put('fmt1', '1', 21600);
}
/* すでに 日付に 変わってしまった 値を「1-1」に もどして 読む */
function fixText_(v, tz){
  if(Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, tz, 'M-d');
  return v;
}
function rows_(n){
  var sh = sheet_(n), last = sh.getLastRow();
  if(last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, HEAD[n].length).getValues(), cols = TEXT_COLS[n];
  if(cols){
    var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
    vals.forEach(function(r){ cols.forEach(function(c){ r[c - 1] = fixText_(r[c - 1], tz); }); });
  }
  return vals;
}
function low_(s){ return String(s || '').trim().toLowerCase(); }
function props_(){ return PropertiesService.getScriptProperties(); }
function cache_(){ return CacheService.getScriptCache(); }
function getVer_(){
  var c = cache_().get('ver');
  if(c !== null && c !== undefined) return Number(c);
  var v = Number(props_().getProperty('ver') || 0);
  cache_().put('ver', String(v), 21600);
  return v;
}
/* 班ごとの 版。キャッシュが 消えていたら 学年の 版を 返す（読み直しが 起きるだけで 正しさは 保つ） */
function teamVer_(t){
  var c = cache_().get('tv:' + t);
  return c === null || c === undefined ? getVer_() : Number(c);
}
function setVer_(v){ props_().setProperty('ver', String(v)); cache_().put('ver', String(v), 21600); }
/* モード・回の 版：変えたら 上がる。児童は ふだんの 確認で これを 見て、変わった 時だけ モードを 受け取る（ページの 開き直しは いらない） */
function getMver_(){
  var c = cache_().get('mver');
  if(c !== null && c !== undefined) return String(c);
  var v = String(props_().getProperty('mver') || '0'); cache_().put('mver', v, 21600); return v;
}
function setMver_(v){ props_().setProperty('mver', String(v)); cache_().put('mver', String(v), 21600); }
/* 付箋 → 班・面 を キャッシュで 引く（シールの 書き込みで 付箋の シート全体を 読まないため）。なければ 1回だけ シートを 読んで 覚える */
function itemTeams_(ids){
  var out = {}, keys = ids.map(function(id){ return 'it:' + id; }), got = cache_().getAll(keys) || {}, miss = false;
  ids.forEach(function(id){ var c = got['it:' + id]; if(c){ var p = c.split('|'); out[id] = {team:p[0], face:p[1]}; } else miss = true; });
  if(miss){
    var put = {};
    rows_(SH.items).forEach(function(r){ var id = String(r[0]); if(!id || r[5]) return; out[id] = out[id] || {team:String(r[1]), face:String(r[2])}; put['it:' + id] = String(r[1]) + '|' + String(r[2]); });
    try{ cache_().putAll(put, 21600); }catch(e){}
  }
  return out;
}

/* ===== だれか ===== */
function who_(){
  var email = low_(Session.getActiveUser().getEmail());
  if(!email) throw new Error('NO_EMAIL：アカウントが 読めません。先生に 伝えてください');
  var k = 'who:' + email, c = cache_().get(k);
  if(c) return JSON.parse(c);
  var u = null;
  rows_(SH.teachers).forEach(function(r){ if(!u && low_(r[0]) === email) u = {id:email, role:'teacher', cls:String(r[1] || '').trim()}; });
  if(!u) rows_(SH.roster).forEach(function(r){
    if(!u && low_(r[0]) === email){ var cls = String(r[1]).trim(); u = {id:email, role:'child', cls:cls, team:cls + '-' + Number(r[2]), no:Number(r[3])}; }
  });
  if(!u && email.slice(-TEACHER_DOMAIN.length) === TEACHER_DOMAIN) u = {id:email, role:'teacher', cls:''};
  if(!u) throw new Error('NOT_IN_ROSTER：名簿に ありません（' + email + '）');
  cache_().put(k, JSON.stringify(u), 600);
  return u;
}
function spots_(){
  return rows_(SH.spots).filter(function(r){ return r[0] !== '' && r[1] !== ''; }).map(function(r){
    var cls = String(r[0]).trim(), no = Number(r[1]);
    return {team:cls + '-' + no, cls:cls, no:no, name:String(r[2])};
  });
}
/* 班の 中の 番号順（いいねの 色・形）。メール → {team, slot, no} */
function slots_(){
  var c = cache_().get('slots'); if(c) return JSON.parse(c);
  var by = {};
  rows_(SH.roster).forEach(function(r){ if(r[0] === '') return; var t = String(r[1]).trim() + '-' + Number(r[2]); (by[t] = by[t] || []).push({id:low_(r[0]), no:Number(r[3])}); });
  var m = {};
  Object.keys(by).forEach(function(t){ by[t].sort(function(a, b){ return a.no - b.no; }).forEach(function(x, i){ m[x.id] = {team:t, slot:i, no:x.no}; }); });
  cache_().put('slots', JSON.stringify(m), 21600);
  return m;
}
function blankModes_(){ return {view:'off', propose:'off', starIn:false, starOut:'off', round:1}; }
function roundOf_(modes, team){ return Number((modes[clsOf_(team)] || {}).round) || 1; }
function modes_(){
  var c = cache_().get('modes');
  if(c) return JSON.parse(c);
  var m = {};
  spots_().forEach(function(s){ if(!m[s.cls]) m[s.cls] = blankModes_(); });
  rows_(SH.modes).forEach(function(r){ if(r[0] !== ''){ try{ m[String(r[0]).trim()] = JSON.parse(r[1]); }catch(e){} } });
  cache_().put('modes', JSON.stringify(m), 21600);
  return m;
}
function clsOf_(team){ return String(team).split('-')[0]; }
function reach_(u, modes, key, team){
  var v = (modes[u.cls] || blankModes_())[key];
  return v === 'grade' || (v === 'class' && clsOf_(team) === u.cls);
}
/* 児童に その行を 見せるか */
function visible_(u, modes, team, face, showcase){
  if(u.role === 'teacher' || team === u.team) return true;
  if(face === 'front') return reach_(u, modes, 'view', team) || (!!showcase && reach_(u, modes, 'starOut', team));
  if(face === 'gift') return reach_(u, modes, 'propose', team);
  return false;
}
/* シールを 貼った人は 本人以外には 記号にする */
function anon_(viewer){
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, 'toi:' + viewer);
  return 'o' + d.slice(0, 5).map(function(b){ return ((b + 256) % 256).toString(16); }).join('');
}

/* ===== 整理役（班に 1人・5分） =====
   付箋を 動かす・枠を 置く／大きさを 変える／動かす のは 整理役だけ。
   2人に なるくらいなら だれも いない ほうが よい ので、決めるのは ロックの 中だけ、確かでない 時は「いない」に 倒す */
var ORG_MS = 5 * 60 * 1000;
function orgGet_(teams){
  var now = Date.now(), out = {};
  if(!teams.length) return out;
  var got = cache_().getAll(teams.map(function(t){ return 'org:' + t; })) || {};
  teams.forEach(function(t){
    var c = got['org:' + t]; if(!c) return;
    try{ var o = JSON.parse(c); if(o && o.until > now) out[t] = o; }catch(e){}
  });
  return out;
}
function orgPut_(team, o){
  if(o) cache_().put('org:' + team, JSON.stringify(o), Math.ceil((o.until - Date.now()) / 1000) + 5);
  else cache_().remove('org:' + team);
}
/* 児童に 見せる 形：自分か どうか と 番号 と のこり（メールは 出さない） */
function orgView_(u, m){
  var out = {}, now = Date.now();
  Object.keys(m).forEach(function(t){ var o = m[t]; out[t] = {mine:o.id === u.id, no:o.no, left:o.until - now, by:o.by || ''}; });
  return out;
}
function isOrg_(u){ var o = orgGet_([u.team])[u.team]; return !!(o && o.id === u.id); }
/* 児童：「整理する」（先着）／「おわる」 */
function orgClaim(){
  var u = who_(); if(u.role !== 'child') throw new Error('NOT_CHILD');
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try{
    var cur = orgGet_([u.team])[u.team];
    if(cur && cur.id !== u.id) return {ok:false, org:orgView_(u, mapOf_(u.team, cur))};
    var o = {id:u.id, no:u.no, until:Date.now() + ORG_MS};
    orgPut_(u.team, o);
    return {ok:true, org:orgView_(u, mapOf_(u.team, o))};
  } finally { lock.releaseLock(); }
}
function orgRelease(){
  var u = who_(); var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try{ var cur = orgGet_([u.team])[u.team]; if(cur && cur.id === u.id) orgPut_(u.team, null); return {ok:true, org:{}}; }
  finally { lock.releaseLock(); }
}
/* 先生：班の 整理役を 決める（番号）／はずす（no を 空に） */
function orgSet(team, no){
  var u = who_(); if(u.role !== 'teacher') throw new Error('NOT_TEACHER');
  team = String(team);
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try{
    if(!no){ orgPut_(team, null); return {ok:true}; }
    var sl = slots_(), id = Object.keys(sl).filter(function(k){ return sl[k].team === team && sl[k].no === Number(no); })[0];
    if(!id) return {ok:false};
    orgPut_(team, {id:id, no:Number(no), until:Date.now() + ORG_MS, by:'先生'});
    return {ok:true};
  } finally { lock.releaseLock(); }
}

/* ===== 画面から 呼ぶ ===== */
/* 開いた時に 1回。モードも ここで 渡す（モードを 変えたら 先生の 合図で 児童が ページを 更新する） */
function boot(){
  var u = who_();
  ensureFormat_();
  var roster = u.role === 'teacher'
    ? rows_(SH.roster).filter(function(r){ return r[0] !== ''; }).map(function(r){ var cls = String(r[1]).trim(); return {id:low_(r[0]), cls:cls, team:cls + '-' + Number(r[2]), no:Number(r[3])}; })
    : [{id:u.id, cls:u.cls, team:u.team, no:u.no}];
  var p;
  if(u.role === 'teacher'){ var v = getVer_(); p = pull_(u, 0); p.all = v; }
  else {
    // シール（班の外）が 入っていれば、範囲の 班の「見てほしい付箋」も 開いた時に 1回だけ 取る
    var tv = {}, spec = mapOf_(u.team, 0), modes = modes_();
    tv[u.team] = teamVer_(u.team);
    spots_().forEach(function(s){ if(s.team !== u.team && reach_(u, modes, 'starOut', s.team)) spec[s.team] = 0; });
    p = pull_(u, spec); p.tv = tv;
  }
  if(u.role === 'child'){
    var sl = slots_(); u.mates = Object.keys(sl).filter(function(k){ return sl[k].team === u.team; }).map(function(k){ return {slot:sl[k].slot, no:sl[k].no, id:k === u.id ? u.id : 'm' + sl[k].slot}; }).sort(function(a, b){ return a.slot - b.slot; });
  }
  p.mver = getMver_();
  p.org = orgView_(u, orgGet_(u.role === 'teacher' ? spots_().map(function(s){ return s.team; }) : [u.team]));
  p.api = API_VER; p.trialUrl = (function(){ try{ return ScriptApp.getService().getUrl() + '?trial=1'; }catch(e){ return ''; } })(); p.me = u; p.spots = spots_(); p.roster = roster; p.modes = modes_();
  return p;
}
function mapOf_(t, v){ var m = {}; m[t] = v; return m; }

/* 約10秒ごとの 確認。児童は 自分の班（と 今 見ている 班）の 版だけを 確かめる。
   どれも 同じなら シートを 読まずに {same:true} を 返す。
   req = 児童 {teams:{'A-1':版, 'B-3':版}}／先生 {all:版} */
function poll(req){
  var u = who_(); req = req || {};
  if(u.role === 'teacher'){
    var v = getVer_(), since = Number(req.all || 0);
    var orgT = orgView_(u, orgGet_(spots_().map(function(s){ return s.team; })));
    if(since && v === since) return {same:true, org:orgT};
    var p = pull_(u, since); p.all = v; p.mver = getMver_(); p.org = orgT; return p;
  }
  var mv = getMver_(), extra = req.mv !== undefined && String(req.mv) !== mv ? {modes:modes_(), mver:mv} : null;
  var teams = req.teams || {}, names = Object.keys(teams).slice(0, 30), want = {}, cur = {}, changed = false;
  var got = names.length ? (cache_().getAll(names.map(function(t){ return 'tv:' + t; })) || {}) : {}, gv = null;
  names.forEach(function(t){
    var c0 = got['tv:' + t], c = c0 === null || c0 === undefined ? (gv === null ? (gv = getVer_()) : gv) : Number(c0), since = Number(teams[t] || 0);
    cur[t] = c;
    if(!since || c > since){ want[t] = since; changed = true; }
  });
  var orgC = orgView_(u, orgGet_([u.team]));
  if(!changed){ var s0 = {same:true, org:orgC}; if(extra){ s0.same = false; s0.items = []; s0.stars = []; s0.comments = []; s0.fullTeams = []; s0.modes = extra.modes; s0.mver = extra.mver; s0.tv = cur; } return s0; }
  var q = pull_(u, want); q.tv = cur; q.org = orgC; if(extra){ q.modes = extra.modes; q.mver = extra.mver; } return q;
}

/* spec：数（学年全部を その版より 新しい分）または {班:版}（その班だけ） */
function pull_(u, spec){
  var modes = modes_(), items = [], stars = [], fullTeams = [];
  function sinceOf(team){ return typeof spec === 'number' ? spec : (team in spec ? Number(spec[team]) : null); }
  if(typeof spec !== 'number') Object.keys(spec).forEach(function(t){ if(!Number(spec[t])) fullTeams.push(t); });
  rows_(SH.items).forEach(function(r){
    var id = String(r[0]), team = String(r[1]), ver = Number(r[4]), since = sinceOf(team);
    if(!id || since === null || ver <= since) return;
    var x = null; try{ x = JSON.parse(r[3]); }catch(e){}
    var ok = x && !r[5] && visible_(u, modes, team, String(r[2]), x.showcase);
    if(!ok){ if(since) items.push({id:id, del:true}); return; }
    if(u.role !== 'teacher') delete x.author;
    items.push(x);
  });
  rows_(SH.stars).forEach(function(r){
    var ver = Number(r[5]), team = String(r[2]), viewer = low_(r[3]), since = sinceOf(team);
    if(!r[0] || since === null || ver <= since) return;
    if(!(u.role === 'teacher' || viewer === u.id || team === u.team)) return;
    var o = {noteId:String(r[1]), k:String(r[6] || 'star'), rd:r[8] === '' || r[8] == null ? 1 : Number(r[8]), viewer:(u.role === 'teacher' || viewer === u.id) ? viewer : anon_(viewer), on:!!r[4]};
    if(o.k === 'thumb' && (u.role === 'teacher' || team === u.team)){ var sv = slots_()[viewer]; if(sv) o.slot = sv.slot; }
    if(viewer === u.id && r[7]){ try{ var pos = JSON.parse(r[7]); o.x = pos.x; o.y = pos.y; o.r = pos.r; }catch(e){} }
    stars.push(o);
  });
  var comments = [];
  rows_(SH.comments).forEach(function(r){
    var ver = Number(r[6]), team = String(r[2]), viewer = low_(r[3]), since = sinceOf(team);
    if(!r[0] || since === null || ver <= since) return;
    if(!(u.role === 'teacher' || viewer === u.id || team === u.team)) return;
    comments.push({noteId:String(r[1]), viewer:(u.role === 'teacher' || viewer === u.id) ? viewer : anon_(viewer), text:String(r[4] || ''), on:!!r[5]});
  });
  return {full:spec === 0, fullTeams:fullTeams, items:items, stars:stars, comments:comments};
}

/* 変更を 書く。ops = {up:[付箋など], del:[id], star:[{noteId,on}], modes:{cls,m}} */
function apply(ops){
  var u = who_(), lock = LockService.getScriptLock();
  ensureFormat_();
  lock.waitLock(20000);
  try{
    var v = getVer_() + 1, now = new Date(), modes = modes_(), rejected = [];
    var needItems = (ops.up && ops.up.length) || (ops.del && ops.del.length) || (ops.purge && ops.purge.length);
    var ish = needItems ? sheet_(SH.items) : null, irows = needItems ? rows_(SH.items) : [], index = {}, itput = {};
    irows.forEach(function(r, i){ index[String(r[0])] = i; });
    var appends = [], touched = false, teams = {}, purged = {};

    /* 見てほしい付箋が 多すぎないか（この 書きこみで ふえる 時だけ 数える） */
    function tooManyShow(id, team, o, old){
      var rd = roundOf_(modes, team), now0 = o.showcase === true ? 1 : Number(o.showcase) || 0, was0 = old ? (old.showcase === true ? 1 : Number(old.showcase) || 0) : 0;
      if(now0 !== rd || was0 === rd) return false;
      var n = 0;
      irows.forEach(function(r){ if(r[5] || String(r[1]) !== team || String(r[0]) === id) return; var q = null; try{ q = JSON.parse(r[3]); }catch(e){} if(q && (q.showcase === true ? 1 : Number(q.showcase) || 0) === rd && q.face === 'front') n++; });
      return n >= SHOW_PER_TEAM;
    }
    function writeRow(id, row){
      if(index[id] !== undefined){ ish.getRange(index[id] + 2, 1, 1, row.length).setValues([row]); irows[index[id]] = row; }
      else { appends.push(row); index[id] = -1; }
      touched = true; teams[row[1]] = 1;
      itput['it:' + id] = row[5] ? 'x|trash' : String(row[1]) + '|' + String(row[2]);
    }

    var KEEP = ['id', 'team', 'author', 'fromTeam'];  // 変わった 項目として 送られても 変えない
    var ARRANGE = ['x', 'y', 'w', 'h', 'stackOf', 'lp'], orgOk = null;
    function canArrange(){ if(orgOk === null) orgOk = u.role === 'child' && isOrg_(u); return orgOk; }
    (ops.up || []).forEach(guard_(rejected, function(x){ return String(x && x.id || ''); }, function(x){
      var id = String(x && x.id || '');
      if(x && x.p && typeof x.p === 'object'){
        // 変わった 項目だけ：いまの 付箋に 重ねる（ほかの 項目は さわらない）
        var ri = index[id], er = ri !== undefined && ri >= 0 ? irows[ri] : null;
        if(!er || er[5] || u.role !== 'child' || String(er[1]) !== u.team){ rejected.push(id); return; }
        var cur = null; try{ cur = JSON.parse(er[3]); }catch(e){}
        if(!cur){ rejected.push(id); return; }
        var moves = Object.keys(x.p).concat(x.u || []).some(function(k){ return ARRANGE.indexOf(k) >= 0; });
        if(moves && !canArrange() && !(cur.face === 'trash' || x.p.face)){ rejected.push(id); return; }
        Object.keys(x.p).forEach(function(k){ if(KEEP.indexOf(k) < 0) cur[k] = x.p[k]; });
        (x.u || []).forEach(function(k){ if(KEEP.indexOf(k) < 0) delete cur[k]; });
        if(KINDS.indexOf(cur.kind) < 0 || FACE_KEYS.indexOf(cur.face) < 0){ rejected.push(id); return; }
        var before0 = null; try{ before0 = JSON.parse(er[3]); }catch(e){}
        if(tooManyShow(id, String(er[1]), cur, before0)){ rejected.push(id); return; }
        writeRow(id, [id, cur.team, cur.face, cleanItem_(cur), v, false, u.id, now]);
        return;
      }
      if(!id || u.role !== 'child' || KINDS.indexOf(x.kind) < 0 || FACE_KEYS.indexOf(x.face) < 0){ rejected.push(id); return; }
      var ex = index[id] !== undefined && index[id] >= 0 ? irows[index[id]] : null;
      var old = null; if(ex){ try{ old = JSON.parse(ex[3]); }catch(e){} }
      if(ex && !ex[5]){
        // 自分の班の物だけ 直せる。ほかの班へ 移すことは できない
        if(String(ex[1]) !== u.team || x.team !== u.team){ rejected.push(id); return; }
        x.author = old && old.author || u.id;
        if(old && old.fromTeam) x.fromTeam = old.fromTeam; else delete x.fromTeam;
      } else if(ex && ex[5]){
        // 消した 付箋を もどす（やり直し）：同じ班で、先生が 完全に 消した ものでは ない 時だけ
        if(String(ex[1]) !== u.team || x.team !== u.team || (old && old.purged)){ rejected.push(id); return; }
        x.author = old && old.author || u.id;
        if(old && old.fromTeam) x.fromTeam = old.fromTeam; else delete x.fromTeam;
      } else if(x.team === u.team){
        if(x.face === 'gift'){ rejected.push(id); return; }
        if(x.kind === 'frame' && !canArrange()){ rejected.push(id); return; }
        x.author = u.id; delete x.fromTeam;
      } else {
        // アイデア提案：ほかの班の いただきものへ 付箋を 1まい 置くだけ
        if(x.kind !== 'note' || x.face !== 'gift' || !reach_(u, modes, 'propose', x.team)){ rejected.push(id); return; }
        x.author = u.id; x.fromTeam = u.team;
      }
      if(x.team === u.team && tooManyShow(id, x.team, x, old)){ rejected.push(id); return; }
      writeRow(id, [id, x.team, x.face, cleanItem_(x), v, false, u.id, now]);
    }));

    (ops.del || []).forEach(guard_(rejected, function(x){ return String(x); }, function(id){
      id = String(id);
      var i = index[id];
      if(i === undefined || i < 0 || u.role !== 'child' || String(irows[i][1]) !== u.team){ rejected.push(id); return; }
      if(String(irows[i][3]).indexOf('"kind":"frame"') >= 0 && !canArrange()){ rejected.push(id); return; }
      var r = irows[i].slice(); r[4] = v; r[5] = true; r[6] = u.id; r[7] = now;
      writeRow(id, r);
    }));
    (ops.purge || []).forEach(guard_(rejected, function(x){ return '!' + String(x); }, function(id){
      id = String(id);
      var i = index[id];
      if(u.role !== 'teacher' || i === undefined || i < 0){ rejected.push('!' + id); return; }
      var r0 = irows[i], o0 = {}; try{ o0 = JSON.parse(r0[3]); }catch(e){}
      writeRow(id, [id, r0[1], r0[2], JSON.stringify({id:id, kind:o0.kind || 'note', team:String(r0[1]), face:String(r0[2]), purged:true}), v, true, u.id, now]);
      // 重なっていた 付箋は 単独に もどし、つながる 矢印は 消す
      irows.forEach(function(r, j){
        if(r[5]) return;
        var o = null; try{ o = JSON.parse(r[3]); }catch(e){} if(!o) return;
        if(o.stackOf === id){ delete o.stackOf; writeRow(String(r[0]), [r[0], r[1], r[2], JSON.stringify(o), v, false, u.id, now]); }
        else if(o.kind === 'arrow' && (o.from === id || o.to === id)){ var d = r.slice(); d[4] = v; d[5] = true; d[6] = u.id; d[7] = now; writeRow(String(r[0]), d); }
      });
      purged[id] = 1;
    }));
    if(appends.length) ish.getRange(ish.getLastRow() + 1, 1, appends.length, appends[0].length).setValues(appends);

    if(ops.star && ops.star.length){
      var ssh = sheet_(SH.stars), srows = rows_(SH.stars), sidx = {}, sapp = [];
      var have = {};  // 班|種類 → 自分が 貼っている 枚数
      srows.forEach(function(r, i){
        sidx[String(r[0])] = i;
        var hk0 = r[2] + '|' + (r[6] || 'star') + '|' + (r[8] === '' || r[8] == null ? 1 : Number(r[8]));
        if(low_(r[3]) === u.id && r[4]) have[hk0] = (have[hk0] || 0) + 1;
      });
      // 書いたばかりの 行も 含めて 付箋の班を 引く
      if(Object.keys(itput).length){ try{ cache_().putAll(itput, 21600); }catch(e){} itput = {}; }
      var teamOf = itemTeams_(ops.star.map(function(s){ return String(s.noteId); }));
      ops.star.forEach(guard_(rejected, function(x){ return '*' + String(x && x.noteId); }, function(s){
        var nId = String(s.noteId), t = teamOf[nId];
        var like = s.k === 'thumb';  // 班の中の いいね：自分の班の 付箋だけ、モード・回・持ち分は 関係ない
        var ok = u.role === 'child' && t && t.face !== 'trash' && (like ? t.team === u.team : (t.team === u.team ? !!(modes[u.cls] || {}).starIn : reach_(u, modes, 'starOut', t.team)));
        var k = STAR_KINDS.indexOf(s.k) >= 0 ? s.k : 'star';
        // 回は サーバーが 決める（その 付箋の 組の 今の 回）
        var rd = like ? 0 : (t ? roundOf_(modes, t.team) : 1);
        var key0 = nId + '|' + k + '|' + rd + '|' + u.id, was = sidx[key0] !== undefined && sidx[key0] >= 0 && !!srows[sidx[key0]][4], hk = t && (t.team + '|' + k + '|' + rd);
        if(ok && !like && s.on && !was && (have[hk] || 0) >= STAR_PER_TEAM) ok = false;
        if(!ok){ rejected.push('*' + nId + '|' + k); return; }
        if(s.on && !was) have[hk] = (have[hk] || 0) + 1;
        if(!s.on && was) have[hk] = (have[hk] || 1) - 1;
        // 貼った 場所（シール貼り画面）：% と 傾き
        var pos = s.x == null ? '' : JSON.stringify({x:clamp_(s.x, 0, 100), y:clamp_(s.y, 0, 100), r:clamp_(s.r, -30, 30)});
        var key = key0, row = [key, nId, t.team, u.id, !!s.on, v, k, pos, rd];
        if(sidx[key] !== undefined) ssh.getRange(sidx[key] + 2, 1, 1, row.length).setValues([row]);
        else { sapp.push(row); sidx[key] = -1; }
        touched = true; teams[t.team] = 1;
      }));
      if(sapp.length) ssh.getRange(ssh.getLastRow() + 1, 1, sapp.length, sapp[0].length).setValues(sapp);
    }

    if(ops.cmt && ops.cmt.length){
      var csh = sheet_(SH.comments), crows = rows_(SH.comments), cidx = {}, capp = [], cteam = {};
      crows.forEach(function(r, i){ cidx[String(r[0])] = i; });
      if(Object.keys(itput).length){ try{ cache_().putAll(itput, 21600); }catch(e){} itput = {}; }
      cteam = itemTeams_(ops.cmt.map(function(c){ return String(c.noteId); }));
      ops.cmt.forEach(guard_(rejected, function(x){ return '#' + String(x && x.noteId); }, function(c){
        var nId = String(c.noteId), t = cteam[nId];
        var ok = u.role === 'child' && t && t.team !== u.team && t.face !== 'trash' && reach_(u, modes, 'starOut', t.team);
        if(!ok){ rejected.push('#' + nId); return; }
        var key = nId + '|' + u.id, row = [key, nId, t.team, u.id, String(c.text || '').slice(0, 100), !!c.on && !!String(c.text || '').trim(), v];
        if(cidx[key] !== undefined && cidx[key] >= 0) csh.getRange(cidx[key] + 2, 1, 1, row.length).setValues([row]);
        else { capp.push(row); cidx[key] = -1; }
        touched = true; teams[t.team] = 1;
      }));
      if(capp.length) csh.getRange(csh.getLastRow() + 1, 1, capp.length, capp[0].length).setValues(capp);
    }

    if(ops.cmtDel && ops.cmtDel.length){
      if(u.role !== 'teacher') rejected.push('cmtDel');
      else {
        var dsh = sheet_(SH.comments), drows = rows_(SH.comments);
        ops.cmtDel.forEach(guard_(rejected, function(x){ return '#' + String(x && x.noteId); }, function(c){
          drows.forEach(function(r, j){
            if(String(r[1]) !== String(c.noteId) || low_(r[3]) !== low_(c.viewer) || !r[5]) return;
            var row = r.slice(); row[4] = ''; row[5] = false; row[6] = v;
            dsh.getRange(j + 2, 1, 1, row.length).setValues([row]); teams[String(r[2])] = 1; touched = true;
          });
        }));
      }
    }

    if(Object.keys(purged).length){
      [[SH.stars, 1, 4, 5], [SH.comments, 1, 5, 6]].forEach(function(t){
        var sh = sheet_(t[0]), rs = rows_(t[0]);
        rs.forEach(function(r, j){
          if(!purged[String(r[t[1]])] || !r[t[2]]) return;
          var row = r.slice(); row[t[2]] = false; row[t[3]] = v; if(t[0] === SH.comments) row[4] = '';
          sh.getRange(j + 2, 1, 1, row.length).setValues([row]); teams[String(r[2])] = 1; touched = true;
        });
      });
    }

    if(ops.modes){
      var cls = String(ops.modes.cls || ''), m = ops.modes.m || {};
      if(u.role !== 'teacher' || !modes[cls]) rejected.push('modes');
      else {
        var clean = {
          view:SCOPE_KEYS.indexOf(m.view) >= 0 ? m.view : 'off',
          propose:SCOPE_KEYS.indexOf(m.propose) >= 0 ? m.propose : 'off',
          starIn:!!m.starIn,
          starOut:SCOPE_KEYS.indexOf(m.starOut) >= 0 ? m.starOut : 'off',
          round:Math.max(1, Math.min(20, Math.floor(Number(m.round) || 1)))
        };
        var msh = sheet_(SH.modes), mrows = rows_(SH.modes), at = -1;
        mrows.forEach(function(r, i){ if(String(r[0]).trim() === cls) at = i; });
        var mrow = [cls, JSON.stringify(clean), v];
        if(at >= 0) msh.getRange(at + 2, 1, 1, 3).setValues([mrow]); else msh.getRange(msh.getLastRow() + 1, 1, 1, 3).setValues([mrow]);
        cache_().remove('modes'); setMver_(String(v));
        touched = true;
      }
    }

    if(Object.keys(itput).length){ try{ cache_().putAll(itput, 21600); }catch(e){} }
    if(touched){
      SpreadsheetApp.flush(); setVer_(v);
      var tv = {}; Object.keys(teams).forEach(function(t){ tv['tv:' + t] = String(v); });
      cache_().putAll(tv, 21600);
    }
    return {rejected:rejected};
  } finally {
    lock.releaseLock();
  }
}

/* 1つの 書きこみで 失敗しても、その 1つだけ はねて 残りは 進める（1つの 変な 付箋で ずっと 保存できなくなるのを 防ぐ） */
function guard_(rejected, keyOf, fn){
  return function(x){ try{ fn(x); }catch(e){ rejected.push(keyOf(x)); } };
}
/* 付箋の 中身の 長さを 制限する（セルの 上限 5万字を こえて 書きこみが 止まるのを 防ぐ） */
function cleanItem_(o){
  if(typeof o.text === 'string') o.text = o.text.slice(0, o.kind === 'frame' ? 40 : 200);
  if(typeof o.doneBy === 'string') o.doneBy = o.doneBy.slice(0, 40);
  Object.keys(o).forEach(function(k){ if(typeof o[k] === 'string' && o[k].length > 400) o[k] = o[k].slice(0, 400); });
  var j = JSON.stringify(o);
  if(j.length > 4000) throw new Error('TOO_BIG');
  return j;
}
function clamp_(v, a, b){ v = Number(v); return isNaN(v) ? a : Math.max(a, Math.min(b, v)); }

/* 名簿・先生・スポットを 直したら 実行（覚えを 消す） */
function clearWhoCache(){
  var keys = rows_(SH.roster).concat(rows_(SH.teachers)).map(function(r){ return 'who:' + low_(r[0]); });
  cache_().removeAll(keys.concat(['modes', 'slots']));
}
