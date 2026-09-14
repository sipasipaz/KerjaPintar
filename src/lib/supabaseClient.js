import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fails loudly at build/runtime rather than silently breaking sync —
  // see README.md "Supabase setup" for where these come from.
  console.error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. " +
    "Add them as environment variables (see README.md) and redeploy."
  );
}

export const supabase = createClient(url || "", anonKey || "");
