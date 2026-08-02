const CATEGORIES = [
  "Action", "Comedy", "Music", "Sports", "Gaming",
  "Nature", "Tech", "Tutorials", "Documentary", "Other",
];

const state = {
  videos: [],
  query: "",
  category: "",
};

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
  return list;
}

function cardHTML(v, index) {
  const cat = guessCategory(v.title);
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
  grid.innerHTML = list.map((v, i) => cardHTML(v, i)).join("");
  empty.style.display = list.length ? "none" : "block";

  grid.querySelectorAll(".video-card").forEach((el) => {
    el.addEventListener("click", () => {
      const v = state.videos[Number(el.dataset.i)];
      const idx = list.indexOf(v);
      const listParam = encodeURIComponent(
        list.slice(idx + 1).slice(0, 12).map((x) => x.title).join("\u0001")
      );
      const u = encodeURIComponent(v.url);
      const t = encodeURIComponent(v.title);
      window.location.href = `/watch.html?v=${u}&t=${t}&list=${listParam}`;
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

function renderUploadPage() {
  const title = document.getElementById("section-title");
  if (!title) return;
  title.textContent = "Upload";
  const grid = document.getElementById("video-grid");
  grid.innerHTML = `
    <div class="upload-box" style="grid-column:1/-1">
      <h2>How to add videos</h2>
      <p>Put your video files directly into the <code>videos/</code> folder on your phone.</p>
      <p>Supported: mp4, webm, mkv, avi, mov, m4v, flv, ts, mp3, ogg, wav</p>
      <p>Then refresh this page &mdash; they appear automatically.</p>
    </div>`;
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const page = params.get("p");

  await loadVideos();

  if (page === "upload") {
    renderCategories();
    renderUploadPage();
  } else if (window.location.pathname.endsWith("watch.html")) {
    setupWatchPage();
  } else {
    render();
  }

  handleSearch();
}

init();
