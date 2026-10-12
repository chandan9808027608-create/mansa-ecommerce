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

  // Builds the ad card. Shared with the admin preview.
  function build(ad, onNavigate) {
    const img = safeUrl(ad.image);
    const link = safeUrl(ad.buttonLink);
    const card = el("div", { className: `ad-card ${ad.theme === "dark" ? "ad-dark" : ""} ${img ? "has-image" : ""}` });
    if (img) card.append(el("div", { className: "ad-media" }, el("img", { src: img, alt: "" })));
    const body = el("div", { className: "ad-body" },
      ad.badge ? el("span", { className: "ad-badge", textContent: ad.badge }) : null,
      el("h2", { textContent: ad.title || "Your headline here" }),
      ad.text ? el("p", { textContent: ad.text }) : null);
    if (ad.buttonLabel && link) {
      const a = el("a", { className: "btn", href: link, textContent: ad.buttonLabel });
      if (/^https?:/i.test(link)) { a.target = "_blank"; a.rel = "noopener"; }
      if (onNavigate) a.addEventListener("click", onNavigate);
      body.append(a);
    }
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
    try {
      const r = await fetch("ad.json", { cache: "no-store" });
      if (!r.ok) return;
      ad = await r.json();
    } catch { return; }

    if (!ad || !ad.enabled || !ad.title) return;
    const today = localDate();
    if (ad.startDate && today < ad.startDate) return;
    if (ad.endDate && today > ad.endDate) return;
    if (seen(ad)) return;

    const dlg = el("dialog", { className: "ad" });
    dlg.setAttribute("aria-label", ad.title);
    const close = el("button", { className: "ad-close", type: "button", textContent: "×", ariaLabel: "Close" });
    const done = () => { markSeen(ad); dlg.close(); };
    close.onclick = done;
    dlg.append(build(ad, done), close);
    dlg.addEventListener("click", (e) => { if (e.target === dlg) done(); });
    dlg.addEventListener("cancel", () => markSeen(ad));
    dlg.addEventListener("close", () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  run();
})();
