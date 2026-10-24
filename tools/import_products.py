"""Replace the whole catalogue in store.json with the products in a CSV file.

Usage:  python3 tools/import_products.py path/to/products.csv

Expected columns: "Product ID", "Category", "Name", "Price (NPR)", "List Price (NPR)".
"Price" is what the customer pays and "List Price" the regular price; a lower Price becomes a
discount. Brands are taken from the first word of the name when it is a known brand or appears
at the start of at least 3 product names. The old store.json is copied to store.backup-<time>.json, and supabase/seed.sql is regenerated
to match.
Product URLs in the CSV are ignored.
"""
import csv
import json
import re
import shutil
import sys
import time
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STORE = ROOT / "store.json"
SEED = ROOT / "supabase" / "seed.sql"

CATEGORY_NAMES = {
    "Laptop": "Laptops",
    "Display": "Monitors",
    "Network Component": "Networking",
    "Security and Surveillance": "CCTV & Security",
    "Storage Device": "Storage",
    "Power Solution": "Power & UPS",
    "Charger | Adapter": "Chargers & Adapters",
    "Camera & Accessories": "Cameras",
    "Desktop": "Desktops",
    "Audio Devices": "Audio",
    "Uncategorized": "Other",
    "UGREEN": "Accessories",
}

# First words that are not brands, and brands whose name is spelled differently.
NOT_BRANDS = {"cpu", "refill", "laptop", "hdmi", "micro", "12a", "1m", "school", "carbon", "lamination",
              "fashion", "golden", "asian", "boom", "galaxy", "tata", "sk", "trm", "usb", "type-c",
              "wireless", "mini", "smart", "original", "new", "a4", "rj45", "cat6", "cat", "dc", "ac"}
BRAND_ALIAS = {"iphone": "Apple", "macbook": "Apple", "ipad": "Apple", "cooler": "Cooler Master",
               "konica": "Konica Minolta", "ant": "Ant Esports", "western": "WD"}
BRAND_CASE = {b.lower(): b for b in [
    "ASUS", "MSI", "HP", "JBL", "AOC", "BenQ", "PNY", "ADATA", "TP-Link", "D-Link", "WD", "UNV", "NEC",
    "BDCOM", "ZKTeco", "X-Lab", "Su-Kam", "UGREEN", "WiWU", "HiFuture", "EZVIZ", "HIKSEMI", "IDP", "R8", "SP",
    "Xiaomi", "Lenovo", "Dell", "Acer", "Apple", "Hikvision", "Ruijie", "Fantech", "Rapoo", "Brother", "Epson",
    "Transcend", "Havit", "Unitek", "ViewSonic", "Logitech", "Ultima", "Baseus", "Lexar", "SanDisk", "Technos",
    "Chigo", "Livpure", "Huntkey", "Corsair", "Kaspersky", "Frontech", "Thermaltake", "Sanwood", "Mcdodo",
    "Kingston", "Bolein", "Havells", "Oscoo", "Enter", "Gigabyte", "Ubiquiti", "Kyocera", "Armaggeddon",
    "SonicGear", "Seagate", "Secureye", "Redragon", "Creative", "Philips", "Toshiba", "Orico", "Honeywell",
    "Boya", "Dahua", "Modulus", "Vartex", "Uniline", "Samsung", "Gamemax", "Joyroom", "Consistent", "Horion",
    "Nexgen", "Kisonli", "Antec", "Belkin", "Zoook", "Delta", "DeepCool", "Tiandy", "Trusmi", "Aiwa",
    "Alcatroz", "Digicom", "Kent", "Maxsell", "Netis", "Zebra", "Excelltel", "Goldkist", "Amazfit", "Canon",
    "Zotac", "San-Volt", "LinkBasic", "Swifgo", "Wanbo", "Tenda", "Mercusys", "Canon", "Sony", "Microsoft",
]}


def first_word(name):
    return re.split(r"[\s/(,]", name.strip())[0].strip(",-").lower()


def brand_for(name, common):
    w = first_word(name)
    if w in BRAND_ALIAS:
        return BRAND_ALIAS[w]
    if w in NOT_BRANDS or not re.search(r"[a-z]", w):
        return ""
    if w in BRAND_CASE:
        return BRAND_CASE[w]
    if common[w] >= 3:
        return "-".join(part[:1].upper() + part[1:] for part in w.split("-"))
    return ""


def to_int(v):
    try:
        return max(0, int(round(float(str(v).replace(",", "")))))
    except ValueError:
        return 0


def write_seed(store):
    """supabase/seed.sql: the same catalogue (and current ad.json) for the Supabase database."""
    q = lambda v: "'" + str(v).replace("'", "''") + "'"
    rows = [
        "  (" + ", ".join([
            q(p["id"]), q(p["name"]), q(p.get("category", "Other")), q(p.get("brand", "")), str(int(p.get("price", 0))),
            repr(float(p.get("discount", 0) or 0)), q(p.get("description", "")), q(p.get("badge", "")), q(p.get("image", "")),
            str(p.get("imgScale", 100)), str(p.get("imgRotate", 0)), "true" if p.get("imgFlip") else "false",
            q(p.get("imgFit", "")), q(json.dumps(p.get("specs", []), ensure_ascii=False)) + "::jsonb", str(i)]) + ")"
        for i, p in enumerate(store["products"])]
    head = ("insert into public.products (id, name, category, brand, price, discount, description, badge, image,\n"
            "                             img_scale, img_rotate, img_flip, img_fit, specs, sort_order)\nvalues\n")
    batches = "\n".join(head + ",\n".join(rows[i:i + 500]) + ";\n" for i in range(0, len(rows), 500))
    ad_path = ROOT / "ad.json"
    ad = json.loads(ad_path.read_text()) if ad_path.exists() else {}
    settings = {"featured": store["featured"], "heroImage": store.get("heroImage", "")}
    company_path = ROOT / "company.json"
    company = json.loads(company_path.read_text()) if company_path.exists() else {}
    SEED.write_text(f"""-- Mansa Technology store: starting data ({len(rows)} products and the popup ad).
-- Generated by tools/import_products.py. Run after schema.sql: SQL Editor → New query → paste → Run.
-- This REPLACES every product in the database with this list.

begin;

delete from public.products;

{batches}
insert into public.settings (key, value) values
  ('store', {q(json.dumps(settings, ensure_ascii=False))}::jsonb),
  ('ad', {q(json.dumps(ad, ensure_ascii=False))}::jsonb),
  ('company', {q(json.dumps(company, ensure_ascii=False))}::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

commit;
""")


def main(path):
    rows = list(csv.DictReader(open(path, encoding="utf-8-sig")))
    common = Counter(first_word(r["Name"]) for r in rows)
    products, seen = [], set()
    for r in rows:
        name = " ".join(r["Name"].split())[:300]
        pid = "p" + re.sub(r"\W", "", r["Product ID"])[:50]
        if not name or pid in seen:
            continue
        seen.add(pid)
        price, regular = to_int(r["Price (NPR)"]), to_int(r["List Price (NPR)"])
        prod = {
            "id": pid,
            "name": name,
            "category": CATEGORY_NAMES.get(r["Category"].strip(), r["Category"].strip())[:40] or "Other",
            "brand": brand_for(name, common),
            "price": max(price, regular),
            "description": "",
        }
        if regular > price > 0:
            # Kept precise so regular price x (1 - discount) rounds back to the exact sale price.
            prod["discount"] = round((1 - price / regular) * 100, 6)
        products.append(prod)

    # Same category order everywhere: biggest first, "Other" last.
    sizes = Counter(p["category"] for p in products)
    products.sort(key=lambda p: (p["category"] == "Other", -sizes[p["category"]]))

    old = json.loads(STORE.read_text()) if STORE.exists() else {}
    if STORE.exists():
        shutil.copy(STORE, ROOT / f"store.backup-{int(time.time())}.json")
    ids = {p["id"] for p in products}
    featured = old.get("featured") if old.get("featured") in ids else next(
        (p["id"] for p in products if p["category"] == "CCTV & Security" and "dome" in p["name"].lower()), products[0]["id"])
    store = {"featured": featured, "heroImage": "", "products": products, "updatedAt": int(time.time())}
    STORE.write_text(json.dumps(store, indent=2, ensure_ascii=False))
    write_seed(store)
    print(f"Imported {len(products)} products into {STORE.name} (featured: {featured})")
    print(f"{sum('discount' in p for p in products)} discounted, {sum(bool(p['brand']) for p in products)} with a brand")
    for c, n in sizes.most_common():
        print(f"  {n:5}  {c}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
