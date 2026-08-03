function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function adminTheme() {
  const saved = localStorage.getItem("sv-theme");
  const theme = saved || (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  document.documentElement.dataset.theme = theme;
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = theme === "dark" ? "\u263E" : "\u263D";
}

function initAdminPanel() {
  const content = document.getElementById("admin-content");
  if (!content) return;

  if (!AUTH.user) {
    content.innerHTML = `
      <div class="upload-box">
        <h2>Please log in</h2>
        <p>Only the admin can manage videos.</p>
        <button class="auth-submit" style="margin:16px auto 0" id="goto-login">Log in</button>
      </div>`;
    const btn = document.getElementById("goto-login");
    if (btn) btn.addEventListener("click", () => openAuth("login"));
    return;
  }

  if (!AUTH.isAdmin()) {
    content.innerHTML = `
      <div class="upload-box">
        <h2>Admin only</h2>
        <p>Your account (${escapeHtml(AUTH.user.username)}) does not have admin permissions.</p>
        <p>Only the first registered account is the admin.</p>
      </div>`;
    return;
  }

  content.innerHTML = `
    <section id="panel-upload" class="admin-section">
      <h2>Upload a video</h2>
      <form id="upload-form">
        <label>Title (optional)</label>
        <input type="text" id="upload-title" placeholder="My video title" maxlength="180">
        <label>Video file</label>
        <input type="file" id="upload-file" accept=".mp4,.webm,.mkv,.avi,.mov,.m4v,.flv,.ts,.mp3,.ogg,.wav" required>
        <p class="form-error" id="upload-error"></p>
        <div class="progress-wrap" id="progress-wrap" style="display:none">
          <div class="progress-bar" id="progress-bar"></div>
          <span class="progress-text" id="progress-text">0%</span>
        </div>
        <button type="submit" class="auth-submit" id="upload-submit">Upload video</button>
      </form>
    </section>

    <section id="panel-embed" class="admin-section" style="display:none">
      <h2>Add an embedded video</h2>
      <p class="admin-hint">Paste an <code>&lt;iframe&gt;</code> embed code (from YouTube, Vimeo, etc.) or a direct video URL.</p>
      <form id="embed-form">
        <label>Title</label>
        <input type="text" id="embed-title" placeholder="Video title" maxlength="120">
        <label>Embed code or URL</label>
        <textarea id="embed-code" rows="5" placeholder='<iframe src="https://.../embed/xxx" allowfullscreen></iframe>'></textarea>
        <p class="form-error" id="embed-error"></p>
        <button type="submit" class="auth-submit" id="embed-submit">Add embed</button>
      </form>
    </section>

    <section id="panel-manage" class="admin-section" style="display:none">
      <h2>Manage videos</h2>
      <p class="admin-hint">Edit titles or delete videos.</p>
      <div class="manage-list" id="manage-list"></div>
    </section>`;

  setupAdminTabs();
  setupUploadForm();
  setupEmbedForm();
  loadManageList();
}

function setupAdminTabs() {
  document.querySelectorAll(".admin-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".admin-tab").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".admin-section").forEach((s) => (s.style.display = "none"));
      btn.classList.add("active");
      const panel = document.getElementById("panel-" + btn.dataset.tab);
      if (panel) panel.style.display = "block";
      if (btn.dataset.tab === "manage") loadManageList();
    });
  });
}

function setupUploadForm() {
  const form = document.getElementById("upload-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById("upload-file");
    const file = fileInput.files[0];
    if (!file) return;

    const err = document.getElementById("upload-error");
    const submit = document.getElementById("upload-submit");
    const wrap = document.getElementById("progress-wrap");
    const bar = document.getElementById("progress-bar");
    const text = document.getElementById("progress-text");
    err.textContent = "";
    submit.disabled = true;
    wrap.style.display = "block";

    const fd = new FormData();
    const t = document.getElementById("upload-title").value.trim();
    if (t) fd.append("title", t);
    fd.append("file", file, file.name);

    try {
      const res = await uploadWithProgress(fd, (p) => {
        bar.style.width = p + "%";
        text.textContent = p + "%";
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed");
      }
      text.textContent = "Done!";
      setTimeout(() => {
        window.location.href = "/";
      }, 800);
    } catch (error) {
      err.textContent = error.message;
      submit.disabled = false;
      wrap.style.display = "none";
    }
  });
}

function setupEmbedForm() {
  const form = document.getElementById("embed-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("embed-title").value.trim();
    const embed = document.getElementById("embed-code").value.trim();
    const err = document.getElementById("embed-error");
    const submit = document.getElementById("embed-submit");
    err.textContent = "";
    if (!embed) {
      err.textContent = "Paste an embed code or URL";
      return;
    }
    submit.disabled = true;
    try {
      const res = await fetch("/api/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + AUTH.token },
        body: JSON.stringify({ title, embed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      document.getElementById("embed-code").value = "";
      err.textContent = "";
      submit.disabled = false;
      alert("Embed added!");
      loadManageList();
    } catch (error) {
      err.textContent = error.message;
      submit.disabled = false;
    }
  });
}

async function loadManageList() {
  const box = document.getElementById("manage-list");
  if (!box) return;
  const res = await fetch("/api/videos");
  const videos = await res.json();
  if (!videos.length) {
    box.innerHTML = `<p class="admin-hint">No videos yet.</p>`;
    return;
  }
  box.innerHTML = videos.map((v) => `
    <div class="manage-row" data-url="${v.url}" data-kind="${v.kind}" data-id="${v.id || ""}">
      ${v.kind === "embed"
        ? `<div class="m-thumb m-thumb-embed">&#9654;</div>`
        : `<img class="m-thumb" src="${v.thumb}" onerror="this.style.visibility='hidden'">`}
      <input class="m-title" value="${escapeHtml(v.title)}" maxlength="120">
      <span class="m-meta">${v.ext}</span>
      <button class="m-save">Save</button>
      <button class="m-del">Delete</button>
    </div>`)
    .join("");

  box.querySelectorAll(".m-save").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest(".manage-row");
      const title = row.querySelector(".m-title").value.trim();
      if (!title) return;
      btn.disabled = true;
      try {
        const payload = row.dataset.kind === "embed"
          ? { id: row.dataset.id, title }
          : { url: row.dataset.url, title };
        const res = await fetch("/api/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + AUTH.token },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        loadManageList();
      } catch (error) {
        btn.disabled = false;
        alert(error.message);
      }
    });
  });

  box.querySelectorAll(".m-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest(".manage-row");
      if (!confirm(`Delete "${row.querySelector(".m-title").value}"?`)) return;
      try {
        const payload = row.dataset.kind === "embed"
          ? { id: row.dataset.id }
          : { url: row.dataset.url };
        const res = await fetch("/api/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + AUTH.token },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        loadManageList();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function uploadWithProgress(fd, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.setRequestHeader("Authorization", "Bearer " + AUTH.token);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => resolve({ ok: xhr.status < 400, json: () => JSON.parse(xhr.responseText || "{}") });
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(fd);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  adminTheme();
  const t = document.getElementById("theme-toggle");
  if (t) {
    t.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      localStorage.setItem("sv-theme", next);
      adminTheme();
    });
  }
  if (AUTH.user) {
    initAdminPanel();
  } else {
    document.addEventListener("sv-auth", () => initAdminPanel(), { once: true });
  }
  document.addEventListener("sv-login", () => initAdminPanel());
});
