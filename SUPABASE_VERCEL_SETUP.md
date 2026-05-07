# GitHub + Vercel + Supabase セットアップ手順

複数スタッフで同じデータを使う本番向け手順です。

## 1. Supabaseプロジェクトを作成

1. Supabaseにログインします。
2. New projectを作成します。
3. Project URLとanon/publishable keyを控えます。

secret keyやservice role keyはブラウザアプリやVercelの公開環境変数に入れません。

## 2. SupabaseにDBを作成

1. SupabaseのSQL Editorを開きます。
2. `supabase/schema.sql` の全文を貼り付けます。
3. Runを押します。

最初にアカウント作成したユーザーが管理者になります。2人目以降は販売スタッフとして作成されますが、管理者がユーザー管理画面で有効化するまで承認待ちになります。

## 3. ローカル確認

Node.jsが入っている場合のみ必要です。

```powershell
cd C:\Users\takas\Desktop\Codex\event-merch-sales-web
copy .env.example .env
```

`.env` にSupabaseの値を入れます。

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-or-publishable-key
```

その後:

```powershell
npm install
npm run dev
```

## 4. GitHubに置く

1. GitHubで新しいリポジトリを作成します。
2. `event-merch-sales-web` フォルダの中身をコミットしてpushします。

## 5. Vercelに接続

1. Vercelにログインします。
2. Add New Projectを選びます。
3. GitHubリポジトリを選択します。
4. Framework PresetはViteを選びます。
5. Environment Variablesに以下を追加します。

| Key | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | SupabaseのProject URL |
| `VITE_SUPABASE_ANON_KEY` | Supabaseのanon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabaseのservice_role key |

`SUPABASE_SERVICE_ROLE_KEY` は管理者がユーザーのログインIDや仮パスワードを変更するために使います。VercelのEnvironment Variablesにだけ設定し、`VITE_` を付けないでください。ブラウザ側に公開してはいけません。

6. Deployを押します。

## 6. Supabase AuthのURL設定

パスワード再設定メールからアプリに戻れるように、Vercelの公開URLをSupabaseに登録します。

1. SupabaseのAuthentication > URL Configurationを開きます。
2. Site URLにVercelの公開URLを設定します。
3. Redirect URLsに以下を追加します。

```text
https://your-app.vercel.app/**
http://localhost:5173/**
```

`https://your-app.vercel.app` は実際のVercel URLに置き換えてください。

Supabase標準のメール送信は検証用です。標準状態では送信先がプロジェクトのチームメンバーに制限され、送信数も少ないため、実運用ではAuthentication > SMTP SettingsでCustom SMTPを設定してください。

## 7. スタッフ追加

1. 公開URLを開きます。
2. 最初のユーザーが「アカウントを作成」します。
3. 最初のユーザーは自動で管理者になります。
4. 追加スタッフも公開URLでアカウント作成します。
5. 追加スタッフは承認待ち画面になります。
6. 管理者がユーザー管理画面で有効化し、必要に応じてログインID、仮パスワード、権限を変更します。

## 注意

現在の実装では、既存UIをなるべく残すため、イベント・商品・販売・在庫の本体データをSupabaseの共有JSONとして保存しています。複数端末で同じデータは共有できます。販売が非常に同時に集中する規模になった場合は、次の段階で販売登録と在庫減算を専用DB関数化するとより堅牢です。
