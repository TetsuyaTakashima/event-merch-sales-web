import { createClient } from "@supabase/supabase-js";

const roles = new Set(["admin", "manager", "staff", "tester", "viewer"]);

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return json({ error: "Vercelの環境変数 SUPABASE_SERVICE_ROLE_KEY が未設定です" }, 500);
    }

    try {
      const token = bearerToken(request);
      if (!token) return json({ error: "ログイン情報を確認できません" }, 401);

      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: sessionData, error: sessionError } = await userClient.auth.getUser(token);
      if (sessionError || !sessionData?.user) {
        return json({ error: "ログイン情報を確認できません" }, 401);
      }

      const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: adminProfile, error: adminProfileError } = await adminClient
        .from("profiles")
        .select("id,role,active")
        .eq("id", sessionData.user.id)
        .maybeSingle();

      if (adminProfileError) throw adminProfileError;
      if (adminProfile?.role !== "admin" || adminProfile.active === false) {
        return json({ error: "管理者のみユーザーを追加できます" }, 403);
      }

      const payload = await request.json();
      const name = String(payload.name || "").trim();
      const email = String(payload.email || "").trim();
      const password = String(payload.password || "");
      const role = String(payload.role || "").trim();
      const active = payload.active === true;

      if (!name || !email || !password || !role) {
        return json({ error: "名前、ログインID、仮パスワード、権限を入力してください" }, 400);
      }
      if (!email.includes("@")) {
        return json({ error: "ログインIDはメールアドレス形式で入力してください" }, 400);
      }
      if (password.length < 6) {
        return json({ error: "仮パスワードは6文字以上で入力してください" }, 400);
      }
      if (!roles.has(role)) {
        return json({ error: "権限の指定が正しくありません" }, 400);
      }

      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      });

      if (createError) return json({ error: createError.message }, 400);
      const userId = created?.user?.id;
      if (!userId) return json({ error: "ユーザーを作成できませんでした" }, 500);

      const { error: profileError } = await adminClient.from("profiles").upsert(
        {
          id: userId,
          email,
          name,
          role,
          active,
        },
        { onConflict: "id" },
      );

      if (profileError) {
        await adminClient.auth.admin.deleteUser(userId).catch(() => {});
        throw profileError;
      }

      return json({ ok: true, userId });
    } catch (error) {
      console.error("Failed to create user.", error);
      return json({ error: error?.message || "ユーザーを追加できませんでした" }, 500);
    }
  },
};

function bearerToken(request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}
