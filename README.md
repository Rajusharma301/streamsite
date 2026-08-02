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

## Project layout

```
streamsite/
├── server.py        # Python web server (no pip install needed)
├── videos/          # Drop your videos here
└── static/          # Frontend (HTML/CSS/JS)
    ├── index.html
    ├── watch.html
    ├── styles.css
    └── app.js
```

## Notes

- The server listens on `0.0.0.0:8000` so it accepts connections from your LAN.
- Change the port: `PORT=8080 python server.py`
- Thumbnails are cached in `static/thumbs/` and regenerated when a video changes.
- A test file `videos/raw_demo.mp4` (dummy bytes) may exist from local testing — you can delete it freely; it is not a real video.
