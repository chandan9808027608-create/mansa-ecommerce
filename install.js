// Installation planner: looks at what's in the bag and recommends the other parts needed to
// install it, chosen from the catalogue. E.g. IP cameras -> NVR with enough channels, PoE switch
// with enough ports, Cat-6 cable by the metre, RJ45 jacks and a surveillance hard disk;
// analog (HD-TVI) cameras -> DVR and 3+1 CCTV cable instead.
//
//   MansaInstall.plan(entries, products) -> [{ title, items: [{ label, why, product, qty, unit }] }]
//   entries: [{ p, qty }] from the bag; products: the whole catalogue (with final prices).
(() => {
  const t = (p) => `${p.name} ${p.category}`;
  const BRANDS = /hikvision|tiandy|dahua|ezviz|cp ?plus|uniview|\bunv\b|secureye|imou/i;

  // ---------- what kind of product is this? ----------
  // Security cameras only: not webcams, dash cams, action cams, DSLRs or their accessories.
  const isCamProduct = (p) => p.category === "CCTV & Security" || BRANDS.test(p.name);
  const isCamera = (p) => isCamProduct(p) && /\b(camera|camer|came|cam|bullet|dome|turret|cube|ptz|eyeball)\b/i.test(p.name)
    && !/dash ?cam|webcam|action|instant|bracket|mount|junction|box\b|cable|housing|stand|card|cleaner|solar|bag|conference|pc camera|packing|lock|nas\b/i.test(p.name);

  function kindOf(p) {
    const n = p.name;
    if (/\bnvr\b/i.test(n)) return "nvr";
    if (/\b(dvr|xvr)\b/i.test(n) && !/cable|power|adapter/i.test(n)) return "dvr";
    if (/\bpoe\b/i.test(n) && /switch/i.test(n)) return "poeswitch";
    if (isCamera(p)) {
      if (/ezviz|imou|tapo|wi-?fi|wireless|\b4g\b|\bcs-|battery cam/i.test(n)) return "wificam";
      if (/ds[- ]?2ce|turbo|\btvi\b|\bahd\b|\bcvi\b|analog|hd-?tvi/i.test(n)) return "analogcam";
      return "ipcam";  // DS-2CD / DS-2DE, Tiandy TC-C, "IP", "network camera", and anything else
    }
    if (/access (control|terminal)|attendance|face recognition|fingerprint|video intercom/i.test(n) && !/lock|scanner|usb/i.test(n)) return "access";
    if (p.category === "Laptops" || /\bmacbook\b/i.test(n)) return "laptop";
    if (p.category === "Desktops" || /\b(imac|desktop pc|all[- ]in[- ]one pc)\b/i.test(n)) return "desktop";
    if (p.category === "Monitors" && /monitor|display/i.test(n)) return "monitor";
    if (/printer/i.test(n) && !/cable|head|roller|ribbon|cartridge|toner|ink (bottle|refill)|paper|stand|sharing|server/i.test(n)) return "printer";
    if (p.category === "Networking" && /router|access point|\bmesh\b|\bwi-?fi\b.*(system|extender)|range extender/i.test(n)) return "network";
    if (p.category === "Networking" && /switch/i.test(n)) return "network";
    if (p.category === "PC Components" && /\b(processor|cpu)\b/i.test(n) && !/cooler|fan|cabinet|casing|thermal/i.test(n)) return "cpu";
    return null;
  }

  // ---------- reading sizes out of names ----------
  const num = (re, s) => { const m = s.match(re); return m ? parseInt(m[1], 10) : 0; };
  const channels = (p) => num(/(\d+)[ -]?(?:port|ch\b|channel)/i, p.name) || num(/\b(?:i?ds[- ]?)?7[126](\d{2})/i, p.name) || 4;
  const ports = (p) => num(/(\d+)[ -]?(?:port|ch\b)/i, p.name) || 4;
  const brandOf = (p) => (p.name.match(BRANDS) || [""])[0].toLowerCase();
  const gb = (p) => { const m = p.name.match(/(\d+(?:\.\d+)?) ?(gb|tb)\b/i); return m ? parseFloat(m[1]) * (/tb/i.test(m[2]) ? 1024 : 1) : 0; };
  const watts = (p) => num(/(\d{3,4}) ?w(?:att)?s?\b/i, p.name);

  // ---------- what each need looks like in the catalogue ----------
  const M = {
    nvr: (p) => kindOf(p) === "nvr",
    dvr: (p) => kindOf(p) === "dvr",
    poeSwitch: (p) => kindOf(p) === "poeswitch",
    cat6: (p) => /cat ?6/i.test(p.name) && /cable/i.test(p.name) && !/patch|face ?plate|panel/i.test(p.name) && /305|roll|box|\bm\b|meter/i.test(p.name),
    rj45: (p) => /rj ?-?45/i.test(p.name) && /jack|connector|plug/i.test(p.name) && p.price < 100,
    cctvCable: (p) => /3\+1|coaxial|\brg ?59\b|cctv cable/i.test(p.name),
    survHdd: (p) => /surveillance|purple|skyhawk/i.test(p.name) && /hdd|hard/i.test(p.name),
    dvrPower: (p) => /dvr hdd power cable|hdd power cable/i.test(p.name),
    microsd: (p) => /micro ?sd|memory card|tf card/i.test(p.name) && !/reader|enclosure/i.test(p.name),
    laptopBag: (p) => /laptop (bag|backpack|sleeve)|backpack/i.test(p.name),
    mouse: (p) => /\bmouse\b/i.test(p.name) && !/pad|combo|keyboard|bungee/i.test(p.name),
    wirelessMouse: (p) => M.mouse(p) && /wireless/i.test(p.name),
    antivirus: (p) => /kaspersky|antivirus|eset|quick ?heal|norton|mcafee/i.test(p.name),
    combo: (p) => /keyboard/i.test(p.name) && /mouse/i.test(p.name) && /combo/i.test(p.name),
    ups: (p) => /\bups\b/i.test(p.name) && /va\b|kva/i.test(p.name) && !/battery|router|\bdc\b/i.test(p.name),
    hdmi: (p) => /hdmi/i.test(p.name) && /cable/i.test(p.name) && !/splitter|extender|adapter|converter|coupler|switch|kvm|vga|dvi|type-?c|usb|mini|micro|display ?port/i.test(p.name),
    patch: (p) => /patch (cable|cord)/i.test(p.name) && /cat ?6/i.test(p.name),
    motherboard: (p) => /motherboard|mainboard/i.test(p.name),
    ram: (p) => /\b(ddr4|ddr5)\b/i.test(p.name) && /desktop|dimm/i.test(p.name) && !/laptop|so-?dimm/i.test(p.name),
    ssd: (p) => /\bssd\b/i.test(p.name) && !/enclosure|case|external|portable|laptop\b/i.test(p.name) && p.category !== "Laptops",
    psu: (p) => p.category === "PC Components" && /smps|power supply|\bpsu\b/i.test(p.name) && !/laptop|adapter|dell/i.test(p.name),
    cabinet: (p) => p.category === "PC Components" && /cabinet|casing|\bcase\b|tower/i.test(p.name) && !/fan|cooler/i.test(p.name),
  };

  // Printer consumables of the same brand.
  // Ink or toner for a printer: same brand name or that brand's cartridge codes.
  const CODES = {
    brother: /\b(tn|bt|btd|dr|lc)[- ]?\d/i,
    epson: /\b0\d{2}\b|\b664\b|\bt\d{3}\b/i,
    hp: /\bhp\b|\b\d{2,3}[a-z]?\b.*(cartridge|toner)/i,
    canon: /canon|\bcrg|\bpg-?\d|\bcl-?\d|\bgi-?\d/i,
    kyocera: /kyocera|\btk-?\d/i,
  };
  function consumableFor(printer) {
    const b = (printer.brand || printer.name.split(" ")[0]).toLowerCase();
    const ink = /ink ?tank|inkjet|ecotank|smart tank|dcp-t|\bink\b/i.test(printer.name);
    return (p) => {
      if (p.id === printer.id || /printer|head|roller|chip|cleaning/i.test(p.name)) return false;
      if (!(p.name.toLowerCase().includes(b) || (CODES[b] && CODES[b].test(p.name)))) return false;
      return ink ? /\bink\b|bottle/i.test(p.name) : /toner|cartridge|drum/i.test(p.name);
    };
  }
  const isBlack = (p) => /black|\bbk\b|\(bk\)|\dbk\b/i.test(p.name);

  // Cheapest product that matches and fits; same brand first when `brand` is given.
  function best(products, match, { fits = () => true, size = () => 0, brand = "", prefer = () => false } = {}) {
    const list = products.filter((p) => match(p) && fits(p));
    if (!list.length) return null;
    return list.sort((a, b) =>
      (brand ? (brandOf(b) === brand) - (brandOf(a) === brand) : 0) || prefer(b) - prefer(a) || size(a) - size(b) || a.price - b.price)[0];
  }

  function plan(entries, products) {
    const inBag = entries.map((e) => e.p);
    const bagHas = (match) => inBag.some(match);
    const count = (kind) => entries.filter((e) => kindOf(e.p) === kind).reduce((s, e) => s + e.qty, 0);
    const first = (kind) => (entries.find((e) => kindOf(e.p) === kind) || {}).p;
    const groups = [];
    const used = new Set(inBag.map((p) => p.id));

    // Adds a need unless the bag already covers it or nothing in the catalogue fits.
    const group = (title) => { const g = { title, items: [] }; groups.push(g); return g; };
    const need = (g, label, why, match, opts = {}) => {
      if (bagHas(opts.covered || match)) return;
      const p = best(products, match, opts);
      if (!p || used.has(p.id)) return;
      used.add(p.id);
      g.items.push({ label, why, product: p, qty: opts.qty || 1, unit: opts.unit || "" });
    };

    const ip = count("ipcam"), an = count("analogcam"), wifi = count("wificam");
    const camBrand = brandOf(first("ipcam") || first("analogcam") || first("nvr") || first("dvr") || { name: "" });
    const s = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

    if (ip) {
      const g = group(`For your ${s(ip, "IP camera")}`);
      need(g, `NVR, ${ip > 4 ? (ip > 8 ? (ip > 16 ? 32 : 16) : 8) : 4}+ channels`, "Records and plays back the IP cameras",
        M.nvr, { fits: (p) => channels(p) >= ip, size: channels, brand: camBrand, covered: (p) => M.nvr(p) && channels(p) >= ip });
      need(g, `PoE switch, ${ip}+ ports`, "Powers each camera through its network cable, so no separate adapters",
        M.poeSwitch, { fits: (p) => ports(p) >= ip, size: ports, brand: camBrand, covered: (p) => M.poeSwitch(p) && ports(p) >= ip });
      need(g, "Cat-6 cable", `About 20 m per camera (${ip * 20} m). We'll confirm after a site visit.`, M.cat6, { qty: ip * 20, unit: "m" });
      need(g, "RJ45 connectors", "Two per cable run, plus spares", M.rj45, { qty: ip * 2 + 2 });
      need(g, "Surveillance hard disk", "Stores the recordings, built for 24/7 use", M.survHdd);
    }
    if (an) {
      const g = group(`For your ${s(an, "HD analog camera")}`);
      need(g, `DVR, ${an > 4 ? (an > 8 ? 16 : 8) : 4}+ channels`, "Records the analog (Turbo HD) cameras",
        M.dvr, { fits: (p) => channels(p) >= an, size: channels, brand: camBrand, covered: (p) => M.dvr(p) && channels(p) >= an });
      need(g, "3+1 CCTV cable", `Video + power in one cable, about 20 m per camera (${an * 20} m)`, M.cctvCable, { qty: an * 20, unit: "m" });
      need(g, "Surveillance hard disk", "Stores the recordings, built for 24/7 use", M.survHdd);
      need(g, "DVR hard disk power cable", "Connects the hard disk inside the DVR", M.dvrPower);
    }
    if (wifi) {
      const g = group(`For your ${s(wifi, "Wi-Fi camera")}`);
      need(g, "Memory card, 32 GB+", "Wi-Fi cameras record to a microSD card", M.microsd, { qty: wifi, fits: (p) => gb(p) >= 32, size: gb });
    }
    if (!ip && !an && (first("nvr") || first("dvr"))) {
      const g = group(`For your ${first("nvr") ? "NVR" : "DVR"}`);
      need(g, "Surveillance hard disk", "The recorder needs a hard disk to store footage", M.survHdd);
      need(g, "HDMI cable", "To connect the recorder to a monitor or TV", M.hdmi);
    }
    if (first("poeswitch") && !ip) {
      const g = group("For your PoE switch");
      need(g, "Cat-6 cable", "About 20 m per device", M.cat6, { qty: 20 * Math.min(ports(first("poeswitch")), 8), unit: "m" });
      need(g, "RJ45 connectors", "Two per cable run", M.rj45, { qty: 10 });
    }
    if (ip || an || first("nvr") || first("dvr")) {
      const g = group("Keep it recording during power cuts");
      need(g, "UPS", "Keeps the recorder and cameras running through load-shedding", M.ups);
    }
    if (first("access")) {
      const g = group("For your access-control device");
      need(g, "Cat-6 cable", "Network connection to the device (about 20 m)", M.cat6, { qty: 20, unit: "m" });
      need(g, "RJ45 connectors", "For the cable ends", M.rj45, { qty: 4 });
    }
    if (first("network")) {
      const g = group(`For your ${/router|access point|mesh/i.test(first("network").name) ? "router / access point" : "network switch"}`);
      need(g, "Cat-6 cable", "For wiring rooms and devices (about 30 m to start)", M.cat6, { qty: 30, unit: "m" });
      need(g, "RJ45 connectors", "For the cable ends", M.rj45, { qty: 10 });
      need(g, "Cat-6 patch cable", "Short cable to connect it to your modem or switch", M.patch);
    }
    if (first("laptop")) {
      const g = group("For your laptop");
      need(g, "Laptop bag", "Protects it on the move", M.laptopBag);
      need(g, "Wireless mouse", "More comfortable than the touchpad for long work", M.wirelessMouse, { covered: M.mouse });
      need(g, "Antivirus", "One-year protection for the new laptop", M.antivirus);
    }
    if (first("desktop")) {
      const g = group("For your desktop");
      need(g, "Keyboard & mouse", "If the PC doesn't include them", M.combo, { covered: (p) => M.combo(p) || /keyboard/i.test(p.name) });
      need(g, "UPS", "Protects the PC from power cuts and surges", M.ups);
      need(g, "Antivirus", "One-year protection", M.antivirus);
    }
    if (first("monitor")) {
      const g = group("For your monitor");
      need(g, "HDMI cable", "Check whether one is in the box", M.hdmi);
    }
    if (first("printer")) {
      const g = group("For your printer");
      const pr = first("printer");
      need(g, /ink ?tank|inkjet|dcp-t|ink/i.test(pr.name) ? "Spare ink" : "Spare toner", "So you're not caught out when the first one runs dry",
        consumableFor(pr), { prefer: isBlack });
      need(g, "UPS", "Protects the printer from power cuts", M.ups);
    }
    if (first("cpu")) {
      const amd = /amd|ryzen|athlon/i.test(first("cpu").name);
      const chipset = amd ? /\b(a320|a520|a620|b450|b550|b650|x470|x570|x670|am4|am5)/i
        : /\b(h310|h410|h470|h510|h610|h670|h770|b360|b365|b460|b560|b660|b760|z370|z390|z490|z590|z690|z790)/i;
      const g = group("To build a PC around your processor");
      need(g, `Motherboard (${amd ? "AMD" : "Intel"})`, "We'll confirm the exact socket and generation before delivery",
        M.motherboard, { fits: (p) => chipset.test(p.name) });
      need(g, "Desktop RAM, 8 GB+", "DDR4/DDR5 memory to match the motherboard", M.ram, { fits: (p) => gb(p) >= 8, size: gb });
      need(g, "SSD, 240 GB+", "Fast storage for Windows and apps", M.ssd, { fits: (p) => gb(p) >= 240, size: gb });
      need(g, "Power supply, 450 W+", "Powers the whole PC", M.psu, { fits: (p) => watts(p) >= 450, size: watts });
      need(g, "Cabinet", "The case that holds it all", M.cabinet);
    }
    return groups.filter((g) => g.items.length);
  }

  window.MansaInstall = { plan, kindOf };
})();
