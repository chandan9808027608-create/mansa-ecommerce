"""Fill in product descriptions from qualitycomputer.com.np (used with permission).

Usage:  python3 tools/fetch_descriptions.py path/to/products.csv

The CSV (the one used with import_products.py) supplies each product's page URL. From each page
this takes the short spec summary (the bullet list under the price) as the description, one line
per bullet. Lines that are about Quality Computer rather than the product (their shop, prices,
EMI, warranty, delivery) are dropped. Only when a product has no summary at all are rows of the
page's specification table used instead, as specs.

Pages are cached in tools/cache/desc/ so the script can be stopped and re-run. Products that
already have a description (e.g. written in the admin panel) are left alone. Updates store.json
and supabase/seed.sql.
"""
import csv
import html
import json
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_products import ROOT, STORE, write_seed  # noqa: E402

CACHE = ROOT / "tools" / "cache" / "desc"
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh) MansaStoreImport/1.0"}
WORKERS, PAUSE = 3, 0.2
MAX_LINES, MAX_CHARS = 12, 1000

SHORT = re.compile(r'<p[^>]*class="[^"]*text-muted[^"]*"[^>]*placeholder="A short description[^"]*"[^>]*>(.*?)</p>', re.S)
FULL = re.compile(r'id="product_full_description"[^>]*>(.*?)(?:<div[^>]*id="product_|<footer)', re.S)
ROW = re.compile(r"<tr[^>]*>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*</tr>", re.S)
# Lines about the seller rather than the product.
SELLER = re.compile(r"quality ?computer|\bqc\b|birtamode|jhapa|kathmandu|nepal|\brs\.? ?\d|npr|price|best deal|shop now|"
                    r"buy (now|the|at)|authori[sz]ed (de+ler|dealer|reseller|distributor)|\bemi\b|warrant|(free|home|fast|same[- ]day) delivery|delivery (in|within|charge|across)|"
                    r"call us|contact|visit|order now|grab|\bwe (are|offer|provide|supply|deal)|our (valuable )?(customers|clients)|"
                    r"clients'|valuable customers", re.I)


def text(fragment):
    s = re.sub(r"<[^>]+>", " ", fragment)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def clean_lines(raw):
    parts = re.split(r"<br\s*/?>|</p>|</li>|\n", raw)
    out, seen = [], set()
    for part in parts:
        line = text(part)
        line = re.sub(r"^[\s●•▪◆■□✓✔➤►▶*·\-–—]+", "", line).strip(" ;,")
        if len(line) < 2 or SELLER.search(line):
            continue
        line = line[:200]
        if line.lower() not in seen:
            seen.add(line.lower())
            out.append(line)
    return out


def table_specs(page):
    m = FULL.search(page)
    if not m:
        return []
    specs = []
    for k, v in ROW.findall(m.group(1)):
        k, v = text(k)[:40], text(v)[:80]
        if k and v and not SELLER.search(k + " " + v) and not re.match(r"(model|camera|product|name|brand)$", k, re.I):
            specs.append([k, v])
    return specs[:MAX_LINES]


def fetch(item):
    pid, url = item
    cached = CACHE / f"{pid}.json"
    if cached.exists():
        return pid, "skip"
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                page = r.read().decode("utf-8", "ignore")
            m = SHORT.search(page)
            lines = clean_lines(m.group(1)) if m else []
            data = {"lines": lines, "specs": [] if lines else table_specs(page)}
            cached.write_text(json.dumps(data, ensure_ascii=False))
            time.sleep(PAUSE)
            return pid, "ok" if (data["lines"] or data["specs"]) else "empty"
        except Exception as e:
            if getattr(e, "code", 0) == 404:
                cached.write_text(json.dumps({"lines": [], "specs": []}))
                return pid, "missing"
            time.sleep(2 * (attempt + 1))
    return pid, "error"


def main(csv_path):
    CACHE.mkdir(parents=True, exist_ok=True)
    urls = {"p" + re.sub(r"\W", "", r["Product ID"]): r["URL"].strip()
            for r in csv.DictReader(open(csv_path, encoding="utf-8-sig")) if r.get("URL", "").startswith("https://qualitycomputer.com.np/")}
    store = json.loads(STORE.read_text())
    todo = [(p["id"], urls[p["id"]]) for p in store["products"] if p["id"] in urls]
    counts, t0 = {}, time.time()
    with ThreadPoolExecutor(WORKERS) as pool:
        for n, (_, status) in enumerate(pool.map(fetch, todo), 1):
            counts[status] = counts.get(status, 0) + 1
            if n % 100 == 0 or n == len(todo):
                print(f"{n}/{len(todo)}  {counts}  {time.time() - t0:.0f}s", flush=True)

    described = spec_only = 0
    for p in store["products"]:
        f = CACHE / f"{p['id']}.json"
        if not f.exists() or p.get("description"):
            continue
        d = json.loads(f.read_text())
        lines = d["lines"][:MAX_LINES]
        if lines:
            desc = ""
            for line in lines:  # whole lines only, within the limit
                if len(desc) + len(line) + 1 > MAX_CHARS:
                    break
                desc = f"{desc}\n{line}" if desc else line
            p["description"] = desc
            described += 1
        elif d["specs"] and not p.get("specs"):
            p["specs"] = d["specs"]
            spec_only += 1
    store["updatedAt"] = int(time.time())
    STORE.write_text(json.dumps(store, indent=2, ensure_ascii=False))
    write_seed(store)
    total = sum(1 for p in store["products"] if p.get("description") or p.get("specs"))
    print(f"added {described} descriptions and {spec_only} spec tables; {total}/{len(store['products'])} products now have details")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
