// Data layer shared by the store (app.js, ad.js) and the admin panel.
// With config.js filled in, everything goes to Supabase (database, storage, auth).
// Without it, it falls back to the local Python server (server.py + store.json / ad.json).
(() => {
  const CFG = window.MANSA_SUPABASE || {};
  const USE_SB = Boolean(CFG.url && CFG.anonKey);
  const SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
  const BUCKET = "media";

  // ---------- validation (mirrors the limits in supabase/schema.sql) ----------
  const str = (v, n) => String(v ?? "").trim().slice(0, n);
  const int = (v, d = 0) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? x : d; };
  const url = (v) => {
    const s = str(v, 500);
    if (!s) return "";
    try { return ["http:", "https:"].includes(new URL(s, location.href).protocol) ? s : ""; } catch { return ""; }
  };
  const BADGES = ["", "New", "Best seller", "Sale"];

  function cleanProduct(p) {
    const out = {
      id: str(p.id, 60).replace(/[^\w-]/g, "") || `item-${Math.random().toString(36).slice(2, 8)}`,
      name: str(p.name, 300),
      category: str(p.category, 40) || "Other",
      brand: str(p.brand, 40),
      price: Math.max(0, int(p.price)),
      description: str(p.description, 1000),
    };
    const d = Math.round(Number(p.discount) * 1e6) / 1e6;  // precise, so sale prices stay exact
    if (d > 0 && d < 100) out.discount = d;
    if (BADGES.includes(p.badge) && p.badge) out.badge = p.badge;
    const img = url(p.image);
    if (img) {
      out.image = img;
      const z = Math.max(40, Math.min(200, int(p.imgScale, 100)));
      if (z !== 100) out.imgScale = z;
      const r = ((int(p.imgRotate) % 360) + 360) % 360;
      if ([90, 180, 270].includes(r)) out.imgRotate = r;
      if (p.imgFlip === true) out.imgFlip = true;
      if (["cover", "contain"].includes(p.imgFit)) out.imgFit = p.imgFit;
    }
    const specs = (Array.isArray(p.specs) ? p.specs : []).slice(0, 12)
      .map((s) => [str(s && s[0], 40), str(s && s[1], 80)]).filter(([k, v]) => k && v);
    if (specs.length) out.specs = specs;
    return out;
  }

  function cleanCompany(a) {
    const s = a.schedule || {};
    const days = [...new Set((s.days || []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
    const open = Math.max(0, Math.min(23, int(s.open, 10)));
    let close = Math.max(1, Math.min(24, int(s.close, 18)));
    if (close <= open) close = Math.min(24, open + 1);
    const link = (v) => { const x = str(v, 300); return /^https?:\/\//i.test(x) ? x : ""; };
    const email = str(a.email, 120);
    return {
      name: str(a.name, 40), legalName: str(a.legalName, 120), tagline: str(a.tagline, 160),
      phone: str(a.phone, 40), whatsapp: String(a.whatsapp || "").replace(/\D/g, "").slice(0, 15),
      email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : "",
      address: str(a.address, 200), area: str(a.area, 60), hours: str(a.hours, 120), closedDay: str(a.closedDay, 60),
      facebook: link(a.facebook), instagram: link(a.instagram),
      schedule: { days, open, close }, updatedAt: Math.floor(Date.now() / 1000),
    };
  }

  function cleanAd(a) {
    const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : "");
    return {
      enabled: Boolean(a.enabled),
      badge: str(a.badge, 30), title: str(a.title, 90), text: str(a.text, 300),
      buttonLabel: str(a.buttonLabel, 30), buttonLink: str(a.buttonLink, 500), image: url(a.image),
      theme: a.theme === "dark" ? "dark" : "light",
      layout: a.layout === "image" ? "image" : "card",
      frequency: ["visit", "session", "day"].includes(a.frequency) ? a.frequency : "session",
      startDate: date(a.startDate), endDate: date(a.endDate),
      updatedAt: Math.floor(Date.now() / 1000),
    };
  }

  // ---------- Supabase rows <-> store objects ----------
  const fromRow = (r) => cleanProduct({
    id: r.id, name: r.name, category: r.category, brand: r.brand, price: r.price, discount: r.discount,
    description: r.description, badge: r.badge, image: r.image, imgScale: r.img_scale, imgRotate: r.img_rotate,
    imgFlip: r.img_flip, imgFit: r.img_fit, specs: r.specs,
  });
  const toRow = (p) => ({
    id: p.id, name: p.name, category: p.category, brand: p.brand || "", price: p.price, discount: p.discount || 0,
    description: p.description || "", badge: p.badge || "", image: p.image || "", img_scale: p.imgScale || 100,
    img_rotate: p.imgRotate || 0, img_flip: Boolean(p.imgFlip), img_fit: p.imgFit || "", specs: p.specs || [],
  });

  let sbPromise = null;
  function sb() {
    if (!sbPromise) {
      sbPromise = new Promise((resolve, reject) => {
        if (window.supabase) return resolve();
        const s = document.createElement("script");
        s.src = SDK;
        s.onload = resolve;
        s.onerror = () => reject(new Error("Could not load Supabase"));
        document.head.append(s);
      }).then(() => window.supabase.createClient(CFG.url, CFG.anonKey));
    }
    return sbPromise;
  }
  const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

  const getJson = (path) => fetch(path, { cache: "no-store" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));

  // ---------- local (server.py) admin calls ----------
  const TOKEN_KEY = "mansa-admin-token";
  let token = null;
  try { token = sessionStorage.getItem(TOKEN_KEY); } catch {}
  // Without Supabase, the admin panel needs server.py: it won't work from a double-clicked file
  // or a static copy of the site (e.g. GitHub Pages), so say so plainly instead of "Request failed".
  const NO_SERVER = "Can't reach the store server. Start it with  ADMIN_PASSWORD='your-password' python3 server.py  "
    + "and open http://localhost:8080/admin.html (not the file itself or the GitHub copy).";
  async function call(path, body) {
    if (location.protocol === "file:") throw new Error(NO_SERVER);
    let r;
    try {
      r = await fetch(path, {
        method: body === undefined ? "GET" : "POST",
        headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch { throw new Error(NO_SERVER); }
    if ([404, 405, 501].includes(r.status) && path.startsWith("/api/")) throw new Error(NO_SERVER);
    const data = await r.json().catch(() => ({}));
    if (r.status === 401) { const e = new Error(data.error || "Please sign in again"); e.auth = true; throw e; }
    if (!r.ok) throw new Error(data.error || "Request failed");
    return data;
  }
  const b64 = (blob) => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(",")[1]);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });

  // Featured products: a list of ids. Older data stored one id, or ids joined with commas.
  const featuredList = (v) => (Array.isArray(v) ? v : String(v || "").split(",")).map((x) => String(x).trim()).filter(Boolean);

  // ---------- public API ----------
  const api = {
    mode: USE_SB ? "supabase" : "local",

    async loadStore() {
      if (!USE_SB) {
        const s = await getJson("store.json");
        return { featured: featuredList(s.featured), heroImage: s.heroImage || "", products: Array.isArray(s.products) ? s.products : [] };
      }
      const c = await sb();
      const [rows, set] = await Promise.all([
        c.from("products").select("*").order("sort_order").then(must),
        c.from("settings").select("value").eq("key", "store").maybeSingle().then(must),
      ]);
      const v = (set && set.value) || {};
      return { featured: featuredList(v.featured), heroImage: v.heroImage || "", products: rows.map(fromRow) };
    },

    // Company / contact details (edited in admin → Company). Empty object = use products.js defaults.
    async loadCompany() {
      if (!USE_SB) return getJson("company.json");
      const c = await sb();
      const row = must(await c.from("settings").select("value").eq("key", "company").maybeSingle());
      return (row && row.value) || {};
    },

    async saveCompany(co) {
      if (!USE_SB) return call("/api/company", co);
      const clean = cleanCompany(co);
      const c = await sb();
      must(await c.from("settings").upsert({ key: "company", value: clean }));
      return clean;
    },

    async loadAd() {
      if (!USE_SB) return getJson("ad.json");
      const c = await sb();
      const row = must(await c.from("settings").select("value").eq("key", "ad").maybeSingle());
      return (row && row.value) || {};
    },

    // Saved alongside the WhatsApp message. Never blocks or breaks checkout.
    async saveOrder(order) {
      if (!USE_SB) return;
      try {
        const c = await sb();
        must(await c.from("orders").insert({
          name: str(order.name, 120), phone: str(order.phone, 40),
          method: order.method === "pickup" ? "pickup" : "delivery",
          address: str(order.address, 500), note: str(order.note, 300),
          items: order.items.slice(0, 100).map((i) => ({ id: str(i.id, 60), name: str(i.name, 300), qty: Math.max(1, int(i.qty, 1)), price: Math.max(0, int(i.price)) })),
          total: Math.max(0, int(order.total)),
        }));
      } catch (e) { console.warn("Order not saved to Supabase:", e.message); }
    },

    // ---------- admin ----------
    async restore() {
      if (!USE_SB) return Boolean(token);
      const c = await sb();
      const { data } = await c.auth.getSession();
      return Boolean(data.session);
    },

    async signIn({ email, password }) {
      if (!USE_SB) {
        const d = await call("/api/login", { password });
        token = d.token;
        try { sessionStorage.setItem(TOKEN_KEY, token); } catch {}
        return;
      }
      const c = await sb();
      must(await c.auth.signInWithPassword({ email, password }));
      // Signing in is not enough: the account must also be listed in public.admins.
      const ok = must(await c.rpc("is_admin"));
      if (!ok) { await c.auth.signOut(); throw new Error("This account is not an admin."); }
    },

    async signOut() {
      token = null;
      try { sessionStorage.removeItem(TOKEN_KEY); } catch {}
      if (USE_SB) { const c = await sb(); await c.auth.signOut(); }
    },

    async saveStore(store) {
      const products = store.products.map(cleanProduct);
      const ids = new Set(products.map((p) => p.id));
      let featured = [...new Set(featuredList(store.featured).filter((id) => ids.has(id)))].slice(0, 12);
      if (!featured.length && products[0]) featured = [products[0].id];
      const heroImage = url(store.heroImage);
      if (!USE_SB) return call("/api/store", { featured, heroImage, products });
      const c = await sb();
      must(await c.rpc("save_store", { p_products: products.map(toRow), p_featured: featured.join(","), p_hero_image: heroImage }));
      return { featured, heroImage, products };
    },

    async saveAd(ad) {
      if (!USE_SB) return call("/api/ad", ad);
      const clean = cleanAd(ad);
      const c = await sb();
      must(await c.from("settings").upsert({ key: "ad", value: clean }));
      return clean;
    },

    async upload(blob) {
      if (!USE_SB) return (await call("/api/upload", { data: await b64(blob) })).url;
      const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" }[blob.type];
      if (!ext) throw new Error("Use a JPG, PNG, GIF or WebP image");
      if (blob.size > 4 * 1024 * 1024) throw new Error("Images must be under 4 MB");
      const c = await sb();
      const path = `uploads/img-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${ext}`;
      must(await c.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: "31536000" }));
      return c.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    },

    // Items: { url, name, size, editable }. Built-in images come from images/manifest.json.
    async listMedia() {
      if (!USE_SB) return (await call("/api/media")).items;
      const c = await sb();
      const [files, builtIn] = await Promise.all([
        c.storage.from(BUCKET).list("uploads", { limit: 500, sortBy: { column: "created_at", order: "desc" } }).then(must),
        getJson("images/manifest.json"),
      ]);
      const uploads = files.filter((f) => f.id).map((f) => ({
        url: c.storage.from(BUCKET).getPublicUrl(`uploads/${f.name}`).data.publicUrl,
        name: f.name, size: (f.metadata && f.metadata.size) || 0, editable: true,
      }));
      return uploads.concat((builtIn.files || []).map((f) => ({ ...f, editable: false })));
    },

    async deleteMedia(item) {
      if (!USE_SB) return call("/api/media/delete", { name: item.name });
      const c = await sb();
      must(await c.storage.from(BUCKET).remove([`uploads/${item.name}`]));
    },

    async listOrders() {
      if (!USE_SB) return null; // orders are only stored with Supabase
      const c = await sb();
      return must(await c.from("orders").select("*").order("created_at", { ascending: false }).limit(200));
    },

    async setOrderStatus(id, status) {
      const c = await sb();
      must(await c.from("orders").update({ status }).eq("id", id));
    },
  };

  window.MansaData = api;
})();
