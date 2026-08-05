// login-modal.js
// Handles the login/signup popup modal on the homepage.
// Requires supabase-client.js to be loaded first (for signIn, signUp, signOut, getCurrentUser).

(function () {
  let mode = "login"; // or "signup"

  const toggleBtn = document.getElementById("login-toggle-btn");
  const overlay = document.getElementById("login-overlay");
  const closeBtn = document.getElementById("login-close-btn");
  const authView = document.getElementById("modal-auth-view");
  const appView = document.getElementById("modal-app-view");
  const form = document.getElementById("modal-auth-form");
  const formTitle = document.getElementById("modal-form-title");
  const submitBtn = document.getElementById("modal-submit-btn");
  const googleBtn = document.getElementById("modal-google-btn");
  const toggleText = document.getElementById("modal-toggle-text");
  const toggleLink = document.getElementById("modal-toggle-link");
  const messageEl = document.getElementById("modal-message");
  const userEmailEl = document.getElementById("modal-user-email");
  const logoutBtn = document.getElementById("modal-logout-btn");
  const forgotLink = document.getElementById("modal-forgot-link");
  const forgotView = document.getElementById("modal-forgot-view");
  const forgotForm = document.getElementById("modal-forgot-form");
  const forgotMessageEl = document.getElementById("modal-forgot-message");
  const forgotBackLink = document.getElementById("modal-forgot-back");

  const deleteAccountBtn = document.getElementById("modal-delete-account-btn");
  const deleteView = document.getElementById("modal-delete-view");
  const deleteConfirmInput = document.getElementById("modal-delete-confirm-input");
  const deleteConfirmBtn = document.getElementById("modal-delete-confirm-btn");
  const deleteCancelBtn = document.getElementById("modal-delete-cancel-btn");
  const deleteMessageEl = document.getElementById("modal-delete-message");

  let isLoggedIn = false;

  function openModal() {
    overlay.style.display = "flex";
  }

  function closeModal() {
    overlay.style.display = "none";
    // If the user closes the modal mid-delete-flow, don't leave the
    // confirmation view showing (with a live "DELETE" typed in) next time
    // they reopen it.
    if (deleteView.style.display === "block") {
      deleteView.style.display = "none";
      appView.style.display = "block";
      resetDeleteView();
    }
  }

  toggleBtn.addEventListener("click", openModal);
  closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  function showMessage(text, type) {
    messageEl.textContent = text;
    messageEl.style.color = type === "error" ? "#ff3d81" : type === "success" ? "#4ade80" : "var(--dim)";
  }

  function setMode(newMode) {
    mode = newMode;
    showMessage("", "");
    if (mode === "login") {
      formTitle.textContent = "Log In";
      submitBtn.textContent = "Log In";
      toggleText.textContent = "Don't have an account?";
      toggleLink.textContent = "Sign up";
    } else {
      formTitle.textContent = "Sign Up";
      submitBtn.textContent = "Sign Up";
      toggleText.textContent = "Already have an account?";
      toggleLink.textContent = "Log in";
    }
  }

  toggleLink.addEventListener("click", () => {
    setMode(mode === "login" ? "signup" : "login");
  });

  function showForgotMessage(text, type) {
    forgotMessageEl.textContent = text;
    forgotMessageEl.style.color = type === "error" ? "#ff3d81" : type === "success" ? "#4ade80" : "var(--dim)";
  }

  forgotLink.addEventListener("click", () => {
    authView.style.display = "none";
    forgotView.style.display = "block";
    showForgotMessage("", "");
  });

  forgotBackLink.addEventListener("click", () => {
    forgotView.style.display = "none";
    authView.style.display = "block";
    forgotForm.reset();
  });

  forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("modal-forgot-email").value.trim();
    const btn = document.getElementById("modal-forgot-submit-btn");
    btn.disabled = true;
    showForgotMessage("", "");
    try {
      const { error } = await resetPassword(email);
      if (error) {
        showForgotMessage(error.message, "error");
      } else {
        showForgotMessage("Check your email for a reset link.", "success");
      }
    } catch (err) {
      showForgotMessage("Something went wrong. Try again.", "error");
    } finally {
      btn.disabled = false;
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("modal-email").value.trim();
    const password = document.getElementById("modal-password").value;

    submitBtn.disabled = true;
    showMessage("", "");

    try {
      if (mode === "login") {
        const { data, error } = await signIn(email, password);
        if (error) {
          showMessage(error.message, "error");
        } else {
          showLoggedIn(data.user);
        }
      } else {
        const { data, error } = await signUp(email, password);
        if (error) {
          showMessage(error.message, "error");
        } else {
          showMessage("Check your email to confirm your account.", "success");
        }
      }
    } catch (err) {
      showMessage("Something went wrong. Try again.", "error");
    } finally {
      submitBtn.disabled = false;
    }
  });

  googleBtn.addEventListener("click", async () => {
    googleBtn.disabled = true;
    showMessage("", "");
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        showMessage(error.message, "error");
        googleBtn.disabled = false;
      }
      // On success Supabase redirects the browser to Google, so we leave
      // the button disabled and don't reset it here.
    } catch (err) {
      showMessage("Something went wrong. Try again.", "error");
      googleBtn.disabled = false;
    }
  });

  logoutBtn.addEventListener("click", async () => {
    await signOut();
    setLoggedOut();
    closeModal();
  });

  function showDeleteMessage(text, type) {
    deleteMessageEl.textContent = text;
    deleteMessageEl.style.color = type === "error" ? "#ff3d81" : type === "success" ? "#4ade80" : "var(--dim)";
  }

  function resetDeleteView() {
    deleteConfirmInput.value = "";
    deleteConfirmBtn.disabled = true;
    deleteConfirmBtn.textContent = "Permanently Delete My Account";
    deleteCancelBtn.disabled = false;
    deleteConfirmInput.disabled = false;
    showDeleteMessage("", "");
  }

  deleteAccountBtn.addEventListener("click", () => {
    appView.style.display = "none";
    resetDeleteView();
    deleteView.style.display = "block";
  });

  deleteCancelBtn.addEventListener("click", () => {
    deleteView.style.display = "none";
    appView.style.display = "block";
  });

  deleteConfirmInput.addEventListener("input", () => {
    deleteConfirmBtn.disabled = deleteConfirmInput.value.trim() !== "DELETE";
  });

  deleteConfirmBtn.addEventListener("click", async () => {
    // Belt-and-suspenders: only proceed if the confirmation text is exact,
    // even though the button is disabled otherwise.
    if (deleteConfirmInput.value.trim() !== "DELETE") return;

    deleteConfirmBtn.disabled = true;
    deleteCancelBtn.disabled = true;
    deleteConfirmInput.disabled = true;
    deleteConfirmBtn.textContent = "Deleting…";
    showDeleteMessage("Deleting your account. Please wait…", "info");

    try {
      const { error } = await deleteAccount();

      if (error) {
        showDeleteMessage(error.message || "Could not delete your account. Try again.", "error");
        deleteConfirmBtn.disabled = false;
        deleteCancelBtn.disabled = false;
        deleteConfirmInput.disabled = false;
        deleteConfirmBtn.textContent = "Permanently Delete My Account";
        return;
      }

      showDeleteMessage("Your account has been deleted. Signing you out…", "success");

      // Best-effort: the account is already gone server-side, so this call
      // mainly exists to let the Supabase client tidy up its own state.
      try {
        await signOut();
      } catch (e) {
        /* account no longer exists server-side — safe to ignore */
      }
      clearSupabaseAuthStorage();

      setTimeout(() => {
        window.location.href = "index.html";
      }, 1200);
    } catch (err) {
      showDeleteMessage("Something went wrong. Try again.", "error");
      deleteConfirmBtn.disabled = false;
      deleteCancelBtn.disabled = false;
      deleteConfirmInput.disabled = false;
      deleteConfirmBtn.textContent = "Permanently Delete My Account";
    }
  });

  function showLoggedIn(user) {
    isLoggedIn = true;
    authView.style.display = "none";
    forgotView.style.display = "none";
    appView.style.display = "block";
    userEmailEl.textContent = user.email;
    toggleBtn.textContent = "👤 Account";
    toggleBtn.title = user.email;
  }

  function setLoggedOut() {
    isLoggedIn = false;
    appView.style.display = "none";
    forgotView.style.display = "none";
    deleteView.style.display = "none";
    authView.style.display = "block";
    form.reset();
    setMode("login");
    toggleBtn.textContent = "Login";
    toggleBtn.removeAttribute("title");
  }

  // If already logged in, reflect that state (modal still stays closed until clicked)
  (async () => {
    const user = await getCurrentUser();
    if (user) showLoggedIn(user);
  })();
})();
