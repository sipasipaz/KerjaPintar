import { supabase } from "./supabaseClient.js";

const TABLE = "kv_store";

// Same four-method shape the app already expects from `window.storage`.
// Row-level security in Supabase (see supabase.sql) makes sure a user can
// only ever read/write rows where user_id = their own auth uid — so we
// don't need to filter by user_id client-side for correctness, only
// include it so inserts satisfy the RLS policy and the unique constraint.
export const supabaseStorage = {
  async get(key, shared = false) {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return null;

    const { data, error } = await supabase
      .from(TABLE)
      .select("value")
      .eq("user_id", uid)
      .eq("key", key)
      .eq("shared", shared)
      .maybeSingle();

    if (error || !data) return null;
    return { key, value: data.value, shared };
  },

  async set(key, value, shared = false) {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return null;

    const { error } = await supabase.from(TABLE).upsert(
      { user_id: uid, key, shared, value, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key,shared" }
    );

    if (error) {
      console.error("supabaseStorage.set failed:", error.message);
      return null;
    }
    return { key, value, shared };
  },

  async delete(key, shared = false) {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return null;

    const { error, count } = await supabase
      .from(TABLE)
      .delete({ count: "exact" })
      .eq("user_id", uid)
      .eq("key", key)
      .eq("shared", shared);

    if (error) return null;
    return { key, deleted: (count || 0) > 0, shared };
  },

  async list(prefix = "", shared = false) {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return null;

    const { data, error } = await supabase
      .from(TABLE)
      .select("key")
      .eq("user_id", uid)
      .eq("shared", shared)
      .like("key", `${prefix}%`);

    if (error) return null;
    return { keys: (data || []).map(r => r.key), prefix, shared };
  },
};
