(async () => {
  const { STORE } = window;
  // The catalogue comes from Supabase, or store.json on the local server (see data.js).
  let data = {};
  try { data = await window.MansaData.loadStore(); } catch (e) { console.warn("Could not load products:", e.message); }
  // A product's `price` is its regular price; `discount` (percent) lowers it. After this,
  // `price` is what the customer pays and `was` the struck-through regular price.
  const PRODUCTS = (Array.isArray(data.products) ? data.products : []).map((p) => {
    const d = Number(p.discount) || 0;
    if (d <= 0 || d >= 100) return { ...p, discount: 0 };
    return { ...p, discount: d, was: p.price, price: Math.round(p.price * (1 - d / 100)), badge: p.badge || `-${Math.max(1, Math.round(d))}%` };
  });
  const isSale = (p) => Boolean(p.discount) || p.badge === "Sale";
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (id) => document.getElementById(id);
  const money = (n) => `${STORE.currency} ${n.toLocaleString("en-IN")}`;
  const CART_KEY = "mansa-cart";

  let cart = {};
  try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch { cart = {}; }
  const PAGE = 48;  // products per page on the shop
  const state = { category: "All", brand: "", query: "", sort: "featured", deals: false, page: 1 };
  // index.html shows a short teaser; shop.html has the full catalogue (#grid).
  const IS_SHOP = Boolean(document.getElementById("grid"));

  const save = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {} };
  const find = (id) => PRODUCTS.find((p) => p.id === id);
  const el = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    kids.flat().forEach((k) => n.append(k));
    return n;
  };

  // ---------- Line illustrations (inherit text colour) ----------
  const S = 'fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';
  const F = 'fill="currentColor"';
  const ART = {
    Cameras: `<svg viewBox="0 0 200 200" ${S}><rect x="28" y="62" width="144" height="92" rx="20"/><rect x="72" y="46" width="56" height="18" rx="6"/><circle cx="100" cy="108" r="36"/><circle cx="100" cy="108" r="22" ${F} opacity=".14"/><circle cx="100" cy="108" r="8" ${F} stroke="none"/><circle cx="150" cy="82" r="4" ${F} stroke="none"/></svg>`,
    Printers: `<svg viewBox="0 0 200 200" ${S}><rect x="56" y="30" width="88" height="52" rx="6"/><rect x="26" y="78" width="148" height="70" rx="16"/><rect x="54" y="122" width="92" height="52" rx="5" ${F} opacity=".1"/><rect x="54" y="122" width="92" height="52" rx="5"/><path d="M70 140h60M70 154h40"/><circle cx="150" cy="98" r="4" ${F} stroke="none"/></svg>`,
    "Toner & Ink": `<svg viewBox="0 0 200 200" ${S}><rect x="22" y="70" width="156" height="70" rx="35"/><path d="M62 70v70M138 70v70"/><rect x="82" y="52" width="36" height="18" rx="5"/><circle cx="100" cy="105" r="14" ${F} opacity=".14"/><path d="M100 96c5 6 8 10 8 14a8 8 0 0 1-16 0c0-4 3-8 8-14Z" ${F} stroke="none"/></svg>`,
    "Computer Hardware": `<svg viewBox="0 0 200 200" ${S}><rect x="54" y="54" width="92" height="92" rx="14"/><rect x="78" y="78" width="44" height="44" rx="8" ${F} opacity=".14"/><rect x="78" y="78" width="44" height="44" rx="8"/><path d="M78 54V32M100 54V32M122 54V32M78 146v22M100 146v22M122 146v22M54 78H32M54 100H32M54 122H32M146 78h22M146 100h22M146 122h22"/></svg>`,
  };
  const artFor = (category) => ART[category] || ART[{ "CCTV & Security": "Cameras", Cameras: "Cameras" }[category]] || ART["Computer Hardware"];

  // Products without a photo get a matching illustration (first rule that fits wins).
  const PLACEHOLDERS = [
    [/\b(dvr|nvr|xvr)\b/i, "hik-dvr"],
    [/\b(dome|turret|eyeball)\b/i, "hik-dome", /CCTV/],
    [/\b(bullet|ptz|ip camera|cctv|camera)\b/i, "hik-bullet", /CCTV/],
    [/webcam/i, "cam4"],
    [/\b(toner|cartridge|drum unit)\b/i, "ton1"],
    [/\b(ink bottle|ink refill|refill ink|\bink\b)/i, "ton3"],
    [/\b(receipt|thermal|barcode|label) printer|pos printer/i, "prn3"],
    [/\b(ink ?tank|inkjet|all[- ]in[- ]one printer)/i, "prn2"],
    [/printer|laserjet|\bmfp\b/i, "prn1"],
    [/\b(macbook|laptop|notebook|chromebook|vivobook|zenbook|ideapad|thinkpad|inspiron|vostro|latitude|pavilion|aspire|nitro|predator|swift|rog|tuf|legion|yoga)\b/i, "laptop", /Laptops|Apple/],
    [/\b(iphone|ipad|phone|tablet|\btab\b|galaxy tab)\b/i, "phone"],
    [/\b(smart ?watch|watch|fitness band)\b/i, "watch"],
    [/\b(imac|desktop|all[- ]in[- ]one|aio|mini pc|tower)\b/i, "desktop", /Desktops|Apple/],
    [/\b(keyboard|mouse|combo)\b/i, "hw4"],
    [/\b(monitor|display)\b/i, "hw3", /Monitors/],
    [/\b(router|switch|access point|wi-?fi|poe|lan|ethernet|rj45|cat ?6|fiber|ont|onu)\b/i, "hw5", /Networking/],
    [/\b(ram|ddr\d|so-?dimm)\b/i, "hw2"],
    [/\b(ssd|hdd|nvme|hard (disk|drive)|pen ?drive|flash drive|memory card|micro ?sd|sd card|storage)\b/i, "hw1"],
    [/\b(ups|inverter|battery|stabili[sz]er|surge|power strip)\b/i, "hw6"],
    [/\b(headphones?|headset|earbuds?|earphones?|speakers?|soundbar|microphone|\bmic\b|airpods|tws)\b/i, "audio"],
    [/\b(charger|adapter|cable|hub|dock|power ?bank|converter|usb)\b/i, "charger"],
  ];
  // Used when nothing in the name matches.
  const CATEGORY_PLACEHOLDER = { Laptops: "laptop", Monitors: "hw3", Networking: "hw5", Storage: "hw1", "Power & UPS": "hw6",
    Audio: "audio", Desktops: "desktop", "Chargers & Adapters": "charger" };
  const phCache = new Map();
  const placeholderFor = (p) => {
    if (!phCache.has(p.id)) {
      const hit = PLACEHOLDERS.find(([re, , cat]) => re.test(p.name) && (!cat || cat.test(p.category)));
      const img = hit ? hit[1] : CATEGORY_PLACEHOLDER[p.category];
      phCache.set(p.id, img ? `images/${img}.svg` : null);
    }
    return phCache.get(p.id);
  };

  // Categories, biggest first, "Other" last.
  const catSize = PRODUCTS.reduce((m, p) => m.set(p.category, (m.get(p.category) || 0) + 1), new Map());
  const CATS = [...catSize.keys()].sort((a, b) => (a === "Other") - (b === "Other") || catSize.get(b) - catSize.get(a));
  const BRANDS = [...new Set(PRODUCTS.map((p) => p.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const SORTS = ["featured", "discount", "low", "high", "name"];

  // Shop filters live in the URL (shop.html?cat=Cameras&brand=Hikvision&q=dome&sort=low),
  // so results can be bookmarked and shared, and home-page links land pre-filtered.
  if (IS_SHOP) {
    const u = new URLSearchParams(location.search);
    if (CATS.includes(u.get("cat"))) state.category = u.get("cat");
    if (BRANDS.includes(u.get("brand"))) state.brand = u.get("brand");
    if (SORTS.includes(u.get("sort"))) state.sort = u.get("sort");
    state.query = (u.get("q") || "").slice(0, 80);
    state.deals = u.get("deals") === "1";
    state.page = Math.max(1, parseInt(u.get("page"), 10) || 1);
  }
  function syncUrl() {
    const u = new URLSearchParams();
    if (state.category !== "All") u.set("cat", state.category);
    if (state.brand) u.set("brand", state.brand);
    if (state.query.trim()) u.set("q", state.query.trim());
    if (state.deals) u.set("deals", "1");
    if (state.page > 1) u.set("page", state.page);
    if (state.sort !== "featured") u.set("sort", state.sort);
    const qs = u.toString();
    history.replaceState(null, "", location.pathname + (qs ? `?${qs}` : "") + location.hash);
  }

  // ---------- Static content ----------
  document.title = `${STORE.name} — Cameras, Printers & Computer Hardware`;
  const tel = `tel:${STORE.phone.replace(/[^+\d]/g, "")}`;
  const IC = {
    pin: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    clock: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    phone: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
  };
  IC.chat = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';
  $("announce").innerHTML = `<div class="wrap an-wrap">
      <span class="an-group"><span class="an-item an-addr">${IC.pin}${esc(STORE.address)}</span>
        <span class="an-item an-hours">${IC.clock}${esc(STORE.hours)}</span></span>
      <span class="an-group"><a class="an-item an-phone" href="${tel}">${IC.phone}${esc(STORE.phone)}</a>
        <a class="an-item an-wa" href="https://wa.me/${STORE.whatsapp}" target="_blank" rel="noopener">${IC.chat}WhatsApp</a></span>
    </div>`;
  if ($("hdr-call")) $("hdr-call").href = tel;

  // Header: stronger shadow once the page scrolls
  const hdr = document.querySelector(".header");
  const onScroll = () => hdr.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  $("legal").textContent = `© ${new Date().getFullYear()} ${STORE.legalName}`;
  $("wa-link").href = `https://wa.me/${STORE.whatsapp}`;
  $("phone").href = `tel:${STORE.phone.replace(/[^+\d]/g, "")}`;
  $("phone").textContent = STORE.phone;
  $("address").textContent = STORE.address;
  $("hours").textContent = `${STORE.hours} (closed ${STORE.closedDay})`;
  $("directions").href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Mansa Technology " + STORE.address)}`;

  // Open / closed indicator, evaluated in Nepal time
  function isOpenNow() {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kathmandu", weekday: "short", hour: "numeric", hour12: false })
      .formatToParts(new Date()).reduce((o, x) => (o[x.type] = x.value, o), {});
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
    const hour = Number(parts.hour) % 24;
    const { days, open, close } = STORE.schedule;
    return days.includes(day) && hour >= open && hour < close;
  }
  const status = $("open-status");
  const open = isOpenNow();
  status.textContent = open ? "Open now" : "Closed now";
  status.classList.add(open ? "open" : "closed");

  // Hero: the featured products (several = a slideshow)
  const featIds = Array.isArray(data.featured) ? data.featured : String(data.featured || STORE.featured || "").split(",");
  const feats = [...new Set(featIds)].map((id) => find(String(id).trim())).filter(Boolean);
  if (!feats.length && PRODUCTS[0]) feats.push(PRODUCTS[0]);
  const hero = feats[0];
  if (hero && $("feature")) {
    const f = $("feature");
    f.className = "feature";
    // The optional hero image from admin replaces the first slide's photo only.
    const slideImg = (p, i) => (i === 0 && data.heroImage) || p.image || placeholderFor(p);
    const heroImg = slideImg(hero, 0);
    const artHtml = (src, cat) => (src ? `<img src="${esc(src)}" alt="" draggable="false">` : artFor(cat));

    // One floating card per category around the featured product, preferring
    // products with a real photo, never repeating the hero product.
    const pickFor = (cat) => {
      const pool = PRODUCTS.filter((p) => p.category === cat && !feats.includes(p));
      return pool.find((p) => /\.(jpe?g|png|webp)$/i.test(p.image || "")) || pool.find((p) => p.badge === "Best seller")
        || pool.find((p) => p.discount && placeholderFor(p)) || pool.find((p) => placeholderFor(p)) || pool[0];
    };
    const LABEL = { "CCTV & Security": "CCTV & security", Laptops: "Laptops", Monitors: "Monitors", "PC Components": "PC parts", Networking: "Networking" };
    const tiles = ["CCTV & Security", "Laptops", "Monitors"].map(pickFor).filter(Boolean);
    const tileHtml = tiles.map((p, i) => `
        <button type="button" class="orbit-card oc-${i + 1}" data-id="${esc(p.id)}" aria-label="${esc(p.name)}">
          <span class="oc-pic">${artHtml(p.image || placeholderFor(p), p.category)}</span>
          <span class="oc-cap"><b>${esc(LABEL[p.category] || p.category)}</b><small>from ${money(Math.min(...PRODUCTS.filter((x) => x.category === p.category).map((x) => x.price)))}</small></span>
        </button>`).join("");

    f.innerHTML = `<div class="scene" id="scene">
        <div class="glow g1"></div><div class="glow g2"></div>
        <div class="ring r1"></div><div class="ring r2"></div>
        <div class="pedestal"></div>
        <div class="hero-main">${artHtml(heroImg, hero.category)}</div>
        ${tileHtml}
        <div class="feature-info">
          <span class="fi-thumb">${artHtml(heroImg, hero.category)}</span>
          <span class="fi-label">Now featured</span>
          <span class="badge${hero.badge === "Sale" ? " sale" : ""}">${esc(hero.badge || "Featured")}</span>
          <h3>${esc(hero.name)}</h3>
          <p>${money(hero.price)}${hero.was ? ` <s>${money(hero.was)}</s>` : ""}</p>
          <button class="btn sm" type="button">View product</button>
          ${feats.length > 1 ? `<div class="fi-dots" role="tablist" aria-label="Featured products">${feats.map((p, i) =>
            `<button type="button" class="fi-dot" role="tab" aria-label="${esc(p.name)}" aria-selected="${i === 0}"></button>`).join("")}</div>` : ""}
        </div>
      </div>`;
    let current = 0;
    f.querySelector(".feature-info .btn").onclick = () => openQuick(feats[current]);

    // Slideshow: swap the product shown in the hero tile and the info card
    if (feats.length > 1) {
      const info = f.querySelector(".feature-info");
      const main = f.querySelector(".hero-main");
      const dots = [...f.querySelectorAll(".fi-dot")];
      const show = (i) => {
        current = (i + feats.length) % feats.length;
        const p = feats[current], img = artHtml(slideImg(p, current), p.category);
        main.innerHTML = img;
        info.querySelector(".fi-thumb").innerHTML = img;
        const badge = info.querySelector(".badge");
        badge.textContent = p.badge || "Featured";
        badge.className = "badge" + (p.badge === "Sale" ? " sale" : "");
        info.querySelector("h3").textContent = p.name;
        info.querySelector("p").innerHTML = `${money(p.price)}${p.was ? ` <s>${money(p.was)}</s>` : ""}`;
        dots.forEach((d, k) => d.setAttribute("aria-selected", String(k === current)));
        [main, info].forEach((n) => { n.classList.remove("swap"); void n.offsetWidth; n.classList.add("swap"); });
      };
      dots.forEach((d, k) => { d.onclick = () => { show(k); restart(); }; });
      let timer = 0, paused = false;
      const restart = () => { clearInterval(timer); timer = setInterval(() => { if (!paused && !document.hidden) show(current + 1); }, 5000); };
      f.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") paused = true; });
      f.addEventListener("pointerleave", () => { paused = false; });
      let x0 = null;  // swipe on phones
      info.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
      info.addEventListener("touchend", (e) => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0; x0 = null;
        if (Math.abs(dx) > 40) { show(current + (dx < 0 ? 1 : -1)); restart(); }
      });
      restart();
    }
    f.querySelectorAll(".orbit-card").forEach((b) => { b.onclick = () => openQuick(find(b.dataset.id)); });
  }

  // ---------- Smooth scrolling (eased, so header links glide instead of jump) ----------
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
  let scrollRaf = 0;

  function scrollToY(target, done) {
    cancelAnimationFrame(scrollRaf);
    const max = document.documentElement.scrollHeight - innerHeight;
    const to = Math.max(0, Math.min(target, max));
    const from = scrollY;
    const dist = to - from;
    if (reduceMotion || Math.abs(dist) < 2) { scrollTo(0, to); if (done) done(); return; }
    const dur = Math.min(1500, Math.max(850, Math.abs(dist) * 0.75));
    const t0 = performance.now();
    const cancel = () => { cancelAnimationFrame(scrollRaf); cleanup(); if (done) done(); };
    const cleanup = () => { removeEventListener("wheel", cancel); removeEventListener("touchstart", cancel); };
    addEventListener("wheel", cancel, { passive: true });
    addEventListener("touchstart", cancel, { passive: true });
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      scrollTo(0, from + dist * easeInOutCubic(t));
      if (t < 1) scrollRaf = requestAnimationFrame(step);
      else { cleanup(); if (done) done(); }
    };
    scrollRaf = requestAnimationFrame(step);
  }

  function scrollToEl(node, done) {
    const header = document.querySelector(".header");
    const offset = header ? header.offsetHeight : 0;
    scrollToY(node.getBoundingClientRect().top + scrollY - offset, done);
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const id = a.getAttribute("href").slice(1);
    const node = id && id !== "top" ? document.getElementById(id) : null;
    if (id && id !== "top" && !node) return;
    e.preventDefault();
    const cat = a.dataset.cat;
    if (cat && IS_SHOP) {
      setCategory(cat, { keepInPlace: false });
      scrollToEl(resultsTop());
      return;
    }
    if (node) scrollToEl(node); else scrollToY(0);
    history.replaceState(null, "", node ? `#${id}` : location.pathname + location.search);
  });

  // ---------- Header: sliding underline that follows the active / hovered link ----------
  const nav = document.querySelector(".nav");
  const ink = el("span", { className: "nav-ink" });
  nav.append(ink);
  function moveInk(target) {
    const a = target || nav.querySelector("a.active");
    if (!a) { ink.style.opacity = "0"; return; }
    ink.style.opacity = "1";
    ink.style.width = `${a.offsetWidth}px`;
    ink.style.transform = `translateX(${a.offsetLeft}px)`;
  }
  nav.addEventListener("mouseover", (e) => { const a = e.target.closest("a"); if (a) moveInk(a); });
  nav.addEventListener("mouseleave", () => moveInk());
  addEventListener("resize", () => moveInk());

  // ---------- Catalogue ----------
  function visible() {
    const q = state.query.trim().toLowerCase();
    let items = PRODUCTS.filter((p) =>
      (state.category === "All" || p.category === state.category) &&
      (!state.brand || p.brand === state.brand) &&
      (!state.deals || p.discount > 0) &&
      (!q || `${p.name} ${p.brand || ""} ${p.category} ${p.description}`.toLowerCase().includes(q)));
    if (state.sort === "discount") items = [...items].sort((a, b) => (b.discount || 0) - (a.discount || 0));
    if (state.sort === "low") items = [...items].sort((a, b) => a.price - b.price);
    if (state.sort === "high") items = [...items].sort((a, b) => b.price - a.price);
    if (state.sort === "name") items = [...items].sort((a, b) => a.name.localeCompare(b.name));
    return items;
  }

  // Per-product image size (zoom %), orientation (rotate/flip) and fit, set in the admin panel.
  function applyImgStyle(img, p) {
    const z = (p.imgScale || 100) / 100;
    if (p.imgRotate) img.style.rotate = `${p.imgRotate}deg`;
    if (z !== 1 || p.imgFlip) img.style.scale = `${p.imgFlip ? -z : z} ${z}`;
    if (p.imgFit) img.style.objectFit = p.imgFit;
  }

  function mediaFor(p) {
    const m = el("div", { className: "media" });
    if (p.image) {
      m.classList.add("photo");
      const img = el("img", { src: p.image, alt: p.name, loading: "lazy" });
      applyImgStyle(img, p);
      m.append(img);
    } else if (placeholderFor(p)) {
      m.classList.add("ph");
      m.append(el("img", { src: placeholderFor(p), alt: "", loading: "lazy" }));
    } else m.innerHTML = artFor(p.category);
    return m;
  }

  function priceEl(p) {
    const s = el("div", { className: "price" + (p.was ? " sale" : ""), textContent: money(p.price) });
    if (p.was) s.append(el("s", { textContent: money(p.was) }));
    return s;
  }

  // Chips are built once so their state can transition; a pill slides behind the selected one.
  let chipInk = null;
  function moveChipInk() {
    if (!chipInk) return;
    const sel = $("filters").querySelector('[aria-selected="true"]');
    if (!sel) return;
    chipInk.style.width = `${sel.offsetWidth}px`;
    chipInk.style.height = `${sel.offsetHeight}px`;
    chipInk.style.transform = `translate(${sel.offsetLeft}px, ${sel.offsetTop}px)`;
  }
  function renderFilters() {
    const box = $("filters");
    if (!chipInk) {
      chipInk = el("span", { className: "chip-ink" });
      box.append(chipInk, ...["All", ...CATS].map((c) => {
        const b = el("button", { textContent: c, type: "button" });
        b.dataset.chip = c;
        b.setAttribute("role", "tab");
        b.onclick = () => setCategory(c);
        return b;
      }));
    }
    box.querySelectorAll("[data-chip]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.chip === state.category)));
    moveChipInk();
    document.querySelectorAll(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.cat === state.category));
    if (typeof moveInk === "function") moveInk();
  }
  addEventListener("resize", () => moveChipInk());

  function cardFor(p, i) {
      const media = mediaFor(p);
      if (p.badge) media.append(el("span", { className: "badge" + (isSale(p) ? " sale" : ""), textContent: p.badge }));
      const add = el("button", { className: "btn sm quick-add", type: "button", textContent: "Add to bag" });
      add.onclick = (e) => { e.stopPropagation(); addToCart(p.id, 1); };
      media.append(add);
      const card = el("article", { className: "card", tabIndex: 0 },
        media,
        el("div", { className: "info" },
          el("div", { className: "cat", textContent: p.brand ? `${p.brand} · ${p.category}` : p.category }),
          el("h3", { textContent: p.name }),
          priceEl(p)));
      card.dataset.id = p.id;
      card.style.animationDelay = `${Math.min(i, 8) * 35}ms`;
      card.onclick = () => openQuick(p);
      card.onkeydown = (e) => { if (e.key === "Enter") openQuick(p); };
      return card;
  }

  function renderGrid() {
    const items = visible();
    $("result-count").textContent = `${items.length} ${items.length === 1 ? "item" : "items"}`;
    $("none").hidden = items.length > 0;
    const pages = Math.max(1, Math.ceil(items.length / PAGE));
    state.page = Math.min(Math.max(1, state.page), pages);
    const start = (state.page - 1) * PAGE;
    $("grid").replaceChildren(...items.slice(start, start + PAGE).map(cardFor));
    if (pages > 1) $("result-count").textContent = `${(start + 1).toLocaleString("en-IN")}–${Math.min(start + PAGE, items.length).toLocaleString("en-IN")} of ${items.length.toLocaleString("en-IN")}`;
    renderPager(pages);
    $("on-sale").checked = state.deals;
    // "Discount now" belongs to the general view; hide it while a category is chosen.
    $("deals").hidden = state.category !== "All" || !PRODUCTS.some((p) => p.discount);
    $("clear-filters").hidden = state.category === "All" && !state.brand && !state.query.trim() && !state.deals;
    syncUrl();
  }

  // Page numbers: ‹ 1 … 4 5 6 … 52 ›
  function renderPager(pages) {
    const nav = $("pager");
    nav.hidden = pages <= 1;
    if (pages <= 1) { nav.replaceChildren(); return; }
    const p = state.page;
    const nums = [...new Set([1, p - 1, p, p + 1, pages].filter((n) => n >= 1 && n <= pages))].sort((a, b) => a - b);
    const go = (n) => {
      state.page = n;
      renderGrid();
      scrollToEl($("result-count").closest(".shop-top"));
    };
    const btn = (label, n, { cls = "", aria, disabled = false } = {}) => {
      const b = el("button", { type: "button", className: `pg ${cls}`.trim(), textContent: label, disabled });
      if (aria) b.setAttribute("aria-label", aria);
      if (n === p && !cls) b.setAttribute("aria-current", "page");
      if (!disabled && n !== p) b.onclick = () => go(n);
      return b;
    };
    const parts = [btn("‹", p - 1, { cls: "pg-nav", aria: "Previous page", disabled: p === 1 })];
    nums.forEach((n, i) => {
      if (i && n - nums[i - 1] > 1) parts.push(el("span", { className: "pg-gap", textContent: "…" }));
      parts.push(btn(String(n), n, { aria: `Page ${n}` }));
    });
    parts.push(btn("›", p + 1, { cls: "pg-nav", aria: "Next page", disabled: p === pages }));
    nav.replaceChildren(...parts);
  }

  function clearFilters() {
    state.brand = ""; state.query = ""; state.deals = false; state.page = 1;
    $("brand").value = ""; $("search").value = "";
    if (state.category !== "All") setCategory("All"); else swapGrid();
  }

  // Home page: best sellers first, then the rest of the catalogue.
  // Home page: one product from each of the biggest categories, best deal first.
  function renderHome() {
    const picks = CATS.filter((c) => c !== "Other").slice(0, 8).map((c) => {
      const pool = PRODUCTS.filter((p) => p.category === c);
      return [...pool].sort((a, b) => (b.discount || 0) - (a.discount || 0)).find((p) => p.image || placeholderFor(p)) || pool[0];
    }).filter(Boolean);
    $("home-grid").replaceChildren(...picks.map(cardFor));
  }

  // "Discount now": every product with a discount, regardless of the filters below.
  function renderDeals() {
    const deals = PRODUCTS.filter((p) => p.discount).sort((a, b) => b.discount - a.discount);
    const limit = Number($("deals").dataset.limit) || deals.length;
    // On the shop, "Discount now" only shows for All (also when arriving via shop.html?cat=...).
    $("deals").hidden = deals.length === 0 || (IS_SHOP && state.category !== "All");
    $("deals-grid").replaceChildren(...deals.slice(0, limit).map(cardFor));
  }

  // Grid swap: show the new results at once with a light fade-in (CSS), no long chained animations.
  function swapGrid() {
    renderGrid();
    const grid = $("grid");
    grid.classList.remove("flip", "fresh");
    void grid.offsetWidth;  // restart the entrance animation
    grid.classList.add("fresh");
  }
  const resultsTop = () => $("result-count").closest(".shop-top");

  // Switch category. "Discount now" hides at the same moment, and by default the page is
  // nudged so the category pills stay put on screen instead of jumping when content above changes.
  function setCategory(c, { keepInPlace = true } = {}) {
    if (c === state.category) return;
    const anchor = $("filters");
    const before = anchor.getBoundingClientRect().top;
    state.category = c;
    state.page = 1;
    if ($("deals")) $("deals").hidden = c !== "All" || !PRODUCTS.some((p) => p.discount);
    renderFilters();
    swapGrid();
    if (keepInPlace) {
      const shift = anchor.getBoundingClientRect().top - before;
      if (Math.abs(shift) > 1) scrollBy({ top: shift, behavior: "instant" });
    }
  }

  if (IS_SHOP) {
    let searchTimer = 0;
    $("search").value = state.query;
    $("search").addEventListener("input", (e) => {
      state.query = e.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.page = 1; swapGrid(); }, 140);
    });
    $("brand").append(...BRANDS.map((b) => el("option", { value: b, textContent: b })));
    $("brand").hidden = BRANDS.length === 0;
    $("brand").value = state.brand;
    $("brand").addEventListener("change", (e) => { state.brand = e.target.value; state.page = 1; swapGrid(); });
    $("on-sale").addEventListener("change", (e) => { state.deals = e.target.checked; state.page = 1; swapGrid(); });
    $("sort").value = state.sort;
    $("sort").addEventListener("change", (e) => { state.sort = e.target.value; state.page = 1; swapGrid(); });
    $("clear-filters").onclick = clearFilters;
    $("none-clear").onclick = clearFilters;
    $("search-btn").onclick = () => scrollToEl($("shop"), () => $("search").focus({ preventScroll: true }));
    if (location.hash === "#search") requestAnimationFrame(() => $("search").focus());
  } else {
    $("search-btn").onclick = () => { location.href = "shop.html#search"; };
  }

  // ---------- Quick view ----------
  // One feature per line becomes a bullet list; a single line stays a paragraph.
  function descEl(text) {
    const lines = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return el("p", { className: "desc", textContent: lines[0] || "" });
    return el("ul", { className: "desc desc-list" }, ...lines.map((l) => el("li", { textContent: l })));
  }

  function openQuick(p) {
    let qty = 1;
    const dlg = $("quick");
    const qtyEl = el("span", { textContent: "1" });
    const minus = el("button", { type: "button", textContent: "−", ariaLabel: "Decrease" });
    const plus = el("button", { type: "button", textContent: "+", ariaLabel: "Increase" });
    minus.onclick = () => { qty = Math.max(1, qty - 1); qtyEl.textContent = qty; };
    plus.onclick = () => { qty += 1; qtyEl.textContent = qty; };
    const add = el("button", { className: "btn", type: "button", textContent: "Add to bag" });
    add.onclick = () => { addToCart(p.id, qty); dlg.close(); };
    const close = el("button", { className: "icon qv-close", type: "button", textContent: "×", ariaLabel: "Close" });
    close.onclick = () => dlg.close();

    const specs = el("ul", { className: "specs" }, ...(p.specs || []).map(([k, v]) =>
      el("li", {}, el("span", { textContent: k }), el("b", { textContent: v, style: "font-weight:500" }))));

    const media = mediaFor(p);
    if (p.badge) media.append(el("span", { className: "badge" + (isSale(p) ? " sale" : ""), textContent: p.badge }));

    dlg.replaceChildren(el("div", { className: "qv" },
      media,
      el("div", { className: "qv-body" },
        close,
        el("div", { className: "cat", textContent: p.category }),
        el("h3", { textContent: p.name }),
        p.brand ? el("div", { className: "brand", textContent: `Brand: ${p.brand}` }) : null,
        priceEl(p),
        descEl(p.description),
        specs,
        el("div", { className: "qv-actions" }, el("div", { className: "qty" }, minus, qtyEl, plus), add))));
    if (!dlg.open) {
      try { dlg.showModal(); } catch { return; }  // e.g. another popup is still open
      quickLocked = true;
      lockScroll();
    }
  }
  $("quick").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  // Release the page when the popup closes, however it closes (×, backdrop, Esc, Add to bag).
  // Watching the "open" attribute is more dependable than the close event alone.
  let quickLocked = false;
  const releaseQuick = () => { if (quickLocked && !$("quick").open) { quickLocked = false; unlockScroll(); } };
  $("quick").addEventListener("close", releaseQuick);
  new MutationObserver(releaseQuick).observe($("quick"), { attributes: true, attributeFilter: ["open"] });

  // ---------- Bag ----------
  const EASE_OUT = "cubic-bezier(.22, 1, .36, 1)";
  const WA_ICON = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>';
  const entries = () => Object.entries(cart).map(([id, qty]) => ({ p: find(id), qty })).filter((e) => e.p);
  const total = () => entries().reduce((s, e) => s + e.p.price * e.qty, 0);
  const lineEls = new Map();
  let orderNote = "";

  function addToCart(id, n, { silent = false } = {}) {
    cart[id] = (cart[id] || 0) + n;
    save(); renderCart();
    if (!silent) toast(`${find(id).name} added to bag`);
  }
  function setQty(id, q) {
    if (q <= 0) delete cart[id]; else cart[id] = q;
    save(); renderCart();
  }

  function thumbFor(p) {
    const t = el("div", { className: "thumb" });
    if (p.image || placeholderFor(p)) t.append(el("img", { src: p.image || placeholderFor(p), alt: "" }));
    else t.innerHTML = artFor(p.category);
    return t;
  }

  function buildLine(p) {
    const minus = el("button", { type: "button", textContent: "−", ariaLabel: "Decrease quantity" });
    const plus = el("button", { type: "button", textContent: "+", ariaLabel: "Increase quantity" });
    const rm = el("button", { className: "remove", type: "button", textContent: "×", ariaLabel: `Remove ${p.name}` });
    const qtyEl = el("span");
    const amount = el("div", { className: "amount" });
    minus.onclick = () => setQty(p.id, (cart[p.id] || 0) - 1);
    plus.onclick = () => setQty(p.id, (cart[p.id] || 0) + 1);
    rm.onclick = () => setQty(p.id, 0);
    const node = el("div", { className: "line" },
      thumbFor(p),
      el("div", { className: "meta" },
        el("div", { className: "top" },
          el("div", {}, el("div", { className: "name", textContent: p.name }), el("div", { className: "cat", textContent: p.category })),
          rm),
        el("div", { className: "bottom" },
          el("div", { className: "qty" }, minus, qtyEl, plus),
          amount)));
    node._qty = qtyEl;
    node._amount = amount;
    return node;
  }

  // Browsers may never start an animation on a hidden element (the closed bag), which would leave
  // the row stuck at its first keyframe: invisible. So only animate visible rows, and force any
  // animation that hasn't finished in time to its end.
  const settle = (a, ms, done) => setTimeout(() => {
    if (a.playState === "finished") return;
    try { a.finish(); } catch { a.cancel(); }
    if (done) done();
  }, ms);
  function enterLine(node, delay = 0) {
    if (reduceMotion || !node.animate || !$("drawer").classList.contains("open")) return;
    node.getAnimations().forEach((a) => a.cancel());
    const h = node.offsetHeight;
    if (!h) return;
    const a = node.animate(
      [{ height: "0px", opacity: 0, transform: "translateX(28px)", paddingTop: 0, paddingBottom: 0 },
       { height: `${h}px`, opacity: 1, transform: "none" }],
      { duration: 520, delay, easing: EASE_OUT, fill: "backwards" });
    settle(a, delay + 900);
  }
  function leaveLine(node, delay = 0) {
    if (reduceMotion || !node.animate) { node.remove(); return; }
    const h = node.offsetHeight;
    const a = node.animate(
      [{ height: `${h}px`, opacity: 1, transform: "none" },
       { height: "0px", opacity: 0, transform: "translateX(-28px)", paddingTop: 0, paddingBottom: 0 }],
      { duration: 380, delay, easing: EASE_OUT, fill: "both" });
    a.onfinish = () => node.remove();
    settle(a, delay + 800, () => node.remove());
  }

  // Count the subtotal up/down instead of snapping
  let shownTotal = 0;
  let totalRaf = 0;
  let totalTimer = 0;
  function animateTotal(to) {
    cancelAnimationFrame(totalRaf);
    clearTimeout(totalTimer);
    // Safety net: whatever the frame timer does, the real total is shown shortly after.
    totalTimer = setTimeout(() => { cancelAnimationFrame(totalRaf); shownTotal = to; $("cart-total").textContent = money(to); }, 600);
    const from = shownTotal;
    const out = $("cart-total");
    if (reduceMotion || from === to) { shownTotal = to; out.textContent = money(to); return; }
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.max(0, Math.min(1, (now - t0) / 450));  // frame time can be slightly before t0
      shownTotal = Math.round(from + (to - from) * (1 - (1 - t) ** 3));
      out.textContent = money(shownTotal);
      if (t < 1) totalRaf = requestAnimationFrame(step);
    };
    totalRaf = requestAnimationFrame(step);
  }

  // Compact product row with an "Add" button, used in suggestions
  function miniRow(p) {
    const add = el("button", { className: "btn sm ghost", type: "button", textContent: "Add" });
    add.onclick = () => {
      addToCart(p.id, 1, { silent: true });
      add.textContent = "Added";
      add.disabled = true;
    };
    return el("div", { className: "mini" },
      thumbFor(p),
      el("div", {}, el("div", { className: "nm", textContent: p.name }), el("div", { className: "pr", textContent: money(p.price) })),
      add);
  }

  // Installation kit: what else is needed to install what's in the bag, with suggested quantities.
  function installSection(groups) {
    const items = groups.flatMap((g) => g.items);
    const kitTotal = items.reduce((s, i) => s + i.product.price * i.qty, 0);
    const addAll = el("button", { className: "btn sm block kit-all", type: "button",
      textContent: `Add everything · ${money(kitTotal)}` });
    addAll.onclick = () => {
      items.forEach((i) => addToCart(i.product.id, i.qty, { silent: true }));
      toast(`Added ${items.length} installation item${items.length > 1 ? "s" : ""}`);
    };
    const row = (i) => {
      const p = i.product;
      const add = el("button", { className: "btn sm ghost", type: "button", textContent: "Add" });
      add.onclick = () => { addToCart(p.id, i.qty, { silent: true }); toast(`${i.label} added`); };
      const qty = i.unit ? `${i.qty} ${i.unit} × ${money(p.price)}` : i.qty > 1 ? `${i.qty} × ${money(p.price)}` : money(p.price);
      return el("div", { className: "mini kit" },
        thumbFor(p),
        el("div", {},
          el("div", { className: "kit-need", textContent: i.label }),
          el("div", { className: "nm", textContent: p.name }),
          el("div", { className: "why", textContent: i.why }),
          el("div", { className: "pr", textContent: qty })),
        add);
    };
    return [
      el("h4", { textContent: "Complete your installation" }),
      el("p", { className: "kit-sub", textContent: "Everything else you'll need, picked to fit what's in your bag. We'll double-check it before installing." }),
      ...groups.flatMap((g) => [el("div", { className: "kit-group", textContent: g.title }), ...g.items.map(row)]),
      addAll,
    ];
  }

  const COMPLEMENT = { Laptops: "Peripherals", Desktops: "Monitors", Monitors: "Peripherals", Apple: "Accessories",
    "CCTV & Security": "Storage", Cameras: "Storage", Networking: "Power & UPS", "PC Components": "Power & UPS", Peripherals: "Audio" };
  const topDeals = () => [...PRODUCTS].filter((p) => p.discount).sort((a, b) => b.discount - a.discount);
  function suggestions(inCart) {
    const have = new Set(inCart.map((e) => e.p.id));
    const wanted = [...new Set(inCart.map((e) => COMPLEMENT[e.p.category]).filter(Boolean))];
    const pool = PRODUCTS.filter((p) => !have.has(p.id));
    const first = pool.filter((p) => wanted.includes(p.category));
    const rest = topDeals().filter((p) => !have.has(p.id) && !wanted.includes(p.category));
    return [...first, ...rest].slice(0, 3);
  }

  function renderEmpty() {
    const picks = topDeals().slice(0, 3);
    const shopBtn = el("button", { className: "btn", type: "button", textContent: "Browse the shop" });
    shopBtn.onclick = () => { closeCart(); scrollToEl($("shop")); };
    const sg = el("section", { className: "suggest" }, el("h4", { textContent: "Popular right now" }), ...picks.map(miniRow));
    const art = el("div", { className: "bag-art" });
    art.innerHTML = WA_ICON;
    $("bag-empty").replaceChildren(art, el("h3", { textContent: "Your bag is empty" }),
      el("p", { textContent: "Add something and it will show up here." }), shopBtn, sg);
  }

  function renderCart() {
    const list = entries();
    const count = list.reduce((s, e) => s + e.qty, 0);

    // header badge
    const badge = $("cart-count");
    const prev = Number(badge.textContent) || 0;
    badge.textContent = count;
    badge.hidden = count === 0;
    if (count > prev && !reduceMotion) {
      badge.classList.remove("bump");
      void badge.offsetWidth;
      badge.classList.add("bump");
    }
    $("bag-sub").textContent = count ? `${count} ${count === 1 ? "item" : "items"}` : "";
    animateTotal(total());
    $("drawer").classList.toggle("is-empty", list.length === 0);

    // reconcile lines in place so adds/removes/quantity changes can animate
    const ids = new Set(list.map((e) => e.p.id));
    let out = 0;
    lineEls.forEach((node, id) => { if (!ids.has(id)) { leaveLine(node, out++ * 60); lineEls.delete(id); } });
    list.forEach(({ p, qty }) => {
      let node = lineEls.get(p.id);
      const isNew = !node;
      if (isNew) { node = buildLine(p); lineEls.set(p.id, node); $("cart-items").append(node); }
      const qtyChanged = node._qty.textContent !== String(qty);
      node._qty.textContent = qty;
      node._amount.textContent = money(p.price * qty);
      if (isNew) enterLine(node);
      else if (qtyChanged && !reduceMotion) {
        node._qty.animate([{ transform: "translateY(-8px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 260, easing: EASE_OUT });
        node._amount.animate([{ opacity: .3 }, { opacity: 1 }], { duration: 260 });
      }
    });

    // "Complete your installation" (install.js), else general "You may also need"
    const sg = $("suggest");
    const kit = list.length && window.MansaInstall ? window.MansaInstall.plan(list, PRODUCTS) : [];
    if (kit.length) {
      sg.hidden = false;
      sg.replaceChildren(...installSection(kit));
    } else {
      const picks = list.length ? suggestions(list) : [];
      sg.hidden = picks.length === 0;
      sg.replaceChildren(...(picks.length ? [el("h4", { textContent: "You may also need" }), ...picks.map(miniRow)] : []));
    }
    if (!list.length) renderEmpty();
  }

  // Freeze the page behind popups and the bag, so scrolling them never scrolls the site.
  let lockCount = 0, lockY = 0;
  function lockScroll() {
    if (lockCount++) return;
    lockY = scrollY;
    Object.assign(document.body.style, { position: "fixed", top: `-${lockY}px`, left: "0", right: "0", width: "100%" });
  }
  function unlockScroll() {
    if (!lockCount || --lockCount) return;
    Object.assign(document.body.style, { position: "", top: "", left: "", right: "", width: "" });
    scrollTo({ top: lockY, behavior: "instant" });
  }

  let lastFocus = null;
  function openCart() {
    if (!$("drawer").classList.contains("open")) lockScroll();
    lastFocus = document.activeElement;
    document.documentElement.classList.add("bag-open");
    $("drawer").classList.add("open");
    $("drawer").setAttribute("aria-hidden", "false");
    $("overlay").classList.add("open");
    $("note-wrap").querySelector("textarea").value = orderNote;
    if (!reduceMotion) [...$("cart-items").children].forEach((n, i) => enterLine(n, 120 + i * 60));
    setTimeout(() => $("close-cart").focus({ preventScroll: true }), 50);
  }
  function closeCart() {
    if ($("drawer").classList.contains("open")) unlockScroll();
    document.documentElement.classList.remove("bag-open");
    $("drawer").classList.remove("open");
    $("drawer").setAttribute("aria-hidden", "true");
    $("overlay").classList.remove("open");
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  $("open-cart").onclick = openCart;
  $("close-cart").onclick = closeCart;
  $("overlay").onclick = closeCart;
  $("order-note").addEventListener("input", (e) => { orderNote = e.target.value; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("drawer").classList.contains("open")) closeCart(); });

  let toastTimer;
  function toast(msg, action) {
    const t = $("toast");
    t.replaceChildren(el("span", { textContent: msg }));
    t.classList.toggle("has-action", Boolean(action));
    if (action) {
      const b = el("button", { className: "undo", type: "button", textContent: action.label });
      b.onclick = () => { t.classList.remove("show"); action.onClick(); };
      t.append(b);
    }
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), action ? 6000 : 1800);
  }

  // Clear the bag: each visible item tips over and falls into the dustbin.
  let clearing = false;

  function fallIntoBin(done) {
    const bin = $("clear-bag");
    const view = $("drawer-body").getBoundingClientRect();
    const br = bin.getBoundingClientRect();
    const tx = br.left + br.width / 2;
    const ty = br.top + br.height * 0.3;
    const layer = el("div", { className: "fall-layer" });
    document.body.append(layer);
    bin.classList.add("open");

    const nodes = [...lineEls.values()];
    let pending = 0;
    const settle = () => {
      layer.remove();
      bin.classList.remove("open");
      done();
    };
    const gulp = () => {
      const icon = bin.firstElementChild;
      icon.animate([{ transform: "scale(1)" }, { transform: "scale(1.3)" }, { transform: "scale(1)" }],
        { duration: 240, easing: EASE_OUT });
    };

    nodes.forEach((node) => {
      const r = node.getBoundingClientRect();
      const offscreen = r.bottom < view.top || r.top > view.bottom;
      if (!offscreen) {
        const i = pending++;
        const ghost = node.cloneNode(true);
        Object.assign(ghost.style, {
          position: "fixed", left: `${r.left}px`, top: `${r.top}px`,
          width: `${r.width}px`, height: `${r.height}px`, margin: "0", boxSizing: "border-box",
        });
        layer.append(ghost);
        const dx = tx - (r.left + r.width / 2);
        const dy = ty - (r.top + r.height / 2);
        const rot = (i % 2 ? 1 : -1) * (14 + Math.random() * 16);
        const a = ghost.animate([
          { transform: "translate(0, 0) rotate(0deg) scale(1)", opacity: 1, offset: 0, easing: "cubic-bezier(.2, .8, .3, 1)" },
          { transform: `translate(${dx * 0.1}px, -12px) rotate(${rot * 0.35}deg) scale(1.03)`, opacity: 1, offset: 0.2, easing: "cubic-bezier(.55, 0, .9, .45)" },
          { transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(.08)`, opacity: 0.2, offset: 1 },
        ], { duration: 760, delay: i * 110, easing: "linear", fill: "both" });
        a.onfinish = () => { gulp(); if (--pending === 0) setTimeout(settle, 160); };
      }
      node.style.visibility = "hidden";
    });
    if (pending === 0) setTimeout(settle, 0);
  }

  $("clear-bag").onclick = () => {
    if (clearing) return;
    const snapshot = { cart: { ...cart }, note: orderNote };
    if (!Object.keys(snapshot.cart).length) return;
    clearing = true;
    $("clear-bag").disabled = true;

    const commit = () => {
      lineEls.forEach((n) => n.remove());
      lineEls.clear();
      cart = {}; orderNote = "";
      $("order-note").value = "";
      save(); renderCart();
      clearing = false;
      $("clear-bag").disabled = false;
      toast("Bag cleared", {
        label: "Undo",
        onClick: () => { cart = snapshot.cart; orderNote = snapshot.note; $("order-note").value = orderNote; save(); renderCart(); },
      });
    };

    if (reduceMotion) commit(); else fallIntoBin(commit);
  };

  // ---------- Checkout: sends the order to WhatsApp ----------
  const dialog = $("checkout");
  const form = $("checkout-form");
  let waUrl = "";

  const showStep = (done) => { $("co-form").hidden = done; $("co-done").hidden = !done; };
  const syncMethod = () => {
    const pickup = form.elements.method.value === "pickup";
    $("addr-wrap").classList.toggle("off", pickup);
    form.elements.address.required = !pickup;
  };
  form.querySelectorAll('input[name="method"]').forEach((r) => r.addEventListener("change", syncMethod));

  $("checkout-btn").onclick = () => { closeCart(); showStep(false); syncMethod(); dialog.showModal(); };
  $("cancel-checkout").onclick = () => dialog.close();
  dialog.addEventListener("click", (e) => { if (e.target === dialog && !$("co-form").hidden) dialog.close(); });

  function orderMessage(f) {
    const pickup = f.get("method") === "pickup";
    const lines = entries().map(({ p, qty }) => `• ${qty} x ${p.name} — ${money(p.price * qty)}`);
    return [
      `New order from the ${STORE.name} website`,
      "",
      `Name: ${f.get("name")}`,
      `Phone: ${f.get("phone")}`,
      pickup ? `Pick up at: ${STORE.address}` : `Deliver to: ${f.get("address")}`,
      "",
      "Items:", ...lines,
      "",
      `Subtotal: ${money(total())}`,
      ...(orderNote.trim() ? ["", `Note: ${orderNote.trim()}`] : []),
    ].join("\n");
  }
  const openWhatsApp = () => {
    const w = window.open(waUrl, "_blank");
    if (w) w.opener = null; else location.href = waUrl;
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!entries().length) return;
    const fd = new FormData(form);
    waUrl = `https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(orderMessage(fd))}`;
    showStep(true);
    openWhatsApp();
    // Also keep a copy of the order in Supabase (no-op on the local server).
    window.MansaData.saveOrder({
      name: fd.get("name"), phone: fd.get("phone"), method: fd.get("method"),
      address: fd.get("method") === "pickup" ? "" : fd.get("address"), note: orderNote,
      items: entries().map(({ p, qty }) => ({ id: p.id, name: p.name, qty, price: p.price })),
      total: total(),
    });
  });
  $("wa-again").onclick = openWhatsApp;
  $("co-done-btn").onclick = () => {
    cart = {}; orderNote = ""; save(); renderCart();
    form.reset(); dialog.close();
  };

  // ---------- Hero 3D tilt: eases toward the pointer, idles gently on touch ----------
  (function heroTilt() {
    const band = document.querySelector(".hero-band");
    const scene = $("scene");
    if (!band || !scene || reduceMotion) return;
    const MAX = 11; // degrees
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, visible = true;

    const frame = () => {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      scene.style.setProperty("--rx", `${(-cy * MAX).toFixed(2)}deg`);
      scene.style.setProperty("--ry", `${(cx * MAX).toFixed(2)}deg`);
      scene.style.setProperty("--lx", `${(cx * 40).toFixed(1)}px`);
      scene.style.setProperty("--ly", `${(cy * 40).toFixed(1)}px`);
      raf = visible ? requestAnimationFrame(frame) : 0;
    };
    const start = () => { if (!raf) raf = requestAnimationFrame(frame); };

    band.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch") return;
      const r = scene.getBoundingClientRect();
      tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (innerWidth / 2)));
      ty = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (innerHeight / 2)));
    });
    band.addEventListener("pointerleave", () => { tx = 0; ty = 0; });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) start(); }).observe(band);
    }
    start();
  })();

  if (IS_SHOP) {
    renderFilters();
    renderGrid();
  } else {
    renderHome();
  }
  renderDeals();
  renderCart();
  moveInk();
  if (IS_SHOP) {
    moveChipInk();
    $("grid").classList.add("flip");
  }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    nav.classList.add("ready");
    if (IS_SHOP) $("filters").classList.add("ready");
  }));
})();
