'PLATFORM_BEGIN';
/* GAS版の 保存。build.cjs が ../index.html の PLATFORM 区間を これに 差し替える。
   軽さを 優先：
   ・モードは 開いた時に 1回 読むだけ。変えたら 先生が「ページを 更新して」と 合図する。
   ・児童は 約10秒（±3秒）ごとに 自分の班（と 今 見ている 班）の 版だけを 確かめる。
     ほかの班で 何が 起きても、自分に 関係が なければ サーバーは シートを 読まない。
   ・書く：変更の 差分を 250ms ためて apply へ。届くまで 自分の 変更は 上書きしない（pend）。
   ・タブが 裏の 間は 確かめない。 */
var Platform = (function(){
  var POLL = window.TOI_POLL_MS || 10000, JIT = window.TOI_POLL_JIT == null ? 3000 : window.TOI_POLL_JIT;
  var role = '', own = '', watching = null, tv = {}, all = 0, got = {};
  var pend = {}, q = blank(), timer = null, busy = false, pollT = null, errs = 0, polling = false, again = false;
  function blank(){ return {up:{}, del:{}, star:{}, cmt:{}, modes:null}; }
  function empty(x){ return !Object.keys(x.up).length && !Object.keys(x.del).length && !Object.keys(x.star).length && !Object.keys(x.cmt).length && !x.modes; }
  function net(t){ var el = document.getElementById('net'); if(el) el.textContent = t; }
  function run(name, args, ok, ng){
    var r = google.script.run
      .withSuccessHandler(function(x){ errs = 0; net(''); ok(x); })
      .withFailureHandler(function(e){ errs++; net('つながりにくい ようです（' + errs + '）。そのまま つづけて だいじょうぶ'); if(ng) ng(e); });
    r[name].apply(r, args);
  }
  function schedule(ms){ clearTimeout(timer); timer = setTimeout(send, ms == null ? 250 : ms); }
  function send(){
    if(busy || empty(q)) return;
    busy = true;
    var sent = q; q = blank();
    var ops = {
      up:Object.keys(sent.up).map(function(k){ return sent.up[k]; }),
      del:Object.keys(sent.del),
      star:Object.keys(sent.star).map(function(k){ return sent.star[k]; }),
      cmt:Object.keys(sent.cmt).map(function(k){ return sent.cmt[k]; }),
      modes:sent.modes
    };
    run('apply', [ops], function(r){
      busy = false;
      Object.keys(sent.up).concat(Object.keys(sent.del)).forEach(function(id){ if(!q.up[id] && !q.del[id]) delete pend[id]; });
      Object.keys(sent.star).forEach(function(id){ if(!(id in q.star)) delete pend['*' + id]; });
      Object.keys(sent.cmt).forEach(function(id){ if(!(id in q.cmt)) delete pend['#' + id]; });
      if(r && r.rejected && r.rejected.length){
        toast('先生の モードが かわりました。ページを 更新してね');
        if(own) tv[own] = 0; if(watching) tv[watching] = 0; all = 0;
        pull();
      }
      if(!empty(q)) schedule(0);
    }, function(){
      busy = false;
      // 送れなかった 分を 戻す（あとから した 変更を 優先）
      Object.keys(sent.up).forEach(function(k){ if(!q.up[k] && !q.del[k]) q.up[k] = sent.up[k]; });
      Object.keys(sent.del).forEach(function(k){ if(!q.up[k]) q.del[k] = 1; });
      Object.keys(sent.star).forEach(function(k){ if(!(k in q.star)) q.star[k] = sent.star[k]; });
      Object.keys(sent.cmt).forEach(function(k){ if(!(k in q.cmt)) q.cmt[k] = sent.cmt[k]; });
      if(!q.modes) q.modes = sent.modes;
      schedule(Math.min(30000, 2000 * errs));
    });
  }
  function request(){
    if(role === 'teacher') return {all:all};
    var t = {}; t[own] = tv[own] || 0;
    if(watching && watching !== own) t[watching] = tv[watching] || 0;
    return {teams:t};
  }
  function pull(){
    if(polling){ again = true; return; }
    polling = true;
    run('poll', [request()], function(r){
      polling = false;
      if(!r.same){
        if(r.tv) Object.keys(r.tv).forEach(function(t){ tv[t] = r.tv[t]; got[t] = 1; });
        if(r.all) all = r.all;
        mergeRemote(r, pend);
      }
      if(again){ again = false; pull(); }
    }, function(){ polling = false; });
  }
  function loop(){
    clearTimeout(pollT);
    pollT = setTimeout(function(){ if(!document.hidden) pull(); loop(); }, Math.max(1000, POLL + (Math.random() * 2 - 1) * JIT));
  }
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) pull(); });
  return {
    demo:false,
    start:function(cb){
      run('boot', [], function(r){
        if(r.api !== API_WANT) net('版が ちがいます（画面 ' + API_WANT + '／サーバー ' + r.api + '）。先生に 伝えてください');
        role = r.me.role; own = r.me.team || ''; if(r.tv) tv = r.tv; if(r.all) all = r.all;
        cb({items:r.items.filter(function(x){ return !x.del; }), stars:r.stars.filter(function(s){ return s.on; }).map(starOf), comments:(r.comments || []).filter(function(c){ return c.on; }).map(cmtOf), modes:r.modes, roster:r.roster}, r.me.id, r.spots, r.me);
        loop();
      }, function(e){
        document.getElementById('app').innerHTML = '<p style="padding:24px;font-size:20px;font-weight:700">ひらけません：' + String(e && e.message || e).replace(/[<>&]/g, '') + '</p>';
      });
    },
    push:function(ops){
      if(!ops) return;
      ops.up.forEach(function(x){ q.up[x.id] = x; delete q.del[x.id]; pend[x.id] = 1; });
      ops.del.forEach(function(id){ delete q.up[id]; q.del[id] = 1; pend[id] = 1; });
      ops.star.forEach(function(s){ var key = s.noteId + '|' + s.k; q.star[key] = s; pend['*' + key] = 1; });
      (ops.cmt || []).forEach(function(c){ q.cmt[c.noteId] = c; pend['#' + c.noteId] = 1; });
      if(ops.modes) q.modes = ops.modes;
      schedule();
    },
    /* ほかの班を 開いた時だけ その班を 取りに行く（児童） */
    watch:function(team){
      if(role === 'teacher') return;
      watching = team && team !== own ? team : null;
      if(watching){ tv[watching] = 0; got[watching] = 0; pull(); }
    },
    loading:function(team){ return role !== 'teacher' && team === watching && !got[team]; },
    setMe:function(){}
  };
})();
'PLATFORM_END';
