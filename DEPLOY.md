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
3. GitHubにこのフォルダの中身をpushする。
4. VercelでGitHubリポジトリをImportする。
5. VercelのEnvironment Variablesに以下を設定する。

| Key | 内容 |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/publishable key |

6. VercelでDeployする。

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

