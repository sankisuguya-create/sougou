'PLATFORM_BEGIN';
/* GAS版の 保存。build.cjs が ../index.html の PLATFORM 区間を これに 差し替える。
   約90人が 同時に つかう 前提で 軽くする：
   ・モード・回は ふだんの 確認で 届く（版が 変わった 時だけ）。ページの 開き直しは いらない
     （全員が 一斉に 開き直すと、同時に 動かせる 処理の 上限（約30）を こえるため）。
   ・児童は 約10秒（±3秒）ごとに 自分の班（と 今 見ている 班、シール貼りの 時は その 班たち）の 版だけを 確かめる。
     版は キャッシュで まとめて 引くので、変化が なければ シートは 読まない。
   ・書く：付箋は 250ms、シール・コメントは 1.5秒 ためて まとめて 送る（書きこみの 回数を へらす）。
   ・開く・確かめるに 失敗したら、1〜5秒の ばらばらな 間を おいて やり直す（一斉の やり直しを 防ぐ）。
   ・タブが 裏の 間は 確かめない。 */
var Platform = (function(){
  var POLL = window.TOI_POLL_MS || 10000, JIT = window.TOI_POLL_JIT == null ? 3000 : window.TOI_POLL_JIT;
  var SEAL_WAIT = window.TOI_SEAL_WAIT == null ? 1500 : window.TOI_SEAL_WAIT;
  var role = '', own = '', watching = null, tv = {}, all = 0, got = {}, mver = '';
  var pend = {}, q = blank(), timer = null, due = 0, busy = false, pollT = null, errs = 0, polling = false, again = false;
  function blank(){ return {up:{}, del:{}, star:{}, cmt:{}, purge:{}, cmtDel:{}, modes:null}; }
  function empty(x){ return !Object.keys(x.up).length && !Object.keys(x.del).length && !Object.keys(x.star).length && !Object.keys(x.cmt).length && !Object.keys(x.purge).length && !Object.keys(x.cmtDel).length && !x.modes; }
  function net(t){ var el = document.getElementById('net'); if(el) el.textContent = t; }
  function backoff(){ return 1000 + Math.random() * 4000; }
  /* 送り終わるまでの 変更を 端末にも 置く（通信が 切れたまま 閉じても、次に 開いた 時に 送り直す） */
  var keepKey = '', inflight = null;
  function keep(){
    if(!keepKey) return;
    try{
      var all = JSON.parse(JSON.stringify(q));
      if(inflight) ['up', 'del', 'star', 'cmt', 'purge', 'cmtDel'].forEach(function(t){ Object.keys(inflight[t] || {}).forEach(function(k){ if(!(k in all[t])) all[t][k] = inflight[t][k]; }); });
      if(empty(all)) localStorage.removeItem(keepKey); else localStorage.setItem(keepKey, JSON.stringify(all));
    }catch(e){}
  }
  function run(name, args, ok, ng){
    var r = google.script.run
      .withSuccessHandler(function(x){ errs = 0; net(''); ok(x); })
      .withFailureHandler(function(e){ errs++; net('つながりにくい ようです（' + errs + '）。そのまま つづけて だいじょうぶ'); if(ng) ng(e); });
    r[name].apply(r, args);
  }
  /* 早く 送る ほうを 優先（付箋の 変更が あれば シールの 待ちより 先に 送る） */
  function schedule(ms){
    ms = ms == null ? 250 : ms;
    var at = Date.now() + ms;
    if(timer && due && due <= at) return;
    clearTimeout(timer); due = at; timer = setTimeout(function(){ timer = null; due = 0; send(); }, ms);
  }
  function send(){
    if(busy || empty(q)) return;
    busy = true;
    var sent = q; q = blank(); inflight = sent;
    var ops = {
      up:Object.keys(sent.up).map(function(k){ return sent.up[k]; }),
      del:Object.keys(sent.del),
      star:Object.keys(sent.star).map(function(k){ return sent.star[k]; }),
      cmt:Object.keys(sent.cmt).map(function(k){ return sent.cmt[k]; }),
      purge:Object.keys(sent.purge),
      cmtDel:Object.keys(sent.cmtDel).map(function(k){ return sent.cmtDel[k]; }),
      modes:sent.modes
    };
    run('apply', [ops], function(r){
      busy = false; inflight = null; keep();
      Object.keys(sent.up).concat(Object.keys(sent.del)).forEach(function(id){ if(!q.up[id] && !q.del[id]) delete pend[id]; });
      Object.keys(sent.star).forEach(function(id){ if(!(id in q.star)) delete pend['*' + id]; });
      Object.keys(sent.cmt).forEach(function(id){ if(!(id in q.cmt)) delete pend['#' + id]; });
      if(r && r.rejected && r.rejected.length){
        // モードや 回が 先に 変わっていた：最新の モードと 班の 中身を 取り直す
        toast('うまく 送れなかったので、さいしんの 画面に します');
        mver = ''; if(own) tv[own] = 0; if(watching) tv[watching] = 0; all = 0;
        pull();
      }
      if(!empty(q)) schedule(0);
    }, function(){
      busy = false; inflight = null;
      // 送れなかった 分を 戻す（あとから した 変更を 優先）
      Object.keys(sent.up).forEach(function(k){
        var later = q.up[k], first = sent.up[k];
        if(q.del[k]) return;
        if(!later){ q.up[k] = first; return; }
        // あとの 変更を 前の 変更に 重ねる（どちらも 失わない）
        if(later.p && first.p){ Object.keys(first.p).forEach(function(f){ if(!(f in later.p)) later.p[f] = first.p[f]; }); }
        else if(later.p && !first.p){ Object.keys(later.p).forEach(function(f){ first[f] = later.p[f]; }); (later.u || []).forEach(function(f){ delete first[f]; }); q.up[k] = first; }
      });
      Object.keys(sent.purge).forEach(function(k){ q.purge[k] = 1; });
      Object.keys(sent.cmtDel).forEach(function(k){ q.cmtDel[k] = sent.cmtDel[k]; });
      Object.keys(sent.del).forEach(function(k){ if(!q.up[k]) q.del[k] = 1; });
      Object.keys(sent.star).forEach(function(k){ if(!(k in q.star)) q.star[k] = sent.star[k]; });
      Object.keys(sent.cmt).forEach(function(k){ if(!(k in q.cmt)) q.cmt[k] = sent.cmt[k]; });
      if(!q.modes) q.modes = sent.modes;
      keep();
      schedule(Math.min(30000, 2000 * errs + backoff()));
    });
  }
  function request(){
    if(role === 'teacher') return {all:all};
    var t = {}; t[own] = tv[own] || 0;
    if(watching && watching !== own) t[watching] = tv[watching] || 0;
    (typeof galleryTeams === 'function' ? galleryTeams() : []).forEach(function(g){ if(!(g in t)) t[g] = tv[g] || 0; });
    return {teams:t, mv:mver};
  }
  function pull(){
    if(polling){ again = true; return; }
    polling = true;
    run('poll', [request()], function(r){
      polling = false;
      if(!r.same){
        var gotModes = r.mver !== undefined && String(r.mver) !== mver;
        if(r.mver !== undefined) mver = String(r.mver);
        if(r.tv) Object.keys(r.tv).forEach(function(t){ tv[t] = r.tv[t]; got[t] = 1; });
        if(r.all) all = r.all;
        mergeRemote(r, pend);
        // モードが 変わって シール貼りの 班が ふえたら、すぐ 取りに行く
        if(gotModes && typeof galleryTeams === 'function' && galleryTeams().some(function(g){ return !got[g]; })) again = true;
      }
      if(again){ again = false; pull(); }
    }, function(){ polling = false; });
  }
  function loop(){
    clearTimeout(pollT);
    pollT = setTimeout(function(){ if(!document.hidden) pull(); loop(); }, Math.max(1000, POLL + (Math.random() * 2 - 1) * JIT));
  }
  /* 画面を はなれる 時は、ためている 書きこみを すぐ 送る（1.5秒 ためている 間に 閉じても 消えない） */
  function flush(){ if(!empty(q)){ clearTimeout(timer); timer = null; due = 0; send(); } }
  document.addEventListener('visibilitychange', function(){ if(document.hidden) flush(); else pull(); });
  window.addEventListener('pagehide', flush);
  return {
    demo:false,
    start:function(cb){
      var tries = 0;
      (function boot(){
        run('boot', [], function(r){
          if(r.api !== API_WANT) net('版が ちがいます（画面 ' + API_WANT + '／サーバー ' + r.api + '）。先生に 伝えてください');
          if(r.trialUrl) window.TOI_TRIAL_URL = r.trialUrl;
          role = r.me.role; own = r.me.team || ''; if(r.tv) tv = r.tv; if(r.all) all = r.all; if(r.mver !== undefined) mver = String(r.mver);
          cb({items:r.items.filter(function(x){ return !x.del; }), stars:r.stars.filter(function(s){ return s.on; }).map(starOf), comments:(r.comments || []).filter(function(c){ return c.on; }).map(cmtOf), modes:r.modes, roster:r.roster}, r.me.id, r.spots, r.me);
          loop();
          // 前に 送れなかった 変更が 端末に あれば 送り直す
          keepKey = 'toiboard.unsent.' + r.me.id;
          try{
            var old = JSON.parse(localStorage.getItem(keepKey) || 'null');
            if(old && !empty(Object.assign(blank(), old))){
              ['up', 'del', 'star', 'cmt', 'purge', 'cmtDel'].forEach(function(t){ Object.keys(old[t] || {}).forEach(function(k){ q[t][k] = old[t][k]; if(t === 'up' || t === 'del') pend[k] = 1; }); });
              net('前に 送れなかった 変更を 送っています'); schedule(0);
            }
          }catch(e){}
        }, function(e){
          var msg = String(e && e.message || e);
          // 名簿に ない 等は やり直しても かわらない。それ以外（混雑 など）は 間を おいて やり直す
          if(/NOT_IN_ROSTER|NO_EMAIL/.test(msg) || ++tries > 8){
            document.getElementById('app').innerHTML = '<p style="padding:24px;font-size:20px;font-weight:700">ひらけません：' + msg.replace(/[<>&]/g, '') + '</p>';
            return;
          }
          net('つながるのを まっています（' + tries + '）');
          setTimeout(boot, backoff() * Math.min(tries, 3));
        });
      })();
    },
    push:function(ops){
      if(!ops) return;
      var onlySeal = !ops.up.length && !ops.del.length && !ops.modes && !(ops.purge || []).length && !(ops.cmtDel || []).length;
      ops.up.forEach(function(x){
        var prev = q.up[x.id];
        if(x.p && prev && prev.p){ Object.keys(x.p).forEach(function(k){ prev.p[k] = x.p[k]; }); prev.u = (prev.u || []).filter(function(k){ return !(k in x.p); }).concat(x.u || []); }
        else if(x.p && prev && !prev.p){ Object.keys(x.p).forEach(function(k){ prev[k] = x.p[k]; }); (x.u || []).forEach(function(k){ delete prev[k]; }); }
        else q.up[x.id] = x;
        delete q.del[x.id]; pend[x.id] = 1;
      });
      ops.del.forEach(function(id){ delete q.up[id]; q.del[id] = 1; pend[id] = 1; });
      ops.star.forEach(function(s){ var key = s.noteId + '|' + s.k + '|' + (s.rd == null ? 1 : s.rd); q.star[key] = s; pend['*' + key] = 1; });
      (ops.cmt || []).forEach(function(c){ q.cmt[c.noteId] = c; pend['#' + c.noteId] = 1; });
      (ops.purge || []).forEach(function(id){ q.purge[id] = 1; });
      (ops.cmtDel || []).forEach(function(c){ q.cmtDel[c.noteId + '|' + c.viewer] = c; });
      if(ops.modes) q.modes = ops.modes;
      keep();
      schedule(onlySeal ? SEAL_WAIT : 250);
    },
    /* ほかの班を 開いた時だけ その班を 取りに行く（児童） */
    watch:function(team){
      if(role === 'teacher') return;
      watching = team && team !== own ? team : null;
      if(watching){ tv[watching] = 0; got[watching] = 0; pull(); }
    },
    loading:function(team){ return role !== 'teacher' && team === watching && !got[team]; },
    setMe:function(){},
    state:function(){ return {mver:mver, tv:tv, polling:polling, role:role}; }
  };
})();
'PLATFORM_END';
