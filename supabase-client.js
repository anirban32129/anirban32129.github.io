// supabase-client.js
// Initializes the Supabase client for use across your website.
// This file loads the Supabase CDN script itself, so you only need:
// <script src="supabase-client.js"></script>
//
// Since loading the CDN is async, use `getSupabase()` (returns a Promise)
// instead of a plain global `supabase` variable when calling from other files.

const SUPABASE_URL = "https://anzndpwykgawzbbsowsc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_zCIlv2SQf2ivVnUiZNFxtg_qsQX0myr";

let _supabaseReadyPromise = null;

function _loadSupabaseScript() {
  return new Promise((resolve, reject) => {
    if (window.supabase && window.supabase.createClient) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Supabase CDN script"));
    document.head.appendChild(script);
  });
}

/**
 * Returns a promise that resolves to the initialized Supabase client.
 * Safe to call multiple times — the client is created only once.
 */
function getSupabase() {
  if (!_supabaseReadyPromise) {
    _supabaseReadyPromise = _loadSupabaseScript().then(() =>
      window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    );
  }
  return _supabaseReadyPromise;
}

// Auth helper functions

async function signUp(email, password) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.signUp({ email, password });
  return { data, error };
}

async function signIn(email, password) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
}

async function signInWithGoogle() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin + window.location.pathname,
    },
  });
  return { data, error };
}

async function signOut() {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signOut();
  return { error };
}

async function resetPassword(email) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/reset-password.html",
  });
  return { data, error };
}

async function updatePassword(newPassword) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  return { data, error };
}

async function getCurrentUser() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

/**
 * Permanently deletes the currently logged-in user's account.
 *
 * This calls the "delete-account" Supabase Edge Function, which runs
 * server-side with admin privileges. The Edge Function verifies the
 * caller's JWT itself and only ever deletes the account that JWT belongs
 * to — no service_role key or admin credential is ever present in this
 * file or sent to the browser.
 *
 * Deletes (server-side, in this order):
 *   1. The user's rows in the "Questions" table.
 *   2. The user's Supabase Auth account.
 *
 * This function does NOT sign the user out or touch localStorage/
 * sessionStorage — the caller (login-modal.js) does that after a
 * successful response, since only it knows when it's safe to redirect.
 */
async function deleteAccount() {
  const supabase = await getSupabase();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData || !sessionData.session) {
    return { error: { message: "You're not logged in." } };
  }
  try {
    const { data, error } = await supabase.functions.invoke("delete-account", {
      method: "POST",
    });
    return { data, error };
  } catch (err) {
    return { error: { message: (err && err.message) || "Something went wrong. Try again." } };
  }
}

/**
 * Removes Supabase auth/session keys from localStorage and sessionStorage.
 * Supabase namespaces its own keys with a "sb-" prefix, so this only ever
 * touches keys it created — nothing else on the page is affected.
 */
function clearSupabaseAuthStorage() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("sb-"))
      .forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    /* localStorage may be unavailable (e.g. private browsing) — ignore */
  }
  try {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith("sb-"))
      .forEach((k) => sessionStorage.removeItem(k));
  } catch (e) {
    /* sessionStorage may be unavailable — ignore */
  }
}

// Example helper functions — customize or remove as needed

/**
 * Insert a row into a table.
 * @param {string} table
 * @param {object} row
 */
async function insertRow(table, row) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.from(table).insert([row]).select();
  if (error) {
    console.error(`Insert into ${table} failed:`, error.message);
    return null;
  }
  return data;
}

/**
 * Fetch all rows from a table.
 * @param {string} table
 */
async function fetchRows(table) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.from(table).select("*");
  if (error) {
    console.error(`Fetch from ${table} failed:`, error.message);
    return null;
  }
  return data;
}

/**
 * Subscribe to realtime changes on a table.
 * @param {string} table
 * @param {(payload: object) => void} onChange
 */
async function subscribeToTable(table, onChange) {
  const supabase = await getSupabase();
  return supabase
    .channel(`public:${table}`)
    .on("postgres_changes", { event: "*", schema: "public", table }, onChange)
    .subscribe();
}
