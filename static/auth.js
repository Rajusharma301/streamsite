const AUTH = {
  token: localStorage.getItem("sv-token") || "",
  user: null,

  async me() {
    if (!this.token) return null;
    try {
      const res = await fetch("/api/me", { headers: { Authorization: "Bearer " + this.token } });
      const data = await res.json();
      this.user = data.username ? data : null;
    } catch (e) {
      this.user = null;
    }
    return this.user;
  },

  async signup(username, password) {
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Signup failed");
    this.token = data.token;
    localStorage.setItem("sv-token", this.token);
    this.user = data;
    return data;
  },

  async login(username, password) {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");
    this.token = data.token;
    localStorage.setItem("sv-token", this.token);
    this.user = data;
    return data;
  },

  async logout() {
    if (this.token) {
      try {
        await fetch("/api/logout", { method: "POST", headers: { Authorization: "Bearer " + this.token } });
      } catch (e) {}
    }
    this.token = "";
    this.user = null;
    localStorage.removeItem("sv-token");
  },

  isAdmin() {
    return !!(this.user && this.user.is_admin);
  },

  renderHeader() {
    const el = document.getElementById("user-actions");
    if (!el) return;

    const themeBtn = el.querySelector("#theme-toggle");
    const layoutBtn = el.querySelector("#layout-toggle");
    el.innerHTML = "";

    if (layoutBtn) el.appendChild(layoutBtn);
    if (themeBtn) el.appendChild(themeBtn);

    if (this.user) {
      const badge = document.createElement("span");
      badge.className = "user-badge";
      badge.textContent = this.user.username + (this.user.is_admin ? " (admin)" : "");
      el.appendChild(badge);

      if (this.user.is_admin) {
        const up = document.createElement("a");
        up.className = "nav-link-btn";
        up.href = "/?p=upload";
        up.textContent = "Admin";
        el.appendChild(up);
      }

      const out = document.createElement("button");
      out.className = "logout-btn";
      out.textContent = "Logout";
      out.addEventListener("click", async () => {
        await this.logout();
        this.renderHeader();
        if (window.location.pathname.endsWith("watch.html")) return;
        const params = new URLSearchParams(window.location.search);
        if (params.get("p") === "upload") {
          window.location.href = "/";
          return;
        }
        window.location.reload();
      });
      el.appendChild(out);
    } else {
      const login = document.createElement("span");
      login.className = "login-btn";
      login.textContent = "Log in";
      login.addEventListener("click", () => openAuth("login"));
      el.appendChild(login);

      const signup = document.createElement("span");
      signup.className = "signup-btn";
      signup.textContent = "Sign up";
      signup.addEventListener("click", () => openAuth("signup"));
      el.appendChild(signup);
    }
  },
};

let authMode = "login";

function openAuth(mode) {
  authMode = mode;
  const modal = document.getElementById("auth-modal");
  const err = document.getElementById("auth-error");
  const submit = document.getElementById("auth-submit");
  if (err) err.textContent = "";
  document.getElementById("tab-login").classList.toggle("active", mode === "login");
  document.getElementById("tab-signup").classList.toggle("active", mode === "signup");
  submit.textContent = mode === "login" ? "Log in" : "Create account";
  const pw = document.getElementById("auth-password");
  pw.autocomplete = mode === "login" ? "current-password" : "new-password";
  modal.style.display = "flex";
  document.getElementById("auth-username").focus();
}

function closeAuth() {
  document.getElementById("auth-modal").style.display = "none";
}

function setupAuthModal() {
  const modal = document.getElementById("auth-modal");
  if (!modal) return;

  document.getElementById("tab-login").addEventListener("click", () => openAuth("login"));
  document.getElementById("tab-signup").addEventListener("click", () => openAuth("signup"));
  document.getElementById("auth-close").addEventListener("click", closeAuth);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeAuth();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAuth();
  });

  document.getElementById("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("auth-username").value.trim();
    const password = document.getElementById("auth-password").value;
    const err = document.getElementById("auth-error");
    const submit = document.getElementById("auth-submit");
    err.textContent = "";
    submit.disabled = true;
    try {
      if (authMode === "login") {
        await AUTH.login(username, password);
      } else {
        await AUTH.signup(username, password);
      }
      closeAuth();
      AUTH.renderHeader();
      const params = new URLSearchParams(window.location.search);
      if (params.get("p") === "upload") {
        initAdminPanel();
      }
    } catch (error) {
      err.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupAuthModal();
  AUTH.me().then(() => {
    AUTH.renderHeader();
    document.dispatchEvent(new CustomEvent("sv-auth"));
  });
});
