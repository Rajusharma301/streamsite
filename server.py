import hashlib
import json
import mimetypes
import os
import re
import secrets
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VIDEO_DIR = os.path.join(BASE_DIR, "videos")
STATIC_DIR = os.path.join(BASE_DIR, "static")
DATA_DIR = os.path.join(BASE_DIR, "data")
USERS_FILE = os.path.join(DATA_DIR, "users.json")
VIDEO_EXTS = {".mp4", ".webm", ".mkv", ".avi", ".mov", ".m4v", ".flv", ".ts", ".mp3", ".ogg", ".wav", ".m3u8"}

PORT = int(os.environ.get("PORT", 8000))
SESSION_TTL = 60 * 60 * 24 * 7  # 7 days

_lock = threading.Lock()
SESSIONS = {}


# ---------------- users ----------------

def load_users():
    if not os.path.exists(USERS_FILE):
        return {}
    try:
        with open(USERS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_users(users):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, indent=2)


def hash_password(password, salt):
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000).hex()


def verify_password(user, password):
    return hash_password(password, user["salt"]) == user["pass_hash"]


def get_user(username):
    return load_users().get(username)


def is_admin_user(username):
    user = get_user(username)
    return bool(user and user.get("is_admin"))


def auth_token(handler):
    auth = handler.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:].strip()
        sess = SESSIONS.get(token)
        if sess and sess["exp"] > time.time():
            return sess["username"]
        if token in SESSIONS:
            SESSIONS.pop(token, None)
    return None


# ---------------- http helpers ----------------

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


def sanitize_filename(name):
    name = os.path.basename(name or "").strip()
    name = re.sub(r"[\\/:*?\"<>|\x00-\x1f]", "_", name)
    return name[:180]


# ---------------- streaming multipart parser ----------------

class MultipartReader:
    def __init__(self, handler, boundary):
        self.rfile = handler.rfile
        self.remaining = int(handler.headers.get("Content-Length", 0))
        self.delim = b"--" + boundary.encode()
        self.buf = b""
        self.started = False

    def _read(self, n):
        if self.remaining <= 0:
            return b""
        data = self.rfile.read(min(n, self.remaining))
        if not data:
            return b""
        self.remaining -= len(data)
        return data

    def _read_line(self):
        while True:
            idx = self.buf.find(b"\r\n")
            if idx != -1:
                line = self.buf[:idx]
                self.buf = self.buf[idx + 2:]
                return line
            chunk = self._read(65536)
            if not chunk:
                return self.buf
            self.buf += chunk

    def next_part(self):
        while True:
            if not self.started:
                self.started = True
                # consume preamble until first delimiter line
                line = self._read_line()
                while line and line != self.delim and line != self.delim + b"--":
                    line = self._read_line()
            else:
                line = self._read_line()
            if line == self.delim + b"--":
                return None
            if line == self.delim:
                break
            if not line:
                return None

        headers = {}
        while True:
            line = self._read_line()
            if line == b"":
                break
            if not line:
                return None
            name, _, value = line.partition(b":")
            headers[name.strip().lower()] = value.strip()

        disp = headers.get(b"content-disposition", b"")
        m = re.search(rb'name="([^"]*)"', disp)
        field = m.group(1).decode() if m else None
        m = re.search(rb'filename="([^"]*)"', disp)
        filename = m.group(1).decode() if m else None
        if field is None:
            return None
        return field, filename

    def content(self):
        while True:
            idx = self.buf.find(b"\r\n" + self.delim)
            if idx != -1:
                if idx > 0:
                    yield self.buf[:idx]
                self.buf = self.buf[idx + 2:]
                return
            keep = len(self.delim) + 2
            if len(self.buf) > keep:
                split = len(self.buf) - keep
                yield self.buf[:split]
                self.buf = self.buf[split:]
            chunk = self._read(65536)
            if not chunk:
                idx = self.buf.find(b"\r\n" + self.delim)
                if idx != -1:
                    if idx > 0:
                        yield self.buf[:idx]
                    self.buf = self.buf[idx + 2:]
                else:
                    yield self.buf
                    self.buf = b""
                return
            self.buf += chunk


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def log_message(self, fmt, *args):
        pass

    # ---------------- helpers ----------------

    def send_json(self, obj, status=200):
        data = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def read_json_body(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else b""
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return None

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

    # ---------------- auth api ----------------

    def api_signup(self):
        body = self.read_json_body()
        if not body:
            self.send_json({"error": "Invalid request"}, 400)
            return
        username = str(body.get("username", "")).strip()
        password = str(body.get("password", ""))
        if not username or not password:
            self.send_json({"error": "Username and password required"}, 400)
            return
        if len(username) < 3 or len(username) > 24:
            self.send_json({"error": "Username must be 3-24 characters"}, 400)
            return
        if len(password) < 4:
            self.send_json({"error": "Password must be at least 4 characters"}, 400)
            return

        with _lock:
            users = load_users()
            if username in users:
                self.send_json({"error": "Username already taken"}, 409)
                return
            is_first = len(users) == 0
            users[username] = {
                "salt": secrets.token_hex(16),
                "pass_hash": "",
                "is_admin": is_first,
                "created": int(time.time()),
            }
            users[username]["pass_hash"] = hash_password(password, users[username]["salt"])
            save_users(users)

        token = self.create_session(username)
        self.send_json({"token": token, "username": username, "is_admin": is_first})

    def api_login(self):
        body = self.read_json_body()
        if not body:
            self.send_json({"error": "Invalid request"}, 400)
            return
        username = str(body.get("username", "")).strip()
        password = str(body.get("password", ""))
        user = get_user(username)
        if not user or not verify_password(user, password):
            self.send_json({"error": "Invalid username or password"}, 401)
            return
        token = self.create_session(username)
        self.send_json({"token": token, "username": username, "is_admin": bool(user["is_admin"])})

    def api_logout(self):
        auth = self.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            SESSIONS.pop(auth[7:].strip(), None)
        self.send_json({"ok": True})

    def api_me(self):
        username = auth_token(self)
        if not username:
            self.send_json({"username": None})
            return
        user = get_user(username)
        self.send_json({"username": username, "is_admin": bool(user and user["is_admin"])})

    def create_session(self, username):
        token = secrets.token_hex(24)
        SESSIONS[token] = {"username": username, "exp": time.time() + SESSION_TTL}
        return token

    # ---------------- upload api ----------------

    def api_upload(self):
        username = auth_token(self)
        if not username:
            self.send_json({"error": "Not logged in"}, 401)
            return
        if not is_admin_user(username):
            self.send_json({"error": "Admin only"}, 403)
            return

        ct = self.headers.get("Content-Type", "")
        m = re.search(r"boundary=([^;]+)", ct)
        if not m:
            self.send_json({"error": "Missing multipart boundary"}, 400)
            return
        boundary = m.group(1).strip('"')

        reader = MultipartReader(self, boundary)
        title = None
        saved_name = None

        try:
            while True:
                part = reader.next_part()
                if part is None:
                    break
                field, filename = part
                if field == "title":
                    raw = b"".join(reader.content()).decode("utf-8", "replace").strip()
                    if raw:
                        title = raw
                elif field == "file" and filename:
                    safe = sanitize_filename(filename)
                    ext = os.path.splitext(safe)[1].lower()
                    if ext not in VIDEO_EXTS:
                        for _ in reader.content():
                            pass
                        self.send_json({"error": f"Unsupported format: {ext or 'unknown'}"}, 400)
                        return
                    base = os.path.splitext(safe)[0]
                    dest = os.path.join(VIDEO_DIR, safe)
                    counter = 1
                    while os.path.exists(dest):
                        dest = os.path.join(VIDEO_DIR, f"{base}_{counter}{ext}")
                        counter += 1
                    with open(dest, "wb") as f:
                        for chunk in reader.content():
                            f.write(chunk)
                    saved_name = os.path.basename(dest)
                else:
                    for _ in reader.content():
                        pass
        except Exception as exc:
            self.send_json({"error": f"Upload failed: {exc}"}, 500)
            return

        if not saved_name:
            self.send_json({"error": "No file received"}, 400)
            return

        if title:
            old = os.path.join(VIDEO_DIR, saved_name)
            base = sanitize_filename(title)
            ext = os.path.splitext(saved_name)[1]
            if not base:
                base = os.path.splitext(saved_name)[0]
            new_name = base + ext
            new_path = os.path.join(VIDEO_DIR, new_name)
            counter = 1
            while os.path.exists(new_path):
                new_path = os.path.join(VIDEO_DIR, f"{base}_{counter}{ext}")
                counter += 1
            os.rename(old, new_path)
            saved_name = os.path.basename(new_path)

        self.send_json({"ok": True, "file": saved_name, "title": os.path.splitext(saved_name)[0]})

    # ---------------- routing ----------------

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/":
            self.send_file(os.path.join(STATIC_DIR, "index.html"))
            return

        if path == "/api/me":
            self.api_me()
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

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/signup":
            self.api_signup()
        elif path == "/api/login":
            self.api_login()
        elif path == "/api/logout":
            self.api_logout()
        elif path == "/api/upload":
            self.api_upload()
        else:
            self.send_json({"error": "Not found"}, 404)


def main():
    os.makedirs(VIDEO_DIR, exist_ok=True)
    os.makedirs(os.path.join(STATIC_DIR, "thumbs"), exist_ok=True)
    os.makedirs(DATA_DIR, exist_ok=True)
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Stream site running at http://0.0.0.0:{PORT}")
    print(f"Videos folder: {VIDEO_DIR}")
    print("First registered user becomes admin.")
    server.serve_forever()


if __name__ == "__main__":
    main()
