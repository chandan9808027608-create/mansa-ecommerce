"""Download product photos from qualitycomputer.com.np (used with permission) and attach them.

Usage:  python3 tools/fetch_images.py

For every product in store.json whose id is "p<Quality Computer product id>", downloads the
512px image to images/products/<id>.<ext>, skipping files already downloaded (safe to re-run).
Odoo serves a stock placeholder picture for products without a photo; files identical to it
(fetched once from a product id that doesn't exist) are discarded. Finally store.json and supabase/seed.sql
are updated so each product with a photo points at it. Products that already have an image set
in the admin panel are left alone.
"""
import hashlib
import json
import sys
import time
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_products import ROOT, STORE, write_seed  # noqa: E402

OUT = ROOT / "images" / "products"
URL = "https://qualitycomputer.com.np/web/image/product.template/{}/image_512"
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh) MansaStoreImport/1.0"}
EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}
WORKERS = 3          # parallel requests, kept low so their site isn't strained
PAUSE = 0.15         # seconds between requests per worker


def existing(pid):
    return next((p for p in OUT.glob(f"{pid}.*") if p.suffix != ".missing"), None)


def fetch(pid):
    if existing(pid) or (OUT / f"{pid}.missing").exists():
        return pid, "skip"
    req = urllib.request.Request(URL.format(pid[1:]), headers=HEADERS)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                ext = EXT.get(r.headers.get_content_type())
                data = r.read()
            if not ext or len(data) < 200:
                (OUT / f"{pid}.missing").touch()
                return pid, "none"
            (OUT / f"{pid}.{ext}").write_bytes(data)
            time.sleep(PAUSE)
            return pid, "ok"
        except Exception as e:  # network hiccup / 5xx: back off and retry
            if getattr(e, "code", 0) == 404:
                (OUT / f"{pid}.missing").touch()
                return pid, "none"
            time.sleep(2 * (attempt + 1))
    return pid, "error"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    store = json.loads(STORE.read_text())
    ids = [p["id"] for p in store["products"] if p["id"].startswith("p") and p["id"][1:].isdigit()]
    counts = defaultdict(int)
    t0 = time.time()
    with ThreadPoolExecutor(WORKERS) as pool:
        for n, (pid, status) in enumerate(pool.map(fetch, ids), 1):
            counts[status] += 1
            if n % 100 == 0 or n == len(ids):
                print(f"{n}/{len(ids)}  {dict(counts)}  {time.time() - t0:.0f}s", flush=True)

    # Placeholder detection: what the site returns for a product with no photo.
    with urllib.request.urlopen(urllib.request.Request(URL.format(999999999), headers=HEADERS), timeout=30) as r:
        stock = hashlib.sha1(r.read()).hexdigest()
    placeholders = 0
    for f in list(OUT.iterdir()):
        if f.suffix != ".missing" and hashlib.sha1(f.read_bytes()).hexdigest() == stock:
            f.unlink()
            (OUT / f"{f.stem}.missing").touch()
            placeholders += 1
    print(f"discarded {placeholders} placeholder images")

    attached = 0
    for p in store["products"]:
        f = existing(p["id"])
        if f and not p.get("image"):
            p["image"] = f"images/products/{f.name}"
            attached += 1
    store["updatedAt"] = int(time.time())
    STORE.write_text(json.dumps(store, indent=2, ensure_ascii=False))
    write_seed(store)
    with_photo = sum(1 for p in store["products"] if p.get("image"))
    size = sum(f.stat().st_size for f in OUT.iterdir() if f.suffix != ".missing")
    print(f"attached {attached} new photos; {with_photo}/{len(store['products'])} products have a photo; "
          f"{size / 1e6:.0f} MB in images/products")


if __name__ == "__main__":
    main()
