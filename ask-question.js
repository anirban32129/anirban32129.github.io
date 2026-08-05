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
//    This script never creates the table and never writes to "admin_reply"
//    or "status" — only your admin page does that. It DOES delete rows
//    (see below), scoped to the logged-in user's own rows.
//  - No realtime subscriptions: loads on open, reloads after sending.
//  - Each of the student's own questions gets a small delete (🗑) button.
//    Clicking it shows an inline "Are you sure?" confirmation before
//    anything is deleted. The actual delete request is also filtered to
//    `user_id = currentUser.id`, but the real security boundary is the
//    "Students can delete their own questions" RLS policy on the
//    "Questions" table — this file deliberately does not rely on hiding
//    the button as its only protection.

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
        // Delete button is only ever rendered for rows belonging to the
        // currently logged-in user (loadQuestions() already fetches only
        // currentUser.id's own rows, and this check is a second,
        // belt-and-suspenders confirmation of that). Real enforcement
        // against deleting someone else's row happens in Supabase RLS,
        // not here — see the "Students can delete their own questions"
        // RLS policy.
        const canDelete = row.user_id === currentUser.id;
        return `
          <div class="aq-msg" data-id="${row.id}">
            <div class="aq-q">${escapeHtml(row.question)}</div>
            <div class="aq-meta">
              ${canDelete ? `<button class="aq-delete-btn" data-id="${row.id}" aria-label="Delete this question" title="Delete">🗑</button>` : ""}
              <span class="aq-badge ${badgeClass}">${badgeText}</span>
              <span>${formatDate(row.created_at)}</span>
            </div>
            ${replyHtml}
            ${canDelete ? `
              <div class="aq-confirm" id="aq-confirm-${row.id}">
                <div class="aq-confirm-text">Are you sure you want to delete this comment?</div>
                <div class="aq-confirm-actions">
                  <button class="aq-confirm-cancel" data-id="${row.id}" type="button">Cancel</button>
                  <button class="aq-confirm-delete" data-id="${row.id}" type="button">Delete</button>
                </div>
              </div>
            ` : ""}
          </div>
        `;
      }).join("");

      body.scrollTop = body.scrollHeight;
    }

    // ---------- Delete a question (own rows only) ----------
    // Event delegation: bound once, so it keeps working after body.innerHTML
    // is replaced on every render — no per-row re-binding needed.
    body.addEventListener("click", (e) => {
      const delBtn = e.target.closest(".aq-delete-btn");
      if (delBtn) {
        showDeleteConfirm(delBtn.dataset.id);
        return;
      }
      const cancelBtn = e.target.closest(".aq-confirm-cancel");
      if (cancelBtn) {
        hideDeleteConfirm(cancelBtn.dataset.id);
        return;
      }
      const confirmBtn = e.target.closest(".aq-confirm-delete");
      if (confirmBtn) {
        handleDeleteConfirmed(confirmBtn.dataset.id);
        return;
      }
    });

    function showDeleteConfirm(id) {
      const confirmEl = document.getElementById(`aq-confirm-${id}`);
      if (confirmEl) confirmEl.classList.add("aq-confirm-open");
      document.querySelectorAll(`.aq-delete-btn[data-id="${id}"]`).forEach((b) => (b.style.visibility = "hidden"));
    }

    function hideDeleteConfirm(id) {
      const confirmEl = document.getElementById(`aq-confirm-${id}`);
      if (confirmEl) confirmEl.classList.remove("aq-confirm-open");
      document.querySelectorAll(`.aq-delete-btn[data-id="${id}"]`).forEach((b) => (b.style.visibility = ""));
    }

    async function handleDeleteConfirmed(id) {
      if (!currentUser) return;
      const confirmBtn = document.querySelector(`.aq-confirm-delete[data-id="${id}"]`);
      const cancelBtn = document.querySelector(`.aq-confirm-cancel[data-id="${id}"]`);
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Deleting…";
      }
      if (cancelBtn) cancelBtn.disabled = true;

      try {
        const supabase = await getSupabase();
        // The .eq("user_id", ...) here is defense-in-depth, matching what
        // the RLS policy enforces server-side — it is NOT what stops a
        // student from deleting someone else's row (RLS does that even if
        // this line were removed or this whole file were rewritten by the
        // person using browser dev tools).
        const { error, count } = await supabase
          .from(QUESTIONS_TABLE)
          .delete({ count: "exact" })
          .eq("id", id)
          .eq("user_id", currentUser.id);

        if (error || count === 0) {
          setStatus("Unable to delete comment. Please try again.", "error");
          if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = "Delete";
          }
          if (cancelBtn) cancelBtn.disabled = false;
          return;
        }

        setStatus("Comment deleted successfully.", "success");
        const msgEl = document.querySelector(`.aq-msg[data-id="${id}"]`);
        if (msgEl) msgEl.remove();
        if (!body.querySelector(".aq-msg")) {
          body.innerHTML = `<div id="aq-empty">No questions yet. Ask your first question below!</div>`;
        }
      } catch (err) {
        setStatus("Unable to delete comment. Please try again.", "error");
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = "Delete";
        }
        if (cancelBtn) cancelBtn.disabled = false;
      }
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
