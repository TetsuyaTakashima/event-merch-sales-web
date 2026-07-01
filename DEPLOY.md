# デプロイ手順

このアプリは、複数スタッフが同じデータを使う前提で GitHub + Vercel + Supabase 構成に変更済みです。

詳細な初期設定は `SUPABASE_VERCEL_SETUP.md` を確認してください。

## 構成

- GitHub: コード管理
- Vercel: フロントエンド公開
- Supabase: ログイン、ユーザー権限、共有データ保存

## デプロイの流れ

1. Supabaseでプロジェクトを作成する。
2. Supabase SQL Editorで `supabase/schema.sql` を実行する。
3. Supabase SQL Editorで `supabase/add-app-state-rpc.sql` を実行する。
4. GitHubにこのフォルダの中身をpushする。
5. VercelでGitHubリポジトリをImportする。
6. VercelのEnvironment Variablesに以下を設定する。

| Key | 内容 |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key |

7. VercelでDeployする。
8. デプロイ成功後、Supabase SQL Editorで `supabase/lock-down-app-state-writes.sql` を実行する。
9. SupabaseのAuthentication > URL Configurationで、Vercelの公開URLをSite URLとRedirect URLsに追加する。

既存のSupabase環境を更新する場合は、デプロイ前に `supabase/add-account-status.sql`、`supabase/add-app-state-version.sql`、`supabase/add-app-state-rpc.sql` をSQL Editorで実行してください。`supabase/lock-down-app-state-writes.sql` はRPC対応版のデプロイ成功後に実行します。古いアプリコードのまま先に実行すると販売保存が失敗します。

パスワード再設定メールを使う場合、Redirect URLsには以下のようなURLを入れます。

```text
https://your-app.vercel.app/**
http://localhost:5173/**
```

Supabase標準のメール送信は検証用です。送信先制限や低い送信数制限があるため、実運用ではSupabaseのAuthentication > SMTP SettingsでCustom SMTPを設定してください。

ユーザー管理画面でログインIDや仮パスワードを変更する場合は、Vercelに `SUPABASE_SERVICE_ROLE_KEY` を設定してください。このキーはサーバー関数だけで使うため、`VITE_` を付けず、ブラウザ側に公開しません。

追加スタッフのアカウント作成もユーザー管理画面から行います。ログイン画面には公開アカウント作成ボタンを表示しません。

ユーザー状態は「承認待ち / 有効 / 停止」の3種類です。「有効」以外のユーザーはアプリ利用と販売登録などのDB操作ができません。

ユーザー更新時に `permission denied for table profiles` が出る場合は、Supabase SQL Editorで `supabase/grants.sql` を実行してください。

## ローカル確認

```powershell
cd C:\Users\takas\Desktop\Codex\event-merch-sales-web
copy .env.example .env
npm install
npm run dev
```

`.env` にはSupabaseのProject URLとanon/publishable keyを設定します。

## 補足

`netlify.toml` も残していますが、今回の推奨はVercelです。Netlifyを使う場合も、Vercelと同じく環境変数を設定して `npm run build` で `dist` を公開します。
