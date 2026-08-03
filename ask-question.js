// ask-question.js
// Floating "Ask a Question" button + panel.
//
// TO ADD THIS TO ANOTHER PAGE, add these lines (order matters):
//
//   <link rel="stylesheet" href="ask-question.css">
//   ...
//   <script src="supabase-client.js"></script>   <!-- only if the page doesn't already include it -->
//   <script src="ask-question.js"></script>
//
// That's it — no HTML markup needed, the script builds its own button/panel.
//
// Behavior:
//  - Reuses your existing Supabase client (via getSupabase()/getCurrentUser()
//    from supabase-client.js). If that script isn't already on the page,
//    this file loads it itself — it never creates a second client.
//  - Reuses your existing Supabase Auth session. If the visitor isn't logged
//    in, submitting is blocked and they're shown a message + a button that
//    opens your existing login modal (if present on the page) or sends them
//    to your homepage to log in.
//  - Reads/writes the existing "Questions" table exactly as-is:
//      id, created_at, user_id, user_name, question, admin_reply, status
//    This script never creates the table, never touches RLS, and never
//    writes to "admin_reply" or "status" — only your admin page does that.
//  - No realtime subscriptions: loads on open, reloads after sending.

(function () {
  if (window.__askQuestionWidgetLoaded) return;
  window.__askQuestionWidgetLoaded = true;

  const QUESTIONS_TABLE = "Questions";

  // ---------- Ensure supabase-client.js is available (no duplicate client) ----------
  function ensureSupabaseClientLoaded() {
    return new Promise((resolve, reject) => {
      if (typeof window.getSupabase === "function") {
        resolve();
        return;
      }
      const existing = document.querySelector('script[src*="supabase-client.js"]');
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("Failed to load supabase-client.js")));
        return;
      }
      const script = document.createElement("script");
      script.src = "supabase-client.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load supabase-client.js"));
      document.head.appendChild(script);
    });
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
      " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  /** Best available display name for the logged-in user, without requiring
   *  any change to your signup flow (which only collects email/password). */
  function getDisplayName(user) {
    const meta = user.user_metadata || {};
    return meta.full_name || meta.name || (user.email ? user.email.split("@")[0] : "User");
  }

  // ---------- Build DOM (markup only; visuals come from ask-question.css) ----------
  function buildDom() {
    const launcher = document.createElement("button");
    launcher.id = "aq-launcher";
    launcher.setAttribute("aria-label", "Ask a question");
    launcher.textContent = "💬";
    document.body.appendChild(launcher);

    const panel = document.createElement("div");
    panel.id = "aq-panel";
    panel.innerHTML = `
      <div id="aq-head">
        <h4>Ask a <span>Question</span></h4>
        <button id="aq-close" aria-label="Close">&times;</button>
      </div>
      <div id="aq-loggedin-as" style="display:none;"></div>
      <div id="aq-body">
        <div id="aq-loginwrap"><p>Loading…</p></div>
      </div>
      <div id="aq-status"></div>
      <div id="aq-foot" style="display:none;">
        <textarea id="aq-input" placeholder="Type your question…" rows="1"></textarea>
        <button id="aq-send">Send</button>
      </div>
    `;
    document.body.appendChild(panel);

    return { launcher, panel };
  }

  function init() {
    const { launcher, panel } = buildDom();

    const closeBtn = document.getElementById("aq-close");
    const body = document.getElementById("aq-body");
    const foot = document.getElementById("aq-foot");
    const statusEl = document.getElementById("aq-status");
    const input = document.getElementById("aq-input");
    const sendBtn = document.getElementById("aq-send");
    const loggedInAs = document.getElementById("aq-loggedin-as");

    let currentUser = null;
    let hasOpenedOnce = false;

    function setStatus(text, type) {
      statusEl.textContent = text || "";
      statusEl.className = type || "";
    }

    function openPanel() {
      panel.classList.add("aq-open");
      requestAnimationFrame(() => panel.classList.add("aq-visible"));
      if (!hasOpenedOnce) {
        hasOpenedOnce = true;
        refreshAuthAndLoad();
      }
    }
    function closePanel() {
      panel.classList.remove("aq-visible");
      setTimeout(() => panel.classList.remove("aq-open"), 160);
    }

    launcher.addEventListener("click", () => {
      if (panel.classList.contains("aq-open")) {
        closePanel();
      } else {
        openPanel();
      }
    });
    closeBtn.addEventListener("click", closePanel);

    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 90) + "px";
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
    sendBtn.addEventListener("click", handleSend);

    function renderLoggedOut() {
      loggedInAs.style.display = "none";
      foot.style.display = "none";
      body.innerHTML = `
        <div id="aq-loginwrap">
          <p>Please log in to ask a question and see your previous questions and replies.</p>
          <button id="aq-login-btn">Log In</button>
        </div>
      `;
      document.getElementById("aq-login-btn").addEventListener("click", () => {
        const hostLoginBtn = document.getElementById("login-toggle-btn");
        if (hostLoginBtn) {
          hostLoginBtn.click();
        } else {
          window.location.href = "index.html";
        }
      });
    }

    function renderMessages(rows) {
      loggedInAs.style.display = "block";
      loggedInAs.textContent = "Logged in as " + getDisplayName(currentUser);
      foot.style.display = "flex";

      if (!rows || rows.length === 0) {
        body.innerHTML = `<div id="aq-empty">No questions yet. Ask your first question below!</div>`;
        return;
      }

      body.innerHTML = rows.map((row) => {
        const isAnswered = row.status === "answered";
        const badgeClass = isAnswered ? "answered" : "waiting";
        const badgeText = isAnswered ? "Answered" : "Waiting for reply";
        let replyHtml = "";
        if (row.admin_reply) {
          replyHtml = `
            <div class="aq-r">
              <div class="aq-r-label">Reply</div>
              ${escapeHtml(row.admin_reply)}
            </div>
          `;
        }
        return `
          <div class="aq-msg">
            <div class="aq-q">${escapeHtml(row.question)}</div>
            <div class="aq-meta">
              <span class="aq-badge ${badgeClass}">${badgeText}</span>
              <span>${formatDate(row.created_at)}</span>
            </div>
            ${replyHtml}
          </div>
        `;
      }).join("");

      body.scrollTop = body.scrollHeight;
    }

    async function loadQuestions() {
      body.innerHTML = `<div id="aq-empty">Loading…</div>`;
      try {
        const supabase = await getSupabase();
        // RLS already restricts this to the logged-in user's own rows —
        // the .eq() here is just to keep the request itself lightweight.
        const { data, error } = await supabase
          .from(QUESTIONS_TABLE)
          .select("*")
          .eq("user_id", currentUser.id)
          .order("created_at", { ascending: true });
        if (error) {
          body.innerHTML = `<div id="aq-empty">Could not load your questions: ${escapeHtml(error.message)}</div>`;
          foot.style.display = "flex";
          loggedInAs.style.display = "block";
          loggedInAs.textContent = "Logged in as " + getDisplayName(currentUser);
          return;
        }
        renderMessages(data);
      } catch (err) {
        body.innerHTML = `<div id="aq-empty">Something went wrong loading your questions.</div>`;
      }
    }

    async function handleSend() {
      const text = input.value.trim();
      if (!text) return;
      if (!currentUser) {
        setStatus("Please log in first.", "error");
        return;
      }
      sendBtn.disabled = true;
      setStatus("Sending…", "info");
      try {
        const supabase = await getSupabase();
        const { error } = await supabase.from(QUESTIONS_TABLE).insert([
          {
            user_id: currentUser.id,
            user_name: getDisplayName(currentUser),
            question: text,
            // "status" is left unset so the database default ("waiting") applies.
            // "admin_reply" is left unset — only the admin page ever writes to it.
          },
        ]);
        if (error) {
          setStatus("Could not send: " + error.message, "error");
        } else {
          input.value = "";
          input.style.height = "auto";
          setStatus("", "");
          await loadQuestions();
        }
      } catch (err) {
        setStatus("Something went wrong. Please try again.", "error");
      } finally {
        sendBtn.disabled = false;
      }
    }

    async function refreshAuthAndLoad() {
      setStatus("", "");
      try {
        await ensureSupabaseClientLoaded();
        currentUser = await getCurrentUser();
      } catch (err) {
        body.innerHTML = `<div id="aq-empty">Could not connect. Please check your connection and try again.</div>`;
        return;
      }
      if (currentUser) {
        await loadQuestions();
      } else {
        renderLoggedOut();
      }
    }

    // If the host page has its own login modal, keep the widget's state in
    // sync with login/logout there too, without needing a page reload.
    const hostLoginForm = document.getElementById("modal-auth-form");
    const hostLogoutBtn = document.getElementById("modal-logout-btn");
    if (hostLoginForm) {
      hostLoginForm.addEventListener("submit", () => {
        if (hasOpenedOnce) setTimeout(refreshAuthAndLoad, 700);
      });
    }
    if (hostLogoutBtn) {
      hostLogoutBtn.addEventListener("click", () => {
        currentUser = null;
        if (hasOpenedOnce) setTimeout(refreshAuthAndLoad, 200);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
