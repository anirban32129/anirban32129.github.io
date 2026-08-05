// supabase/functions/delete-account/index.ts
//
// Deletes the currently authenticated user's Mathinphys account and their
// associated data. Deploy with the Supabase CLI:
//
//   supabase functions deploy delete-account
//
// SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are
// injected automatically by the Supabase platform for every Edge
// Function — you do not need to set them manually as secrets.
//
// Security model:
//   - The caller's JWT (from the "Authorization: Bearer <token>" header)
//     is verified against Supabase Auth itself via userClient.auth.getUser().
//     This never trusts a user id supplied by the client — the id used for
//     every delete below comes only from the verified token.
//   - The service_role key is used ONLY inside this server-side function,
//     never sent to or stored in the browser.
//   - A user can only ever delete their own account — there is no code
//     path that accepts or acts on someone else's user id.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Table(s) containing this app's user-owned data that must be cleaned up
// before the auth account itself is removed. Add more tables here if you
// add more user-owned tables in the future (e.g. a "profiles" table).
const USER_DATA_TABLES = ["Questions"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

  try {
    // Client scoped to the caller's own JWT — used ONLY to verify identity.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: "Invalid or expired session. Please log in again." }, 401);
    }

    // Admin client — service_role key, used only here, server-side.
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 1. Delete the user's own rows from every user-owned data table.
    for (const table of USER_DATA_TABLES) {
      const { error: dataError } = await adminClient.from(table).delete().eq("user_id", user.id);
      if (dataError) {
        return jsonResponse(
          { error: `Failed to delete data from "${table}": ${dataError.message}` },
          500
        );
      }
    }

    // 2. Delete the Supabase Auth account itself.
    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (authDeleteError) {
      return jsonResponse(
        { error: `Failed to delete account: ${authDeleteError.message}` },
        500
      );
    }

    return jsonResponse({ success: true }, 200);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
