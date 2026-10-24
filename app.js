(async () => {
  const { STORE } = window;
  // The catalogue lives in store.json (edited from admin.html)
  let data = {};
  try {
    const r = await fetch("store.json", { cache: "no-store" });
    if (r.ok) data = await r.json();
  } catch {}
  // A product's `price` is its regular price; `discount` (percent) lowers it. After this,
  // `price` is what the customer pays and `was` the struck-through regular price.
  const PRODUCTS = (Array.isArray(data.products) ? data.products : []).map((p) => {
    const d = Number(p.discount) || 0;
    if (d <= 0 || d >= 100) return { ...p, discount: 0 };
    return { ...p, discount: d, was: p.price, price: Math.round(p.price * (1 - d / 100)), badge: p.badge || `-${d}%` };
  });
  const isSale = (p) => Boolean(p.discount) || p.badge === "Sale";
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (id) => document.getElementById(id);
  const money = (n) => `${STORE.currency} ${n.toLocaleString("en-IN")}`;
  const CART_KEY = "mansa-cart";

  let cart = {};
  try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch { cart = {}; }
  const state = { category: "All", brand: "", query: "", sort: "featured" };

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
  const artFor = (category) => ART[category] || ART["Computer Hardware"];
  const CATS = [...new Set(PRODUCTS.map((p) => p.category))];

  // ---------- Static content ----------
  document.title = `${STORE.name} — Cameras, Printers & Computer Hardware`;
  $("announce").textContent = `${STORE.address}  ·  ${STORE.hours}  ·  ${STORE.phone}`;
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

  // Hero: one featured product
  const hero = find(data.featured) || find(STORE.featured) || PRODUCTS[0];
  if (hero) {
    const ICON_CLOCK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
    const ICON_PIN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.200 7-11a7 7 0 0 0-14 0c0 4.800 7 11 7 11z"/><circle cx="12" cy="10" r="2.500"/></svg>';
    const f = $("feature");
    f.className = "feature";
    const heroImg = data.heroImage || hero.image;
    const heroArt = heroImg ? `<img src="${esc(heroImg)}" alt="">` : artFor(hero.category);
    const slices = Array.from({ length: 6 }, (_, i) => `<span class="slice" style="--i:${i}">${heroArt}</span>`).join("");
    f.innerHTML = `<div class="scene" id="scene">
        <div class="orb"></div>
        <div class="floor"></div>
        <div class="art3d">${slices}</div>
        <div class="float-chip chip-a"><b>${ICON_CLOCK}</b><div>Sun to Fri<small>10 AM – 6 PM</small></div></div>
        <div class="float-chip chip-b"><b>${ICON_PIN}</b><div>Jorpati<small>Kathmandu, Nepal</small></div></div>
        <div class="feature-info">
          <span class="badge${hero.badge === "Sale" ? " sale" : ""}">${esc(hero.badge || "Featured")}</span>
          <h3>${esc(hero.name)}</h3>
          <p>${money(hero.price)}${hero.was ? ` <s>${money(hero.was)}</s>` : ""}</p>
          <button class="btn sm" type="button">View product</button>
        </div>
      </div>`;
    f.querySelector("button").onclick = () => openQuick(hero);
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
    const hold = Boolean(cat && node && cat !== state.category);
    if (cat) setCategory(cat, { hold });
    if (node) scrollToEl(node, hold ? commitSwap : null); else scrollToY(0);
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
      (!q || `${p.name} ${p.brand || ""} ${p.category} ${p.description}`.toLowerCase().includes(q)));
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
      const img = el("img", { src: p.image, alt: p.name, loading: "lazy" });
      applyImgStyle(img, p);
      m.append(img);
    }
    else m.innerHTML = artFor(p.category);
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
    const sel = $("filters").querySelector('[aria-selected="true"]');
    if (!chipInk || !sel) return;
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
    $("grid").replaceChildren(...items.map(cardFor));
  }

  // "Discount now": every product with a discount, regardless of the filters below.
  function renderDeals() {
    const deals = PRODUCTS.filter((p) => p.discount).sort((a, b) => b.discount - a.discount);
    $("deals").hidden = deals.length === 0;
    $("deals-grid").replaceChildren(...deals.map(cardFor));
  }

  // Grid swap. Cards that stay glide to their new place (FLIP), cards that leave
  // fade out first, cards that arrive rise in. The grid height eases too.
  const EASE = "cubic-bezier(.22, 1, .36, 1)";
  let swapToken = 0;
  let swapPending = false;

  function swapGrid() {
    const grid = $("grid");
    const token = ++swapToken;
    if (reduceMotion || !grid.children.length || !grid.animate) { renderGrid(); return; }

    grid.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    const keep = new Set(visible().map((p) => p.id));
    const leaving = [...grid.children].filter((c) => !keep.has(c.dataset.id));

    const run = () => {
      if (token !== swapToken) return;
      const first = new Map([...grid.children].map((c) => [c.dataset.id, c.getBoundingClientRect()]));
      const h0 = grid.offsetHeight;
      renderGrid();
      const h1 = grid.offsetHeight;

      let enter = 0;
      [...grid.children].forEach((c) => {
        const prev = first.get(c.dataset.id);
        if (prev) {
          const now = c.getBoundingClientRect();
          const dx = prev.left - now.left, dy = prev.top - now.top;
          if (dx || dy) c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 700, easing: EASE });
        } else {
          c.animate(
            [{ opacity: 0, transform: "translateY(24px) scale(.97)" }, { opacity: 1, transform: "none" }],
            { duration: 700, delay: 120 + Math.min(enter++, 8) * 45, easing: EASE, fill: "backwards" });
        }
      });

      if (h0 !== h1) {
        grid.style.overflow = "hidden";
        const a = grid.animate([{ height: `${h0}px` }, { height: `${h1}px` }], { duration: 600, easing: EASE });
        a.onfinish = a.oncancel = () => { grid.style.overflow = ""; };
      }
    };

    if (!leaving.length) { run(); return; }
    let done = 0;
    leaving.forEach((c) => {
      const a = c.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.96)" }], { duration: 220, easing: "ease-out", fill: "forwards" });
      a.onfinish = () => { if (++done === leaving.length) run(); };
    });
  }

  // Called once the page has arrived at the shop (or straight away for chips).
  function commitSwap() {
    if (!swapPending) return;
    swapPending = false;
    swapGrid();
  }
  function setCategory(c, { hold = false } = {}) {
    if (c === state.category) return;
    state.category = c;
    renderFilters();
    swapPending = true;
    if (!hold) commitSwap();
  }

  let searchTimer = 0;
  $("search").addEventListener("input", (e) => {
    state.query = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(swapGrid, 140);
  });
  const BRANDS = [...new Set(PRODUCTS.map((p) => p.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  $("brand").append(...BRANDS.map((b) => el("option", { value: b, textContent: b })));
  $("brand").hidden = BRANDS.length === 0;
  $("brand").addEventListener("change", (e) => { state.brand = e.target.value; swapGrid(); });
  $("sort").addEventListener("change", (e) => { state.sort = e.target.value; swapGrid(); });
  $("search-btn").onclick = () => scrollToEl($("shop"), () => $("search").focus({ preventScroll: true }));

  // ---------- Quick view ----------
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
        el("p", { className: "desc", textContent: p.description }),
        specs,
        el("div", { className: "qv-actions" }, el("div", { className: "qty" }, minus, qtyEl, plus), add))));
    dlg.showModal();
  }
  $("quick").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

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
    if (p.image) t.append(el("img", { src: p.image, alt: "" }));
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

  function enterLine(node, delay = 0) {
    if (reduceMotion || !node.animate) return;
    const h = node.offsetHeight;
    node.animate(
      [{ height: "0px", opacity: 0, transform: "translateX(28px)", paddingTop: 0, paddingBottom: 0 },
       { height: `${h}px`, opacity: 1, transform: "none" }],
      { duration: 520, delay, easing: EASE_OUT, fill: "backwards" });
  }
  function leaveLine(node, delay = 0) {
    if (reduceMotion || !node.animate) { node.remove(); return; }
    const h = node.offsetHeight;
    const a = node.animate(
      [{ height: `${h}px`, opacity: 1, transform: "none" },
       { height: "0px", opacity: 0, transform: "translateX(-28px)", paddingTop: 0, paddingBottom: 0 }],
      { duration: 380, delay, easing: EASE_OUT, fill: "both" });
    a.onfinish = () => node.remove();
  }

  // Count the subtotal up/down instead of snapping
  let shownTotal = 0;
  let totalRaf = 0;
  function animateTotal(to) {
    cancelAnimationFrame(totalRaf);
    const from = shownTotal;
    const out = $("cart-total");
    if (reduceMotion || from === to) { shownTotal = to; out.textContent = money(to); return; }
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / 450);
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

  const COMPLEMENT = { "Printers": "Toner & Ink", "Toner & Ink": "Printers", "Cameras": "Computer Hardware", "Computer Hardware": "Cameras" };
  function suggestions(inCart) {
    const have = new Set(inCart.map((e) => e.p.id));
    const wanted = [...new Set(inCart.map((e) => COMPLEMENT[e.p.category]).filter(Boolean))];
    const pool = PRODUCTS.filter((p) => !have.has(p.id));
    const first = pool.filter((p) => wanted.includes(p.category));
    const rest = pool.filter((p) => !wanted.includes(p.category) && p.badge === "Best seller");
    return [...first, ...rest].slice(0, 3);
  }

  function renderEmpty() {
    const picks = PRODUCTS.filter((p) => p.badge === "Best seller").concat(PRODUCTS).filter((p, i, a) => a.indexOf(p) === i).slice(0, 3);
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

    // "You may also need"
    const picks = list.length ? suggestions(list) : [];
    const sg = $("suggest");
    sg.hidden = picks.length === 0;
    sg.replaceChildren(...(picks.length ? [el("h4", { textContent: "You may also need" }), ...picks.map(miniRow)] : []));
    if (!list.length) renderEmpty();
  }

  let lastFocus = null;
  function openCart() {
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
    waUrl = `https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(orderMessage(new FormData(form)))}`;
    showStep(true);
    openWhatsApp();
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

  renderFilters();
  renderGrid();
  renderDeals();
  renderCart();
  moveInk();
  moveChipInk();
  $("grid").classList.add("flip");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    nav.classList.add("ready");
    $("filters").classList.add("ready");
  }));
})();
