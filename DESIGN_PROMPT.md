# StreamVibe Website Design Prompt

Copy the prompt below and use it with any AI coding tool to recreate or modify this design.

---

## Prompt

Build a self-hosted video streaming website with a dark, adult-video-platform style UI (grid of video cards, category filter bar, sidebar, dedicated watch page, standalone admin console). Must run with zero external dependencies (Python standard library backend, vanilla HTML/CSS/JS frontend) so it works on a phone via Termux.

### Design language
- Dark theme: background `#0e0e0e`, surfaces `#161616` / `#1d1d1d`, borders `#2a2a2a`.
- Accent: orange `#ff9000`; use a gradient `linear-gradient(135deg, #ff9000, #ff2d55)` for logo, buttons, active states and progress bars.
- Full light theme via CSS variables under `:root[data-theme="light"]`, toggled by a header button, persisted in `localStorage`.
- Rounded corners (~6-12px), subtle hover lift + shadow on cards, smooth color transitions.

### Layout components
1. **Sticky header**: orange gradient logo square + "Stream" wordmark; nav links (Home / Videos / Categories); centered search input with orange submit button; right side action icons (layout toggle, theme toggle) plus login/signup buttons that swap for a username badge + logout when logged in.
2. **Category pill bar**: horizontally scrollable filter chips ("All", "Action", "Comedy", "Music", "Sports", "Gaming", "Nature", "Tech", "Tutorials", "Documentary", "Other"), active chip filled orange.
3. **Toolbar**: sort dropdown (Newest / Name / Size asc-desc) and result count.
4. **Video grid**: responsive `repeat(auto-fill, minmax(230px, 1fr))`. Each card = 16:9 thumbnail with play overlay on hover, duration/ext badge, title (2-line clamp), size + format meta. Embed videos show a gradient placeholder with a play icon and "EMBED" badge instead of an image.
5. **List layout toggle**: same cards rendered as horizontal rows (thumb left, info right), toggled from the header.
6. **Sidebar** (sticky, hidden on mobile): categories with counts, related videos list.
7. **Watch page**: full-width 16:9 player (native `<video>` with HTTP Range seeking, or an iframe for embed videos), title, meta row, and a related-videos sidebar that persists the "up next" list via URL params.
8. **Standalone Admin Console** at `/admin`: a separate layout with its own sidebar (brand, nav: Upload file / Add embed / Manage videos, "Go to site" link, user area) — completely detached from the streaming site's header/nav. Main site never shows any "Admin" text to visitors; the Admin link appears only for logged-in admins.
9. **Auth modal**: centered dialog with Log in / Sign up tabs, username + password, error line; accessible from any page.

### Features
- Signup/login/logout with PBKDF2-hashed passwords; first registered user becomes admin; 7-day bearer-token sessions.
- Admin-only actions: file upload (streaming multipart, progress bar, optional custom title), add iframe embed videos, edit titles, delete videos.
- Auto thumbnail generation from video files via ffmpeg (cached, regenerated on change).
- HTTP Range support for video seeking.
- Mobile responsive at all breakpoints; sidebar collapses on small screens.

### Tech constraints
- Backend: Python standard library only (`http.server`), no pip packages. Endpoints: `GET /api/videos`, `GET/POST /api/embed`, `POST /api/signup|login|logout|upload|edit|delete`, `GET /api/me`. JSON storage under `data/`.
- Frontend: vanilla JS modules `app.js` (user site), `auth.js` (shared auth), `admin.js` (admin console); no frameworks.

### File structure
```
server.py, static/{index.html, watch.html, admin.html, styles.css, app.js, auth.js, admin.js}, videos/, data/
```

---

## Usage tips

- Paste the prompt into any AI tool and it can recreate the same design from scratch.
- To tweak a detail (e.g. "make the accent green", "add a dark-mode-only color"), add one line at the end of the prompt describing the change.
- Save a copy alongside your project so future AI sessions can match the existing design.
