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
4. 続けて `supabase/add-app-state-rpc.sql` の全文を実行します。
5. アプリをデプロイした後、`supabase/lock-down-app-state-writes.sql` を実行します。

すでにこのアプリ用のテーブルを作成済みの場合は、まず `supabase/add-account-status.sql` と `supabase/add-tester-role.sql` を実行してください。次に `supabase/add-app-state-version.sql` と `supabase/add-app-state-rpc.sql` を実行し、新しいアプリをデプロイした後で `supabase/lock-down-app-state-writes.sql` を実行してください。

`lock-down-app-state-writes.sql` は `app_state` への直接 `insert/update` を閉じます。古いアプリコードのまま先に実行すると販売保存が失敗するため、RPC対応版のデプロイ成功後に実行します。

最初にアカウント作成したユーザーが管理者になります。2人目以降は販売スタッフとして作成されますが、管理者がユーザー管理画面で状態を「有効」にするまで承認待ちになります。「停止」にしたユーザーはログイン後も利用できず、販売登録などのDB操作もできません。

確認用アカウントを作る場合は、ユーザー管理画面で権限を「テスト販売」、状態を「有効」にします。テスト販売ユーザーは本番の `main` データを読まず、Supabase上の `sandbox:<ユーザーID>` に分離された確認用データだけを読み書きします。テスト環境内ではイベント、商品、在庫、販売、集計を確認できますが、本番売上には反映されません。

ユーザー更新時に `permission denied for table profiles` が出る場合は、`supabase/grants.sql` の全文をSQL Editorで実行してください。新しいSupabaseプロジェクトでは、テーブルのData API権限を明示的に付与する必要がある場合があります。

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
2. 管理者でログインします。
3. ユーザー管理画面で追加スタッフの名前、ログインID、仮パスワード、権限、状態（承認待ち / 有効 / 停止）を入力して追加します。
4. 追加スタッフは公開URLからログインします。
5. 管理者はユーザー管理画面でログインID、仮パスワード、権限、状態を変更できます。

## 注意

現在の実装では、既存UIをなるべく残すため、イベント・商品・販売・在庫の本体データをSupabaseの共有JSONとして保存しています。更新番号によって複数端末の同時更新を検知し、古いデータによる上書きを防止します。販売登録、販売取消、取消済み販売の削除、在庫調整、実在庫保存はSupabase RPCで実行し、DB側でも権限と在庫を確認します。

DBポリシーでは、本番ユーザーは `app_state.id = 'main'`、テスト販売ユーザーは `app_state.id = 'sandbox:<ユーザーID>'` のみ参照できます。テスト販売ユーザーは本番売上を確認できず、自分の確認用データだけを更新します。監査要件がある運用や販売が非常に集中する規模では、売上・在庫などを個別テーブル化し、販売登録と在庫減算を専用DB関数化してください。
