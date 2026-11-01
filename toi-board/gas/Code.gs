/* といボード GAS版 サーバー
   学年で 1つの スプレッドシートに 紐づけて 使う（拡張機能 → Apps Script）。
   画面は Index.html（build.cjs で ../index.html から 作る。手で 直さない）。 */

var API_VER = 5;
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
var STAR_PER_TEAM = 2;  // 1人が 1つの班に 貼れるのは 種類ごとに 2まいまで

function doGet(){
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('といボード')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* 最初に 1回 実行：シートと 見出しを 作る */
function setup(){
  var ss = SpreadsheetApp.getActive();
  Object.keys(HEAD).forEach(function(n){
    var sh = ss.getSheetByName(n) || ss.insertSheet(n);
    if(sh.getLastRow() === 0) sh.getRange(1, 1, 1, HEAD[n].length).setValues([HEAD[n]]);
  });
  PropertiesService.getScriptProperties().setProperties({ver:'0'});
}

/* ===== 読み書きの 道具 ===== */
function sheet_(n){ return SpreadsheetApp.getActive().getSheetByName(n); }
function rows_(n){
  var sh = sheet_(n), last = sh.getLastRow();
  return last < 2 ? [] : sh.getRange(2, 1, last - 1, HEAD[n].length).getValues();
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

/* ===== 画面から 呼ぶ ===== */
/* 開いた時に 1回。モードも ここで 渡す（モードを 変えたら 先生の 合図で 児童が ページを 更新する） */
function boot(){
  var u = who_();
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
  p.api = API_VER; p.me = u; p.spots = spots_(); p.roster = roster; p.modes = modes_();
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
    if(since && v === since) return {same:true};
    var p = pull_(u, since); p.all = v; return p;
  }
  var teams = req.teams || {}, want = {}, cur = {}, changed = false;
  Object.keys(teams).slice(0, 2).forEach(function(t){
    var c = teamVer_(t), since = Number(teams[t] || 0);
    cur[t] = c;
    if(!since || c > since){ want[t] = since; changed = true; }
  });
  if(!changed) return {same:true};
  var q = pull_(u, want); q.tv = cur; return q;
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
    var o = {noteId:String(r[1]), k:String(r[6] || 'star'), rd:Number(r[8]) || 1, viewer:(u.role === 'teacher' || viewer === u.id) ? viewer : anon_(viewer), on:!!r[4]};
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
  lock.waitLock(20000);
  try{
    var v = getVer_() + 1, now = new Date(), modes = modes_(), rejected = [];
    var ish = sheet_(SH.items), irows = rows_(SH.items), index = {};
    irows.forEach(function(r, i){ index[String(r[0])] = i; });
    var appends = [], touched = false, teams = {};

    function writeRow(id, row){
      if(index[id] !== undefined){ ish.getRange(index[id] + 2, 1, 1, row.length).setValues([row]); irows[index[id]] = row; }
      else { appends.push(row); index[id] = -1; }
      touched = true; teams[row[1]] = 1;
    }

    (ops.up || []).forEach(function(x){
      var id = String(x && x.id || '');
      if(!id || u.role !== 'child' || KINDS.indexOf(x.kind) < 0 || FACE_KEYS.indexOf(x.face) < 0){ rejected.push(id); return; }
      var ex = index[id] !== undefined && index[id] >= 0 ? irows[index[id]] : null;
      var old = null; if(ex){ try{ old = JSON.parse(ex[3]); }catch(e){} }
      if(ex && !ex[5]){
        // 自分の班の物だけ 直せる。ほかの班へ 移すことは できない
        if(String(ex[1]) !== u.team || x.team !== u.team){ rejected.push(id); return; }
        x.author = old && old.author || u.id;
        if(old && old.fromTeam) x.fromTeam = old.fromTeam; else delete x.fromTeam;
      } else if(ex && ex[5]){
        rejected.push(id); return;
      } else if(x.team === u.team){
        if(x.face === 'gift'){ rejected.push(id); return; }
        x.author = u.id; delete x.fromTeam;
      } else {
        // アイデア提案：ほかの班の いただきものへ 付箋を 1まい 置くだけ
        if(x.kind !== 'note' || x.face !== 'gift' || !reach_(u, modes, 'propose', x.team)){ rejected.push(id); return; }
        x.author = u.id; x.fromTeam = u.team;
      }
      if(typeof x.text === 'string') x.text = x.text.slice(0, 200);
      writeRow(id, [id, x.team, x.face, JSON.stringify(x), v, false, u.id, now]);
    });

    (ops.del || []).forEach(function(id){
      id = String(id);
      var i = index[id];
      if(i === undefined || i < 0 || u.role !== 'child' || String(irows[i][1]) !== u.team){ rejected.push(id); return; }
      var r = irows[i].slice(); r[4] = v; r[5] = true; r[6] = u.id; r[7] = now;
      writeRow(id, r);
    });
    if(appends.length) ish.getRange(ish.getLastRow() + 1, 1, appends.length, appends[0].length).setValues(appends);

    if(ops.star && ops.star.length){
      var ssh = sheet_(SH.stars), srows = rows_(SH.stars), sidx = {}, sapp = [];
      var have = {};  // 班|種類 → 自分が 貼っている 枚数
      srows.forEach(function(r, i){
        sidx[String(r[0])] = i;
        var hk0 = r[2] + '|' + (r[6] || 'star') + '|' + (Number(r[8]) || 1);
        if(low_(r[3]) === u.id && r[4]) have[hk0] = (have[hk0] || 0) + 1;
      });
      // 書いたばかりの 行も 含めて 付箋の班を 引く
      var teamOf = {};
      rows_(SH.items).forEach(function(r){ if(!r[5]) teamOf[String(r[0])] = {team:String(r[1]), face:String(r[2])}; });
      ops.star.forEach(function(s){
        var nId = String(s.noteId), t = teamOf[nId];
        var ok = u.role === 'child' && t && t.face !== 'trash' && (t.team === u.team ? !!(modes[u.cls] || {}).starIn : reach_(u, modes, 'starOut', t.team));
        var k = STAR_KINDS.indexOf(s.k) >= 0 ? s.k : 'star';
        // 回は サーバーが 決める（その 付箋の 組の 今の 回）
        var rd = t ? roundOf_(modes, t.team) : 1;
        var key0 = nId + '|' + k + '|' + rd + '|' + u.id, was = sidx[key0] !== undefined && sidx[key0] >= 0 && !!srows[sidx[key0]][4], hk = t && (t.team + '|' + k + '|' + rd);
        if(ok && s.on && !was && (have[hk] || 0) >= STAR_PER_TEAM) ok = false;
        if(!ok){ rejected.push('*' + nId + '|' + k); return; }
        if(s.on && !was) have[hk] = (have[hk] || 0) + 1;
        if(!s.on && was) have[hk] = (have[hk] || 1) - 1;
        // 貼った 場所（シール貼り画面）：% と 傾き
        var pos = s.x == null ? '' : JSON.stringify({x:clamp_(s.x, 0, 100), y:clamp_(s.y, 0, 100), r:clamp_(s.r, -30, 30)});
        var key = key0, row = [key, nId, t.team, u.id, !!s.on, v, k, pos, rd];
        if(sidx[key] !== undefined) ssh.getRange(sidx[key] + 2, 1, 1, row.length).setValues([row]);
        else { sapp.push(row); sidx[key] = -1; }
        touched = true; teams[t.team] = 1;
      });
      if(sapp.length) ssh.getRange(ssh.getLastRow() + 1, 1, sapp.length, sapp[0].length).setValues(sapp);
    }

    if(ops.cmt && ops.cmt.length){
      var csh = sheet_(SH.comments), crows = rows_(SH.comments), cidx = {}, capp = [], cteam = {};
      crows.forEach(function(r, i){ cidx[String(r[0])] = i; });
      rows_(SH.items).forEach(function(r){ if(!r[5]) cteam[String(r[0])] = {team:String(r[1]), face:String(r[2])}; });
      ops.cmt.forEach(function(c){
        var nId = String(c.noteId), t = cteam[nId];
        var ok = u.role === 'child' && t && t.team !== u.team && t.face !== 'trash' && reach_(u, modes, 'starOut', t.team);
        if(!ok){ rejected.push('#' + nId); return; }
        var key = nId + '|' + u.id, row = [key, nId, t.team, u.id, String(c.text || '').slice(0, 100), !!c.on && !!String(c.text || '').trim(), v];
        if(cidx[key] !== undefined && cidx[key] >= 0) csh.getRange(cidx[key] + 2, 1, 1, row.length).setValues([row]);
        else { capp.push(row); cidx[key] = -1; }
        touched = true; teams[t.team] = 1;
      });
      if(capp.length) csh.getRange(csh.getLastRow() + 1, 1, capp.length, capp[0].length).setValues(capp);
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
        cache_().remove('modes');
      }
    }

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

function clamp_(v, a, b){ v = Number(v); return isNaN(v) ? a : Math.max(a, Math.min(b, v)); }

/* 名簿・先生・スポットを 直したら 実行（覚えを 消す） */
function clearWhoCache(){
  var keys = rows_(SH.roster).concat(rows_(SH.teachers)).map(function(r){ return 'who:' + low_(r[0]); });
  cache_().removeAll(keys.concat(['modes']));
}
