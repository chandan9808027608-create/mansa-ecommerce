#!/usr/bin/env python3
"""Static file server + tiny admin API for the Mansa store.

Run:   ADMIN_PASSWORD='your-secret' python3 server.py
Then:  http://localhost:8080/            (store)
       http://localhost:8080/admin.html  (admin panel)

Editable from the admin panel: the ad popup (ad.json), the catalogue and hero
(store.json) and images (uploads/).
"""
import base64
import hmac
import json
import os
import re
import secrets
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
AD_FILE = ROOT / "ad.json"
STORE_FILE = ROOT / "store.json"
IMAGES = ROOT / "images"
UPLOADS = ROOT / "uploads"
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8080"))
PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
USING_DEFAULT = not PASSWORD
if USING_DEFAULT:
    # No password configured: use a random one for this run only (printed at startup).
    import secrets
    PASSWORD = secrets.token_urlsafe(12)

TOKEN_TTL = 12 * 3600
MAX_BODY = 6 * 1024 * 1024
IMAGE_TYPES = {
    b"\xff\xd8\xff": "jpg",
    b"\x89PNG\r\n\x1a\n": "png",
    b"GIF8": "gif",
}
TEXT_LIMITS = {"badge": 30, "title": 90, "text": 300, "buttonLabel": 30, "buttonLink": 500, "image": 500}
tokens: dict[str, float] = {}


BADGES = {"", "New", "Best seller", "Sale"}
IMG_EXT = {".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif"}


def clean_url(v) -> str:
    v = str(v or "").strip()[:300]
    if re.fullmatch(r"(images|uploads)/[\w.\- ]+", v) and ".." not in v:
        return v
    return v if re.match(r"https?://[^\s]+$", v) else ""


def to_price(v, default=0):
    try:
        n = int(round(float(v)))
    except (TypeError, ValueError):
        return default
    return max(0, min(n, 1_000_000_000))


def clean_store(raw: dict) -> dict:
    products, seen = [], set()
    for item in (raw.get("products") or [])[:500]:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()[:120]
        if not name:
            continue
        pid = re.sub(r"[^a-z0-9_-]", "", str(item.get("id", "")).lower())[:40] or "p-" + secrets.token_hex(4)
        while pid in seen:
            pid += "x"
        seen.add(pid)
        prod = {
            "id": pid,
            "name": name,
            "category": str(item.get("category", "")).strip()[:40] or "Other",
            "brand": str(item.get("brand", "")).strip()[:40],
            "price": to_price(item.get("price")),
            "description": str(item.get("description", "")).strip()[:400],
        }
        try:
            disc = round(float(item.get("discount") or 0), 1)
        except (TypeError, ValueError):
            disc = 0
        if 0 < disc < 100:
            prod["discount"] = disc
        badge = str(item.get("badge", ""))
        if badge in BADGES and badge:
            prod["badge"] = badge
        img = clean_url(item.get("image"))
        if img:
            prod["image"] = img
        if img:
            try:
                zoom = int(item.get("imgScale", 100))
            except (TypeError, ValueError):
                zoom = 100
            zoom = max(40, min(200, zoom))
            if zoom != 100:
                prod["imgScale"] = zoom
            try:
                rot = int(item.get("imgRotate", 0)) % 360
            except (TypeError, ValueError):
                rot = 0
            if rot in (90, 180, 270):
                prod["imgRotate"] = rot
            if item.get("imgFlip") is True:
                prod["imgFlip"] = True
            if item.get("imgFit") in ("cover", "contain"):
                prod["imgFit"] = item["imgFit"]
        specs = []
        for pair in (item.get("specs") or [])[:12]:
            if isinstance(pair, (list, tuple)) and len(pair) == 2:
                k, v = str(pair[0]).strip()[:40], str(pair[1]).strip()[:80]
                if k and v:
                    specs.append([k, v])
        if specs:
            prod["specs"] = specs
        products.append(prod)
    featured = str(raw.get("featured", ""))
    if featured not in seen:
        featured = products[0]["id"] if products else ""
    return {"featured": featured, "heroImage": clean_url(raw.get("heroImage")), "products": products,
            "updatedAt": int(time.time())}


def write_json(path: Path, data: dict):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    tmp.replace(path)


def list_media():
    items = []
    for folder, editable in ((IMAGES, False), (UPLOADS, True)):
        if not folder.is_dir():
            continue
        for f in sorted(folder.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
            if f.is_file() and f.suffix.lower() in IMG_EXT and not f.name.startswith("."):
                st = f.stat()
                items.append({"url": f"{folder.name}/{f.name}", "name": f.name, "size": st.st_size,
                              "editable": editable, "modified": int(st.st_mtime)})
    return items


def sniff_image(data: bytes):
    for magic, ext in IMAGE_TYPES.items():
        if data.startswith(magic):
            return ext
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def clean_ad(raw: dict) -> dict:
    ad = {k: str(raw.get(k, ""))[:n].strip() for k, n in TEXT_LIMITS.items()}
    ad["enabled"] = bool(raw.get("enabled"))
    ad["theme"] = raw.get("theme") if raw.get("theme") in ("light", "dark") else "light"
    ad["frequency"] = raw.get("frequency") if raw.get("frequency") in ("visit", "session", "day") else "session"
    for k in ("startDate", "endDate"):
        v = str(raw.get(k, ""))[:10]
        ad[k] = v if len(v) == 10 and v[4] == "-" and v[7] == "-" else ""
    ad["updatedAt"] = int(time.time())
    return ad


class Handler(SimpleHTTPRequestHandler):
    server_version = "MansaStore"

    # ---- helpers
    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY:
            return None
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            return None

    def _authed(self):
        auth = self.headers.get("Authorization", "")
        token = auth[7:] if auth.startswith("Bearer ") else ""
        exp = tokens.get(token)
        if exp and exp > time.time():
            return True
        tokens.pop(token, None)
        return False

    # ---- static: never expose source/dotfiles
    def _blocked(self):
        path = urlparse(self.path).path
        parts = [p for p in path.split("/") if p]
        return any(p.startswith(".") for p in parts) or path.endswith((".py", ".pyc")) or "__pycache__" in parts

    def do_GET(self):
        if urlparse(self.path).path == "/api/media":
            if not self._authed():
                return self._json(401, {"error": "Please sign in again"})
            return self._json(200, {"items": list_media()})
        if self._blocked():
            return self.send_error(404)
        super().do_GET()

    def do_HEAD(self):
        if self._blocked():
            return self.send_error(404)
        super().do_HEAD()

    def end_headers(self):
        if urlparse(self.path).path.endswith("ad.json"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    # ---- API
    def do_POST(self):
        route = urlparse(self.path).path
        data = self._body()
        if data is None:
            return self._json(400, {"error": "Invalid or too-large request"})

        if route == "/api/login":
            if hmac.compare_digest(str(data.get("password", "")), PASSWORD):
                token = secrets.token_urlsafe(32)
                tokens[token] = time.time() + TOKEN_TTL
                return self._json(200, {"token": token})
            time.sleep(1)
            return self._json(401, {"error": "Wrong password"})

        if not self._authed():
            return self._json(401, {"error": "Please sign in again"})

        if route == "/api/ad":
            ad = clean_ad(data)
            write_json(AD_FILE, ad)
            return self._json(200, ad)

        if route == "/api/store":
            store = clean_store(data)
            write_json(STORE_FILE, store)
            return self._json(200, store)

        if route == "/api/media/delete":
            name = str(data.get("name", ""))
            target = UPLOADS / name
            if not re.fullmatch(r"[\w.\-]+", name) or not target.is_file():
                return self._json(404, {"error": "File not found"})
            target.unlink()
            return self._json(200, {"ok": True})

        if route == "/api/upload":
            try:
                raw = base64.b64decode(str(data.get("data", "")), validate=True)
            except Exception:
                return self._json(400, {"error": "Bad image data"})
            ext = sniff_image(raw)
            if not ext or len(raw) > 4 * 1024 * 1024:
                return self._json(400, {"error": "Use a JPG, PNG, GIF or WebP under 4 MB"})
            UPLOADS.mkdir(exist_ok=True)
            name = f"img-{secrets.token_hex(6)}.{ext}"
            (UPLOADS / name).write_bytes(raw)
            return self._json(200, {"url": f"uploads/{name}"})

        self._json(404, {"error": "Not found"})


def main():
    handler = partial(Handler, directory=str(ROOT))
    httpd = ThreadingHTTPServer((HOST, PORT), handler)
    print(f"Store:  http://localhost:{PORT}/")
    print(f"Admin:  http://localhost:{PORT}/admin.html")
    if USING_DEFAULT:
        print(f"ADMIN_PASSWORD not set. Temporary admin password for this run: {PASSWORD}")
        print("         Set your own:  ADMIN_PASSWORD='something-strong' python3 server.py")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
