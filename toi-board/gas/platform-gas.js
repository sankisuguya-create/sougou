'PLATFORM_BEGIN';
/* GAS版の 保存。build.cjs が ../index.html の PLATFORM 区間を これに 差し替える。
   書く：変更の 差分を 250ms ためて apply へ。届くまで 自分の 変更は 上書きしない（pend）。
   読む：約10秒（±3秒）ごとに poll。版が 同じなら サーバーは 何も 読まない。タブが 裏の 間は 止める。 */
var Platform = (function(){
  var POLL = window.TOI_POLL_MS || 10000, JIT = window.TOI_POLL_JIT == null ? 3000 : window.TOI_POLL_JIT;
  var ver = 0, mver = '', pend = {}, q = blank(), timer = null, busy = false, pollT = null, errs = 0, polling = false;
  function blank(){ return {up:{}, del:{}, star:{}, modes:null}; }
  function empty(x){ return !Object.keys(x.up).length && !Object.keys(x.del).length && !Object.keys(x.star).length && !x.modes; }
  function net(t){ var el = document.getElementById('net'); if(el) el.textContent = t; }
  function fail(e){ errs++; net('つながりにくい ようです（' + errs + '）。そのまま つづけて だいじょうぶ'); }
  function run(name, args, ok, ng){
    var r = google.script.run
      .withSuccessHandler(function(x){ errs = 0; net(''); ok(x); })
      .withFailureHandler(function(e){ fail(e); if(ng) ng(e); });
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
      star:Object.keys(sent.star).map(function(k){ return {noteId:k, on:sent.star[k]}; }),
      modes:sent.modes
    };
    run('apply', [ops], function(r){
      busy = false;
      Object.keys(sent.up).concat(Object.keys(sent.del)).forEach(function(id){ if(!q.up[id] && !q.del[id]) delete pend[id]; });
      Object.keys(sent.star).forEach(function(id){ if(!(id in q.star)) delete pend['*' + id]; });
      if(r && r.rejected && r.rejected.length) pull(true);
      if(!empty(q)) schedule(0);
    }, function(){
      busy = false;
      // 送れなかった 分を 戻す（あとから した 変更を 優先）
      Object.keys(sent.up).forEach(function(k){ if(!q.up[k] && !q.del[k]) q.up[k] = sent.up[k]; });
      Object.keys(sent.del).forEach(function(k){ if(!q.up[k]) q.del[k] = 1; });
      Object.keys(sent.star).forEach(function(k){ if(!(k in q.star)) q.star[k] = sent.star[k]; });
      if(!q.modes) q.modes = sent.modes;
      schedule(Math.min(30000, 2000 * errs));
    });
  }
  function pull(full){
    if(polling) return;
    polling = true;
    run('poll', [full ? 0 : ver, full ? '' : mver], function(r){
      polling = false;
      var changed = r.items !== undefined;
      ver = r.ver; mver = r.mver;
      if(changed) mergeRemote(r, pend);
    }, function(){ polling = false; });
  }
  function loop(){
    clearTimeout(pollT);
    pollT = setTimeout(function(){ if(!document.hidden) pull(false); loop(); }, Math.max(1000, POLL + (Math.random() * 2 - 1) * JIT));
  }
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) pull(false); });
  return {
    demo:false,
    start:function(cb){
      run('boot', [], function(r){
        if(r.api !== API_WANT) net('版が ちがいます（画面 ' + API_WANT + '／サーバー ' + r.api + '）。先生に 伝えてください');
        ver = r.ver; mver = r.mver;
        cb({items:r.items.filter(function(x){ return !x.del; }), stars:r.stars.filter(function(s){ return s.on; }).map(function(s){ return {noteId:s.noteId, viewer:s.viewer}; }), modes:r.modes, roster:r.roster}, r.me.id, r.spots, r.me);
        loop();
      }, function(e){
        document.getElementById('app').innerHTML = '<p style="padding:24px;font-size:20px;font-weight:700">ひらけません：' + String(e && e.message || e).replace(/[<>&]/g, '') + '</p>';
      });
    },
    push:function(ops){
      if(!ops) return;
      ops.up.forEach(function(x){ q.up[x.id] = x; delete q.del[x.id]; pend[x.id] = 1; });
      ops.del.forEach(function(id){ delete q.up[id]; q.del[id] = 1; pend[id] = 1; });
      ops.star.forEach(function(s){ q.star[s.noteId] = s.on; pend['*' + s.noteId] = 1; });
      if(ops.modes) q.modes = ops.modes;
      schedule();
    },
    setMe:function(){},
    _pull:pull
  };
})();
'PLATFORM_END';
