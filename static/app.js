const CATEGORIES = [
  "Action", "Comedy", "Music", "Sports", "Gaming",
  "Nature", "Tech", "Tutorials", "Documentary", "Other",
];

const state = {
  videos: [],
  query: "",
  category: "",
  sort: "newest",
  layout: "grid",
};

function applyTheme() {
  const saved = localStorage.getItem("sv-theme");
  const theme = saved || (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  document.documentElement.dataset.theme = theme;
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = theme === "dark" ? "\u263E" : "\u263D";
}

function applyLayout() {
  const layout = localStorage.getItem("sv-layout") || "grid";
  state.layout = layout;
  const grid = document.getElementById("video-grid");
  if (grid) grid.classList.toggle("list-layout", layout === "list");
  const btn = document.getElementById("layout-toggle");
  if (btn) btn.textContent = layout === "grid" ? "\u2261" : "\u25A6";
}

function guessCategory(title) {
  const t = title.toLowerCase();
  if (/(gaming|game|gameplay)/.test(t)) return "Gaming";
  if (/(music|song|audio|concert|live set)/.test(t)) return "Music";
  if (/(tutorial|how to|guide|learn|course)/.test(t)) return "Tutorials";
  if (/(sport|match|fight|game highlights)/.test(t)) return "Sports";
  if (/(nature|wildlife|documentary|doc)/.test(t)) return "Documentary";
  if (/(tech|review|unboxing|gadget|phone|android)/.test(t)) return "Tech";
  if (/(action|comedy|movie|film|clip|trailer)/.test(t)) return "Action";
  return "Other";
}

async function loadVideos() {
  const res = await fetch("/api/videos");
  state.videos = await res.json();
}

function catCount(name) {
  return state.videos.filter((v) => guessCategory(v.title) === name).length;
}

function renderCategories(active) {
  const bar = document.getElementById("category-bar");
  const side = document.getElementById("sidebar-cats");
  if (!bar) return;

  const chips = CATEGORIES.map((c) => {
    const count = catCount(c);
    const label = count ? `${c} (${count})` : c;
    const cls = c === active ? "cat active" : "cat";
    return `<button class="${cls}" data-cat="${c}">${label}</button>`;
  }).join("");
  bar.innerHTML = `<button class="cat${!active ? " active" : ""}" data-cat="">All</button>` + chips;

  bar.querySelectorAll(".cat").forEach((el) => {
    el.addEventListener("click", () => {
      state.category = el.dataset.cat;
      state.query = "";
      document.getElementById("search-input").value = "";
      render();
    });
  });

  if (side) {
    side.innerHTML =
      `<li><a href="/?p=videos"><span>All</span><span>${state.videos.length}</span></a></li>` +
      CATEGORIES.filter((c) => catCount(c) > 0)
        .map((c) => `<li><a href="/?p=categories"><span>${c}</span><span>${catCount(c)}</span></a></li>`)
        .join("");
  }
}

function filtered() {
  let list = state.videos;
  if (state.category) list = list.filter((v) => guessCategory(v.title) === state.category);
  if (state.query) {
    const q = state.query.toLowerCase();
    list = list.filter((v) => v.title.toLowerCase().includes(q));
  }
  switch (state.sort) {
    case "name":
      list = [...list].sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "size-desc":
      list = [...list].sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
      break;
    case "size-asc":
      list = [...list].sort((a, b) => (a.bytes || 0) - (b.bytes || 0));
      break;
    default:
      list = [...list].sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
  }
  return list;
}

function cardHTML(v, index) {
  return `
  <div class="video-card" data-i="${index}">
    <div class="thumb">
      <img src="${v.thumb}" alt="${v.title}" loading="lazy" onerror="this.style.opacity=0.4">
      <span class="play-overlay"><span>&#9654;</span></span>
    </div>
    <div class="info">
      <div class="title">${escapeHtml(v.title)}</div>
      <div class="meta">
        <span class="ext">${v.ext}</span>
        <span>${v.size}</span>
      </div>
    </div>
  </div>`;
}

function render() {
  const grid = document.getElementById("video-grid");
  const empty = document.getElementById("empty");
  const title = document.getElementById("section-title");
  if (!grid) return;

  const list = filtered();
  const label = state.query
    ? `Results for "${state.query}"`
    : state.category
      ? `${state.category} Videos`
      : "Trending Videos";

  if (title) title.textContent = label;
  const countEl = document.getElementById("result-count");
  if (countEl) countEl.textContent = `${list.length} video${list.length === 1 ? "" : "s"}`;

  grid.innerHTML = list.map((v) => cardHTML(v, v.url)).join("");
  empty.style.display = list.length ? "none" : "block";

  grid.querySelectorAll(".video-card").forEach((el) => {
    el.addEventListener("click", () => {
      const u = el.dataset.i;
      const idx = list.findIndex((x) => x.url === u);
      const listParam = encodeURIComponent(
        list.slice(idx + 1).slice(0, 12).map((x) => x.title).join("\u0001")
      );
      const t = encodeURIComponent(list[idx].title);
      window.location.href = `/watch.html?v=${encodeURIComponent(u)}&t=${t}&list=${listParam}`;
    });
  });

  renderCategories(state.category);
  loadSidebarRelated();
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function loadSidebarRelated() {
  const listEl = document.getElementById("related-list");
  if (!listEl) return;

  const params = new URLSearchParams(window.location.search);
  const listParam = params.get("list");
  const currentUrl = params.get("v");
  const titles = listParam ? listParam.split("\u0001").filter(Boolean) : [];

  const rels = titles.map((t) => state.videos.find((v) => v.title === t)).filter(Boolean);
  const shown = rels.length ? rels : state.videos.slice(0, 10);

  if (shown.length) {
    listEl.innerHTML = shown
      .filter((v) => v.url !== currentUrl)
      .slice(0, 10)
      .map((v) => `
        <li class="related-item" data-u="${v.url}" data-t="${v.title}">
          <img src="${v.thumb}" onerror="this.style.visibility='hidden'">
          <div>
            <div class="r-title">${escapeHtml(v.title)}</div>
            <div class="r-meta">${v.size} &middot; ${v.ext}</div>
          </div>
        </li>`)
      .join("");
    listEl.querySelectorAll(".related-item").forEach((el) => {
      el.addEventListener("click", () => {
        const u = encodeURIComponent(el.dataset.u);
        const t = encodeURIComponent(el.dataset.t);
        window.location.href = `/watch.html?v=${u}&t=${t}`;
      });
    });
  }
}

function setupWatchPage() {
  const player = document.getElementById("player");
  if (!player) return;

  const params = new URLSearchParams(window.location.search);
  const url = params.get("v");
  const title = params.get("t");
  const titleEl = document.getElementById("video-title");

  if (!url) {
    titleEl.textContent = "No video selected";
    return;
  }
  if (title) titleEl.textContent = decodeURIComponent(title);
  player.src = decodeURIComponent(url);

  player.addEventListener("loadedmetadata", () => {
    const dur = player.duration;
    if (Number.isFinite(dur)) {
      const m = Math.floor(dur / 60);
      const s = Math.floor(dur % 60).toString().padStart(2, "0");
      document.getElementById("video-size").textContent = `${m}:${s}`;
    }
  });

  document.title = (title ? decodeURIComponent(title) : "Watch") + " \u2014 StreamVibe";
  loadSidebarRelated();
}

function handleSearch() {
  const input = document.getElementById("search-input");
  if (!input) return;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSearch();
  });
  document.getElementById("search-btn").addEventListener("click", doSearch);
  function doSearch() {
    state.query = input.value.trim();
    state.category = "";
    if (location.pathname.endsWith("watch.html")) {
      window.location.href = "/?p=home";
      return;
    }
    render();
  }
}

function initUploadPage() {
  const title = document.getElementById("section-title");
  if (!title) return;
  title.textContent = "Upload";
  const grid = document.getElementById("video-grid");
  const empty = document.getElementById("empty");
  if (empty) empty.style.display = "none";
  const countEl = document.getElementById("result-count");
  if (countEl) countEl.textContent = "";

  if (!AUTH.user) {
    grid.innerHTML = `
      <div class="upload-box" style="grid-column:1/-1">
        <h2>Please log in</h2>
        <p>Only the admin can upload videos.</p>
        <button class="auth-submit" style="margin:16px auto 0" id="goto-login">Log in</button>
      </div>`;
    const btn = document.getElementById("goto-login");
    if (btn) btn.addEventListener("click", () => openAuth("login"));
    return;
  }

  if (!AUTH.isAdmin()) {
    grid.innerHTML = `
      <div class="upload-box" style="grid-column:1/-1">
        <h2>Admin only</h2>
        <p>Your account (${escapeHtml(AUTH.user.username)}) does not have admin permissions.</p>
        <p>Only the first registered account is the admin.</p>
      </div>`;
    return;
  }

  grid.innerHTML = `
    <div class="upload-box" style="grid-column:1/-1">
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
    </div>`;

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
      submit.disabled = false;
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

function setupControls() {
  const sortSel = document.getElementById("sort-select");
  if (sortSel) {
    sortSel.value = state.sort;
    sortSel.addEventListener("change", () => {
      state.sort = sortSel.value;
      render();
    });
  }

  const themeBtn = document.getElementById("theme-toggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      localStorage.setItem("sv-theme", next);
      applyTheme();
    });
  }

  const layoutBtn = document.getElementById("layout-toggle");
  if (layoutBtn) {
    layoutBtn.addEventListener("click", () => {
      const next = state.layout === "grid" ? "list" : "grid";
      localStorage.setItem("sv-layout", next);
      state.layout = next;
      applyLayout();
    });
  }
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const page = params.get("p");

  applyTheme();
  applyLayout();
  setupControls();

  await loadVideos();

  if (page === "upload") {
    renderCategories();
    if (AUTH.user) {
      initUploadPage();
    } else {
      document.addEventListener("sv-auth", () => initUploadPage(), { once: true });
    }
  } else if (window.location.pathname.endsWith("watch.html")) {
    setupWatchPage();
  } else {
    render();
  }

  handleSearch();
}

init();
