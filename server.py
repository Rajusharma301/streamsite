import json
import mimetypes
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

VIDEO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "videos")
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
VIDEO_EXTS = {".mp4", ".webm", ".mkv", ".avi", ".mov", ".m4v", ".flv", ".ts", ".mp3", ".ogg", ".wav", ".m3u8"}

PORT = int(os.environ.get("PORT", 8000))


def human_size(num):
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if num < 1024.0:
            return f"{num:.1f}{unit}" if unit != "B" else f"{int(num)}B"
        num /= 1024.0
    return f"{num:.1f}PB"


def scan_videos(directory=VIDEO_DIR):
    items = []
    for root, dirs, files in os.walk(directory):
        for name in files:
            ext = os.path.splitext(name)[1].lower()
            if ext in VIDEO_EXTS:
                full = os.path.join(root, name)
                rel = os.path.relpath(full, directory)
                size = os.path.getsize(full)
                items.append(
                    {
                        "title": os.path.splitext(name)[0],
                        "url": "/video/" + rel,
                        "thumb": "/thumb/" + rel,
                        "size": human_size(size),
                        "bytes": size,
                        "ext": ext.lstrip("."),
                        "mtime": int(os.path.getmtime(full)),
                    }
                )
    items.sort(key=lambda v: v["title"].lower())
    return items


def build_thumbnail(source, thumb):
    try:
        import subprocess

        subprocess.run(
            ["ffmpeg", "-y", "-i", source, "-ss", "00:00:03", "-frames:v", "1",
             "-vf", "scale=480:-2", thumb],
            capture_output=True,
            timeout=60,
        )
        return os.path.exists(thumb)
    except Exception:
        return False


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def log_message(self, fmt, *args):
        pass

    def send_thumb(self, rel):
        source = os.path.join(VIDEO_DIR, rel)
        if not os.path.exists(source):
            self.send_error(404, "Not found")
            return
        thumb = os.path.join(STATIC_DIR, "thumbs", rel) + ".jpg"
        os.makedirs(os.path.dirname(thumb), exist_ok=True)
        if not os.path.exists(thumb) or os.path.getmtime(thumb) < os.path.getmtime(source):
            if not build_thumbnail(source, thumb):
                self.send_error(404, "No thumbnail")
                return
        self.send_file(thumb, inline=True)

    def send_file(self, path, inline=True):
        content_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
        if not inline and content_type and content_type.startswith(("video/", "audio/", "application/vnd.apple.mpegurl")):
            pass
        size = os.path.getsize(path)

        range_header = self.headers.get("Range")
        start, end = 0, size - 1
        status = 200

        if range_header:
            try:
                start = int(range_header.replace("bytes=", "").split("-")[0])
                end_str = range_header.replace("bytes=", "").split("-")[1]
                end = int(end_str) if end_str else size - 1
                status = 206
            except (ValueError, IndexError):
                pass

        length = end - start + 1
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        with open(path, "rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(65536, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/":
            self.send_file(os.path.join(STATIC_DIR, "index.html"))
            return

        if path.startswith("/video/"):
            rel = path[len("/video/"):]
            full = os.path.join(VIDEO_DIR, rel)
            if os.path.isfile(full):
                self.send_file(full, inline=True)
                return
            self.send_error(404, "Not found")
            return

        if path.startswith("/thumb/"):
            rel = path[len("/thumb/"):]
            self.send_thumb(rel)
            return

        if path == "/api/videos":
            data = json.dumps(scan_videos()).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        if path.startswith("/thumbs/"):
            full = os.path.join(STATIC_DIR, path.lstrip("/"))
            if os.path.isfile(full):
                self.send_file(full)
                return
            self.send_error(404, "Not found")
            return

        super().do_GET()


def main():
    os.makedirs(VIDEO_DIR, exist_ok=True)
    os.makedirs(os.path.join(STATIC_DIR, "thumbs"), exist_ok=True)
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Stream site running at http://0.0.0.0:{PORT}")
    print(f"Put your videos in: {VIDEO_DIR}")
    server.serve_forever()


if __name__ == "__main__":
    main()
