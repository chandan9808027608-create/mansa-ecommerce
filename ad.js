// Ad popup shown before the store. Content comes from ad.json (edited in admin.html).
(() => {
  const safeUrl = (u) => {
    if (!u) return null;
    try {
      const x = new URL(u, location.href);
      return ["http:", "https:", "mailto:", "tel:"].includes(x.protocol) ? u : null;
    } catch { return null; }
  };

  const el = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    kids.flat().forEach((k) => k && n.append(k));
    return n;
  };

  // Left panel when no ad image is set: brand-blue showcase with the logo and fanned product cards.
  function showcase() {
    const v = el("div", { className: "ad-visual", ariaHidden: "true" });
    v.innerHTML = `<span class="adv-glow"></span>
      <span class="adv-logo"><img src="images/logo.png" alt=""></span>
      <span class="adv-stack">
        <span class="adv-card c1"><img src="images/hik-dome.svg" alt=""></span>
        <span class="adv-card c2"><img src="images/laptop.svg" alt=""></span>
        <span class="adv-card c3"><img src="images/prn2.svg" alt=""></span>
      </span>
      <span class="adv-tag">Sales · Installation · Service</span>`;
    return v;
  }

  // "Image only" layout: just the picture, optionally linking somewhere.
  function buildImage(ad, onNavigate) {
    const img = safeUrl(ad.image);
    const link = safeUrl(ad.buttonLink);
    const wrap = el("div", { className: "ad-card ad-image-only" });
    if (!img) { wrap.append(el("div", { className: "ad-img-empty", textContent: "Upload an image to show it here" })); return wrap; }
    const pic = el("img", { src: img, alt: ad.title || "Offer" });
    if (link) {
      const a = el("a", { href: link, ariaLabel: ad.title || "Open offer" }, pic);
      if (/^https?:/i.test(link)) { a.target = "_blank"; a.rel = "noopener"; }
      if (onNavigate) a.addEventListener("click", onNavigate);
      wrap.append(a);
    } else wrap.append(pic);
    return wrap;
  }

  // Builds the ad card. Shared with the admin preview.
  function build(ad, onNavigate, onDismiss) {
    if (ad.layout === "image") return buildImage(ad, onNavigate);
    const img = safeUrl(ad.image);
    const link = safeUrl(ad.buttonLink);
    const card = el("div", { className: `ad-card ${ad.theme === "dark" ? "ad-dark" : ""}` });
    card.append(img ? el("div", { className: "ad-media" }, el("img", { src: img, alt: "" })) : showcase());
    const body = el("div", { className: "ad-body" },
      ad.badge ? el("span", { className: "ad-badge", textContent: ad.badge }) : null,
      el("h2", { textContent: ad.title || "Your headline here" }),
      ad.text ? el("p", { textContent: ad.text }) : null);
    const actions = el("div", { className: "ad-actions" });
    if (ad.buttonLabel && link) {
      const a = el("a", { className: "btn lg", href: link }, ad.buttonLabel, el("span", { ariaHidden: "true", textContent: " →" }));
      if (/^https?:/i.test(link)) { a.target = "_blank"; a.rel = "noopener"; }
      if (onNavigate) a.addEventListener("click", onNavigate);
      actions.append(a);
    }
    const later = el("button", { className: "ad-later", type: "button", textContent: "Maybe later" });
    if (onDismiss) later.onclick = onDismiss; else later.tabIndex = -1;
    actions.append(later);
    body.append(actions, el("ul", { className: "ad-trust" },
      el("li", { textContent: "Genuine products" }), el("li", { textContent: "Installation & service" }), el("li", { textContent: "Local support" })));
    card.append(body);
    return card;
  }
  window.MansaAd = { build };

  if (window.MANSA_ADMIN) return;

  const localDate = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const seen = (ad) => {
    const key = `mansa-ad-${ad.updatedAt}`;
    try {
      if (ad.frequency === "session") return sessionStorage.getItem(key) === "1";
      if (ad.frequency === "day") return localStorage.getItem(key) === localDate();
    } catch {}
    return false;
  };
  const markSeen = (ad) => {
    const key = `mansa-ad-${ad.updatedAt}`;
    try {
      if (ad.frequency === "session") sessionStorage.setItem(key, "1");
      if (ad.frequency === "day") localStorage.setItem(key, localDate());
    } catch {}
  };

  async function run() {
    let ad;
    try { ad = await window.MansaData.loadAd(); } catch { return; }

    if (!ad || !ad.enabled) return;
    if (ad.layout === "image" ? !safeUrl(ad.image) : !ad.title) return;  // nothing to show
    const today = localDate();
    if (ad.startDate && today < ad.startDate) return;
    if (ad.endDate && today > ad.endDate) return;
    if (seen(ad)) return;

    const dlg = el("dialog", { className: ad.layout === "image" ? "ad ad-img" : "ad" });
    dlg.setAttribute("aria-label", ad.title || "Offer");
    const close = el("button", { className: "ad-close", type: "button", textContent: "×", ariaLabel: "Close" });
    const done = () => { markSeen(ad); dlg.close(); };
    close.onclick = done;
    dlg.append(build(ad, done, done), close);
    dlg.addEventListener("click", (e) => { if (e.target === dlg) done(); });
    dlg.addEventListener("cancel", () => markSeen(ad));
    dlg.addEventListener("close", () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  run();
})();
