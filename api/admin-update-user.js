import { createClient } from "@supabase/supabase-js";

const roles = new Set(["admin", "manager", "staff", "viewer"]);

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
      const adminUserId = sessionData.user.id;
      const { data: adminProfile, error: adminProfileError } = await adminClient
        .from("profiles")
        .select("id,role,active")
        .eq("id", adminUserId)
        .maybeSingle();

      if (adminProfileError) throw adminProfileError;
      if (adminProfile?.role !== "admin" || adminProfile.active === false) {
        return json({ error: "管理者のみユーザー情報を変更できます" }, 403);
      }

      const payload = await request.json();
      const userId = String(payload.userId || "").trim();
      const name = String(payload.name || "").trim();
      const email = String(payload.email || "").trim();
      const role = String(payload.role || "").trim();
      const active = payload.active === true;
      const password = String(payload.password || "");

      if (!userId || !name || !email || !role) {
        return json({ error: "名前、ログインID、権限を入力してください" }, 400);
      }
      if (!email.includes("@")) {
        return json({ error: "ログインIDはメールアドレス形式で入力してください" }, 400);
      }
      if (!roles.has(role)) {
        return json({ error: "権限の指定が正しくありません" }, 400);
      }
      if (password && password.length < 6) {
        return json({ error: "パスワードは6文字以上で入力してください" }, 400);
      }

      const { data: targetProfile, error: targetProfileError } = await adminClient
        .from("profiles")
        .select("id,email,role,active")
        .eq("id", userId)
        .maybeSingle();

      if (targetProfileError) throw targetProfileError;
      if (!targetProfile) return json({ error: "対象ユーザーが見つかりません" }, 404);

      if (userId === adminUserId && !active) {
        return json({ error: "自分自身は無効化できません" }, 400);
      }
      if (userId === adminUserId && targetProfile.role === "admin" && role !== "admin") {
        return json({ error: "自分自身の管理者権限は外せません" }, 400);
      }

      const { count: activeAdminCount, error: countError } = await adminClient
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("active", true);

      if (countError) throw countError;
      if (targetProfile.role === "admin" && targetProfile.active !== false && (role !== "admin" || !active) && activeAdminCount <= 1) {
        return json({ error: "最後の有効な管理者は変更できません" }, 400);
      }

      const authUpdates = {};
      if (email !== targetProfile.email) {
        authUpdates.email = email;
        authUpdates.email_confirm = true;
      }
      if (password) authUpdates.password = password;

      if (Object.keys(authUpdates).length > 0) {
        const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, authUpdates);
        if (authUpdateError) return json({ error: authUpdateError.message }, 400);
      }

      const { error: profileUpdateError } = await adminClient.from("profiles").update({ email, name, role, active }).eq("id", userId);
      if (profileUpdateError) throw profileUpdateError;

      return json({ ok: true });
    } catch (error) {
      console.error("Failed to update user.", error);
      return json({ error: error?.message || "ユーザー情報を変更できませんでした" }, 500);
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
