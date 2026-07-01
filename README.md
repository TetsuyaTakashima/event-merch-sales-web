# イベント物販売上管理Webアプリ

イベント会場での物販向けに、販売登録、在庫管理、売上集計、CSV出力を行うWebアプリです。Supabaseを設定すると、複数端末でデータを共有できます。

## 起動方法

Supabase/Vercel対応後はViteアプリとして起動します。

Windowsでは `open-app.bat` をダブルクリックすると、依存関係をインストールしてローカル開発サーバーを起動します。

手動で起動する場合:

```powershell
npm install
npm run dev
```

## オンライン公開

オンラインで複数スタッフが同じデータを使う場合は、GitHub + Vercel + Supabaseで運用します。詳しくは `SUPABASE_VERCEL_SETUP.md` を確認してください。

## 主な機能

- イベント別の販売登録
- 現金決済時の受取金額入力とおつり計算
- 商品バリエーション別の在庫管理
- 販売取消と在庫戻し
- 決済方法別、商品別、時間帯別の集計
- 売上明細、商品別集計、決済別集計、在庫一覧のCSV出力
- イベント、商品、ユーザーの簡易管理
- イベントの追加、編集、削除
- 商品名、商品コード、カテゴリ、バリエーション、SKU、価格、表示色の編集
- ユーザーの追加、編集、停止、状態管理（承認待ち / 有効 / 停止）
- 画面上からのデータバックアップと復元

## データ保存

保存先は起動方法によって変わります。

- `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を設定した場合: Supabaseの `app_state` に共有保存
- 環境変数を設定しない場合: ブラウザの `localStorage` にローカル保存

Supabaseモードでは更新番号による競合検知を行い、別端末の更新を古い画面の内容で上書きしません。販売登録、販売取消、取消済み販売の削除、在庫調整、実在庫保存はSupabase RPCで処理し、DB側でも権限と在庫を確認します。別端末の更新はRealtimeで画面へ反映し、競合時は最新データを再読込して操作のやり直しを案内します。

画面右上の「バックアップ」からJSONを書き出し、「復元」から戻せます。「初期データに戻す」からサンプルデータへ戻せます。

## ファイル構成

- `index.html`: アプリのHTML
- `styles.css`: 画面スタイル
- `app.js`: 画面描画、状態管理、販売処理、CSV出力
- `DESIGN.md`: 設計メモ
- `SUPABASE_VERCEL_SETUP.md`: GitHub + Vercel + Supabaseの手順
- `DEPLOY.md`: 静的公開と本番運用の補足
- `open-app.bat`: Windows向け起動ファイル
- `vercel.json`: Vercel向け設定
- `supabase/schema.sql`: Supabase用DB/RLS設定
- `supabase/add-account-status.sql`: 既存Supabase環境にユーザー状態（承認待ち / 有効 / 停止）を追加
- `supabase/add-app-state-rpc.sql`: 共有データ操作用RPCの追加
- `supabase/lock-down-app-state-writes.sql`: RPC移行後に `app_state` の直接書込を閉じる追加設定
