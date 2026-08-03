# StreamVibe

A self-hosted video streaming website with a dark, media-site style UI (video grid, category bar, sidebar, watch page). No dependencies — runs with Python standard library, so it works great on Termux.

## Run on Termux (phone)

```bash
# 1. Install Python and ffmpeg (ffmpeg is only needed for auto thumbnails)
pkg update
pkg install -y python ffmpeg

# 2. Copy this project to your phone, then start the server
python server.py
```

Open a browser on your phone (or any device on the same Wi-Fi) and go to:

```
http://localhost:8000
```

To access from another device, use your phone's LAN IP:

```
http://<your-phone-ip>:8000
```

Find your phone IP in Termux with:

```bash
ifconfig
# or
ip addr show
```

## Adding videos

Put any video/audio file into the `videos/` folder and refresh the page — they show up automatically.

Supported formats: `mp4, webm, mkv, avi, mov, m4v, flv, ts, mp3, ogg, wav`

Example:

```bash
# Termux storage access
termux-setup-storage
cp /sdcard/DCIM/your_video.mp4 ~/streamsite/videos/
```

## Features

- HTTP Range support — HTML5 video seeking and scrubbing works
- Auto thumbnail generation from video files (needs ffmpeg)
- Search bar and category filter
- Watch page with related-videos sidebar
- Mobile responsive grid layout
- Dark/light theme toggle, grid/list layout toggle, sort options
- **Signup / Login / Logout** with password hashing
- **Admin upload** — the first registered account becomes admin and can upload videos through the browser

## Accounts

- First user to register becomes the **admin**.
- Admin can upload videos from the Upload page.
- Passwords are hashed (PBKDF2) and stored in `data/users.json` (never committed).
- Sessions last 7 days.

## Uploading via web (admin)

1. Click **Sign up** and register — the first account is the admin.
2. Click **Admin** in the header.
3. **Upload file** tab — pick a video file, optionally set a title, upload.
4. **Add embed** tab — paste an `<iframe>` embed code (YouTube, Vimeo, etc.) or a direct URL to show an external video.
5. **Manage videos** tab — edit any video title or delete videos.
6. The video appears on the home page automatically.

## Admin panel

The Admin panel has three tabs:

- **Upload file** — upload a video/audio file from your device (with progress bar).
- **Add embed** — add an external video via iframe embed code or URL. It plays inside an iframe on the watch page.
- **Manage videos** — rename titles or delete videos. Works for both uploaded files and embeds.

Embedded videos are stored in `data/embeds.json` and appear in the video grid with an "embed" badge.

## Project layout

```
streamsite/
├── server.py        # Python web server (no pip install needed)
├── videos/          # Drop your videos here (or upload via web)
├── data/users.json  # User accounts (created automatically)
└── static/          # Frontend (HTML/CSS/JS)
    ├── index.html
    ├── watch.html
    ├── styles.css
    ├── app.js
    └── auth.js
```

## Notes

- The server listens on `0.0.0.0:8000` so it accepts connections from your LAN.
- Change the port: `PORT=8080 python server.py`
- Thumbnails are cached in `static/thumbs/` and regenerated when a video changes.
- For large files, the upload streams to disk (no full-buffer in memory).
- If you are not the first user on an existing install, you will not be admin.
