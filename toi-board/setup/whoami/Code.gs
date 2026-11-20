/* ドメインの 確認用（5分）。
   新しい Apps Script に これだけ 貼り、デプロイ → ウェブアプリ
   「次のユーザーとして実行：自分」「アクセスできるユーザー：（学校の）ドメイン内の全員」で 公開。
   児童アカウントで URL を 開き、表示を 先生に 伝える。
   ・児童のメールが 出る → 本番と 同じ 設定で 児童を 判定できる
   ・空 → 「アクセスしているユーザー」として 実行する 方式か、番号入力に 切り替える
   ・開けない（権限なし）→ 児童のドメインが 公開範囲に 入っていない */
function doGet(){
  var a = '', e = '';
  try{ a = Session.getActiveUser().getEmail(); }catch(err){ a = 'エラー：' + err; }
  try{ e = Session.getEffectiveUser().getEmail(); }catch(err){ e = 'エラー：' + err; }
  return HtmlService.createHtmlOutput(
    '<p style="font-size:24px">開いた人：<b>' + (a || '（空）') + '</b></p>' +
    '<p style="font-size:16px">実行している人：' + e + '<br>時刻：' + new Date() + '</p>');
}
