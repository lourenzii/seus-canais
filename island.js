(() => {
  if (window.top !== window) return;
  try {
    if (window.__canaisIsland && window.__canaisIsland()) return;
  } catch (_) {}
  window.__canaisIsland = () => !!(chrome.runtime && chrome.runtime.id);

  let LANG = "pt";
  const T = (s) => (typeof trText === "function" ? trText(s, LANG) : s);

  const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .wrap { position: fixed; left: 50%; top: var(--top, 64px); transform: translateX(-50%); z-index: 2147483000; font-family: "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; pointer-events: none; }
  .wrap.bottom { top: auto; bottom: 22px; }
  .ilha { pointer-events: auto; position: relative; background: var(--bg); color: var(--ink); border: 1px solid var(--border); box-shadow: var(--shadow);
    border-radius: 999px; overflow: hidden; transition: width .32s cubic-bezier(.3,.9,.3,1), height .32s cubic-bezier(.3,.9,.3,1), border-radius .32s cubic-bezier(.3,.9,.3,1), opacity .2s; }
  .ilha.hidden { opacity: 0; pointer-events: none; }
  .ilha { -webkit-backdrop-filter: blur(14px) saturate(1.3); backdrop-filter: blur(14px) saturate(1.3); touch-action: none; }
  .wrap.idle .ilha { opacity: 0; pointer-events: none; }
  .wrap.custom { transform: none; transition: left .32s cubic-bezier(.3,.9,.3,1), top .32s cubic-bezier(.3,.9,.3,1); }
  .wrap.dragging, .wrap.dragging * { transition: none !important; cursor: grabbing !important; }
  .ilha:active { cursor: grab; }
  .av img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; }
  .ilha.open { border-radius: 26px; }
  .view { position: absolute; left: 0; top: 0; opacity: 0; pointer-events: none; transition: opacity .18s; }
  .view.on { opacity: 1; pointer-events: auto; transition-delay: .1s; }
  button { font: inherit; color: inherit; border: none; background: none; cursor: pointer; padding: 0; }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .pill { display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 14px 0 8px; white-space: nowrap; cursor: pointer; }
  .m30 { width: 30px; height: 30px; flex-shrink: 0; margin: -4px 0 -4px 0; }
  .m30 svg, .m52 svg, .m34 svg { width: 100%; height: 100%; overflow: visible; display: block; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--live); flex-shrink: 0; animation: pulse 1.8s ease-out infinite; }
  .dot.off { background: var(--muted); animation: none; opacity: .5; }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 var(--live-a); } 70% { box-shadow: 0 0 0 6px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
  .b { font-size: 12px; font-weight: 700; }
  .mut { font-size: 12px; font-weight: 600; color: var(--muted); max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
  .sep { width: 1px; height: 14px; background: var(--line); flex-shrink: 0; }
  .av { border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; font-weight: 800; }
  .eq { display: flex; align-items: flex-end; gap: 2px; height: 12px; margin-left: 2px; }
  .eq i { display: block; width: 3px; height: 12px; border-radius: 2px; background: var(--accent); transform-origin: bottom; animation: eq 1s ease-in-out infinite; }
  .eq i:nth-child(2) { animation-delay: .2s; } .eq i:nth-child(3) { animation-delay: .4s; } .eq i:nth-child(4) { animation-delay: .1s; }
  @keyframes eq { 0%, 100% { transform: scaleY(.35); } 50% { transform: scaleY(1); } }
  .rec { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 800; letter-spacing: .04em; color: #ef4444; }
  .rec::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: #ef4444; }
  .panel { width: 420px; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
  .head { display: flex; align-items: center; gap: 12px; }
  .avw { position: relative; flex-shrink: 0; }
  .avw .ld { position: absolute; right: 0; bottom: 0; width: 11px; height: 11px; border-radius: 50%; background: var(--live); border: 2px solid var(--bg); }
  .info { flex-grow: 1; min-width: 0; }
  .nm { display: flex; align-items: center; gap: 6px; }
  .nm b { font-size: 15px; line-height: 20px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip { font-size: 10.5px; line-height: 16px; font-weight: 700; padding: 0 7px; border-radius: 999px; background: var(--raised); color: var(--muted); flex-shrink: 0; }
  .st { font-size: 12px; line-height: 16px; font-weight: 600; color: var(--live); }
  .st.off { color: var(--muted); }
  .tt { font-size: 12px; line-height: 16px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .m52 { width: 52px; height: 52px; margin: -6px -4px -6px 0; flex-shrink: 0; }
  .sw { display: flex; align-items: center; gap: 6px; padding: 6px; border-radius: 16px; background: var(--well); }
  .arr { width: 30px; height: 30px; border-radius: 10px; display: grid; place-items: center; flex-shrink: 0; background: var(--arr); color: var(--ink); }
  .arr:disabled { opacity: .35; cursor: default; }
  .lives { display: flex; gap: 6px; flex-grow: 1; min-width: 0; }
  .lv { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; padding: 5px 7px; border-radius: 11px; text-align: left; }
  .lv:hover { background: var(--hover); }
  .lv.on { background: var(--arr); box-shadow: inset 0 0 0 1.5px var(--accent); }
  .lv span { min-width: 0; }
  .lv .n { display: block; font-size: 11.5px; line-height: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lv .p { display: block; font-size: 10.5px; line-height: 13px; color: var(--muted); }
  .addb { margin-top: 4px; height: 26px; padding: 0 10px; border-radius: 999px; font-size: 11.5px; font-weight: 700; background: var(--accent); color: var(--on-accent); }
  .addb:disabled { opacity: .6; cursor: default; }
  .empty { flex-grow: 1; font-size: 12px; color: var(--muted); padding: 6px 4px; }
  .acts { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  .act { height: 38px; border-radius: 12px; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 12px; font-weight: 700; background: var(--soft); color: var(--soft-ink); }
  .act.pri { background: var(--accent); color: var(--on-accent); }
  .act:hover { filter: brightness(1.08); }
  .act:disabled { opacity: .5; cursor: default; }
  .fx { display: flex; flex-direction: column; gap: 6px; }
  .fx-h { font-size: 11px; font-weight: 700; color: var(--muted); padding-left: 2px; }
  .fx-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
  .fb { height: 30px; border-radius: 10px; display: flex; align-items: center; justify-content: center; gap: 5px; font-size: 11.5px; font-weight: 700; background: var(--well); color: var(--ink); white-space: nowrap; }
  .fb:hover { background: var(--hover); box-shadow: inset 0 0 0 1px var(--line); }
  .fb.on { background: var(--accent); color: var(--on-accent); box-shadow: none; }
  .fb:disabled { opacity: .5; cursor: default; }
  .foot { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--muted); }
  .bar { flex-grow: 1; height: 4px; border-radius: 4px; background: var(--raised); overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--accent); }
  .kbd { font-family: Consolas, monospace; padding: 1px 6px; border-radius: 6px; background: var(--raised); }
  .x { width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center; color: var(--muted); }
  .x:hover { background: var(--raised); color: var(--ink); }
  .flash { display: flex; align-items: center; gap: 10px; height: 52px; padding: 0 8px 0 10px; white-space: nowrap; }
  .m34 { width: 34px; height: 34px; flex-shrink: 0; }
  .fl-t { display: block; font-size: 12.5px; line-height: 15px; font-weight: 700; max-width: 300px; overflow: hidden; text-overflow: ellipsis; }
  .fl-d { display: block; font-size: 11px; line-height: 14px; color: var(--muted); max-width: 300px; overflow: hidden; text-overflow: ellipsis; }
  .ok { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; background: var(--accent); color: var(--on-accent); flex-shrink: 0; }
  .go { height: 34px; padding: 0 14px; border-radius: 999px; font-size: 12.5px; font-weight: 700; background: var(--accent); color: var(--on-accent); margin-left: 4px; flex-shrink: 0; }
  .dg .dg-all { transform-box: fill-box; transform-origin: 50% 100%; }
  .dg .dg-wing { transform-box: fill-box; transform-origin: 100% 100%; }
  .dg .dg-eyes { transform-box: fill-box; transform-origin: 50% 50%; animation: dg-blink 4.2s infinite; }
  .dg-idle .dg-all, .dg-wave .dg-all { animation: dg-breathe 3.2s ease-in-out infinite; }
  .dg-idle .dg-wing, .dg-wave .dg-wing { animation: dg-flap 3.2s ease-in-out infinite; }
  .dg-wave .dg-arm-wave { transform-box: fill-box; transform-origin: 20% 90%; animation: dg-wave .9s ease-in-out infinite; }
  .dg-party .dg-all { animation: dg-hop .7s cubic-bezier(.3,.7,.4,1) infinite; }
  .dg-party .dg-wing { animation: dg-flap-fast .35s ease-in-out infinite; }
  .dg-party .dg-c { transform-box: fill-box; transform-origin: 50% 50%; animation: dg-pop 1.4s ease-in-out infinite; }
  .dg-party .dg-c2 { animation-delay: .35s; } .dg-party .dg-c3 { animation-delay: .7s; }
  @keyframes dg-breathe { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.02, .975) translateY(1px); } }
  @keyframes dg-flap { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(-8deg); } }
  @keyframes dg-flap-fast { 0%, 100% { transform: rotate(4deg); } 50% { transform: rotate(-16deg); } }
  @keyframes dg-blink { 0%, 90%, 100% { transform: scaleY(1); } 94% { transform: scaleY(.1); } }
  @keyframes dg-wave { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(-28deg); } }
  @keyframes dg-hop { 0%, 100% { transform: translateY(0) scale(1.03, .96); } 45% { transform: translateY(-6px) scale(.98, 1.03); } }
  @keyframes dg-pop { 0%, 100% { opacity: 0; transform: scale(.4) translateY(6px); } 40%, 60% { opacity: 1; transform: scale(1) translateY(-4px); } }
  @media (prefers-reduced-motion: reduce) { .ilha, .view { transition: none; } .dot, .eq i, .dg * { animation: none !important; } }
  `;

  const ICON = {
    left: '<path d="M15 6l-6 6 6 6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
    scissors: '<circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="M8.6 8.6L19 19"/><path d="M8.6 15.4L19 5"/>',
    grid: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
    check: '<path d="M5 12l5 5L20 7"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    low: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
    pip: '<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="11" width="7" height="6" rx="1"/>',
    chat: '<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4z"/>',
  };
  const NS = "http://www.w3.org/2000/svg";
  function icon(name, size = 16, w = 2) {
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("width", size);
    s.setAttribute("height", size);
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", w);
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    s.setAttribute("aria-hidden", "true");
    const doc = new DOMParser().parseFromString(`<svg xmlns="${NS}">${ICON[name]}</svg>`, "image/svg+xml");
    for (const n of [...doc.documentElement.childNodes]) s.appendChild(document.importNode(n, true));
    return s;
  }
  function svgNode(markup) {
    if (!markup) return null;
    try {
      const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
      const s = doc.documentElement;
      if (s && s.nodeName.toLowerCase() === "svg") {
        s.querySelectorAll("script,foreignObject").forEach((n) => n.remove());
        [s, ...s.querySelectorAll("*")].forEach((n) => [...n.attributes].forEach((a) => /^on/i.test(a.name) && n.removeAttribute(a.name)));
        return document.importNode(s, true);
      }
    } catch (_) {}
    return null;
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  const AV = {
    twitch: { dark: ["#2a2540", "#b6adff"], light: ["#ece8ff", "#5b4bff"] },
    youtube: { dark: ["#3a2124", "#ff8a8a"], light: ["#ffe8e8", "#c81e1e"] },
    kick: { dark: ["#16301f", "#6be29a"], light: ["#e6f7ec", "#15803d"] },
  };
  const PF = { youtube: "YouTube", twitch: "Twitch", kick: "Kick" };

  let hostEl = null;
  let root = null;
  let wrap = null;
  let box = null;
  let views = {};
  let data = null;
  let mode = "pill";
  let flashTimer = null;
  let hoverTimer = null;
  let page = 0;
  let replay = { recording: false };
  let lowQuality = false; // modo foco: qualidade mínima ligada nesta página

  function avatar(lv, size, fs) {
    const pal = (AV[lv.platform] || AV.twitch)[data && data.light ? "light" : "dark"];
    const a = el("span", "av", (lv.handle.replace("@", "")[0] || "?").toUpperCase());
    a.style.cssText = `width:${size}px;height:${size}px;font-size:${fs}px;background:${pal[0]};color:${pal[1]}`;
    if (lv.avatar && /^(https:|data:image\/)/.test(lv.avatar)) {
      const img = document.createElement("img");
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.onload = () => {
        a.textContent = "";
        a.append(img);
      };
      img.src = lv.avatar;
    }
    return a;
  }

  function fmtViewers(n) {
    if (!Number.isFinite(n)) return "";
    if (LANG === "en") return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "K" : String(n);
    return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".", ",") + " mil" : String(n);
  }
  function fmtSince(ts) {
    if (!ts) return "";
    const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
    const h = Math.floor(m / 60);
    return h ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m} min`;
  }
  function fmtMin(m) {
    m = Math.round(m || 0);
    const h = Math.floor(m / 60);
    return h ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m} min`;
  }

  function ensureHost() {
    if (!hostEl) {
      hostEl = document.createElement("canais-ilha");
      root = hostEl.attachShadow({ mode: "closed" });
      const st = document.createElement("style");
      st.textContent = CSS;
      wrap = el("div", "wrap");
      box = el("div", "ilha hidden");
      box.setAttribute("role", "region");
      wrap.append(box);
      root.append(st, wrap);
      box.addEventListener("mouseenter", () => {
        clearTimeout(hoverTimer);
        if (mode === "flash" || dragging) return;
        hoverTimer = setTimeout(() => !dragging && setMode("open"), 160);
      });
      box.addEventListener("mouseleave", () => {
        clearTimeout(hoverTimer);
        if (mode === "open") hoverTimer = setTimeout(() => setMode("pill"), 350);
        wake();
      });
      setupDrag();
      box.addEventListener("focusin", () => mode === "pill" && setMode("open"));
      box.addEventListener("focusout", (e) => {
        if (!box.contains(e.relatedTarget) && mode === "open") setMode("pill");
      wake();
      });
    }
    const target = document.fullscreenElement && document.fullscreenElement.tagName !== "VIDEO" ? document.fullscreenElement : document.body || document.documentElement;
    if (hostEl.parentNode !== target) target.appendChild(hostEl);
  }

  // ---- posição (arrastar) ----
  let pos = null; // { cx, y } em fração da tela
  let dragging = false;
  let justDragged = false;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function placeWrap(w, h) {
    if (!wrap) return;
    if (!pos) {
      wrap.classList.remove("custom");
      wrap.style.left = wrap.style.top = "";
      return;
    }
    const vw = window.innerWidth, vh = window.innerHeight;
    w = w || box.offsetWidth;
    h = h || box.offsetHeight;
    wrap.classList.add("custom");
    wrap.style.left = clamp(pos.cx * vw - w / 2, 8, Math.max(8, vw - w - 8)) + "px";
    wrap.style.top = clamp(pos.y * vh, 8, Math.max(8, vh - h - 8)) + "px";
  }
  function setupDrag() {
    let start = null;
    box.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const r = box.getBoundingClientRect();
      start = { x: e.clientX, y: e.clientY, cx: r.left + r.width / 2, top: r.top, id: e.pointerId };
    });
    window.addEventListener(
      "pointermove",
      (e) => {
        if (!start || e.pointerId !== start.id) return;
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (!dragging && Math.hypot(dx, dy) < 6) return;
        if (!dragging) {
          dragging = true;
          clearTimeout(hoverTimer);
          wrap.classList.add("dragging");
          try {
            box.setPointerCapture(start.id);
          } catch (_) {}
        }
        pos = { cx: (start.cx + dx) / window.innerWidth, y: (start.top + dy) / window.innerHeight };
        placeWrap();
        e.preventDefault();
      },
      true
    );
    const end = () => {
      if (!start) return;
      start = null;
      if (!dragging) return;
      dragging = false;
      justDragged = true;
      setTimeout(() => (justDragged = false), 50);
      wrap.classList.remove("dragging");
      try {
        chrome.storage.local.set({ islandXY: pos });
      } catch (_) {}
    };
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
    box.addEventListener(
      "click",
      (e) => {
        if (justDragged) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );
    window.addEventListener("resize", () => placeWrap());
  }

  // ---- tela cheia: aparece quando mexe o mouse, some quando para ----
  let idleTimer = null;
  function wake() {
    if (!wrap) return;
    wrap.classList.remove("idle");
    clearTimeout(idleTimer);
    if (!document.fullscreenElement) return;
    idleTimer = setTimeout(() => {
      if (mode === "pill" && !box.matches(":hover") && !dragging && document.fullscreenElement) wrap.classList.add("idle");
    }, 2500);
  }

  function applyTheme() {
    const light = data.light;
    const accent = light ? data.accent.light : data.accent.dark;
    const hex = accent.replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const v = light
      ? { bg: "rgba(255,255,255,.82)", ink: "#141417", muted: "#5c5c66", raised: "#ececf0", line: "#dcdce2", live: "#16a34a", "live-a": "rgba(22,163,74,.5)", border: "#e4e4ea", shadow: "0 10px 30px rgba(20,20,23,.14), 0 2px 6px rgba(20,20,23,.08)", well: "rgba(236,236,240,.75)", arr: "#ffffff", hover: "rgba(20,20,23,.05)" }
      : { bg: "rgba(13,13,17,.80)", ink: "#f4f4f6", muted: "#a3a3ae", raised: "#24242c", line: "#2e2e38", live: "#4ade80", "live-a": "rgba(74,222,128,.55)", border: "#24242c", shadow: "0 12px 32px rgba(0,0,0,.45)", well: "rgba(36,36,44,.6)", arr: "#24242c", hover: "rgba(255,255,255,.05)" };
    v.accent = accent;
    v["on-accent"] = lum > 0.55 ? "#141417" : "#ffffff";
    v.soft = `rgba(${r},${g},${b},${light ? 0.12 : 0.18})`;
    v["soft-ink"] = light ? accent : lum > 0.55 ? accent : "#d6d1ff";
    for (const [k, val] of Object.entries(v)) box.style.setProperty("--" + k, val);
    wrap.classList.toggle("bottom", data.position === "bottom");
    wrap.style.setProperty("--top", (location.hostname.includes("youtube") ? 64 : location.hostname.includes("twitch") ? 58 : 70) + "px");
  }

  const RESERVED = new Set(["directory", "videos", "settings", "search", "following", "subscriptions", "inventory", "wallet", "drops", "downloads", "turbo", "p", "jobs", "categories", "browse", "clips", "messages", "friends", "dashboard", "popout", "moderator", "u", "user"]);
  // Canal da página aberta (mesmo que não esteja na lista).
  function pageChannel() {
    const host = location.hostname.replace(/^www\./, "");
    const parts = location.pathname.split("/").filter(Boolean);
    if (host === "youtube.com") {
      let h = parts[0] && parts[0].startsWith("@") ? parts[0] : "";
      if (!h) {
        const a = document.querySelector("ytd-watch-metadata ytd-video-owner-renderer a[href^='/@'], ytd-video-owner-renderer a[href^='/@'], #owner a[href^='/@']");
        h = a ? (a.getAttribute("href") || "").split("/")[1] || "" : "";
      }
      if (!h || h.length < 2) return null;
      try {
        h = decodeURIComponent(h);
      } catch (_) {}
      return { platform: "youtube", handle: h, key: ("youtube:" + h).toLowerCase() };
    }
    if ((host === "twitch.tv" || host === "kick.com") && parts.length === 1 && !RESERVED.has(parts[0].toLowerCase())) {
      const platform = host === "twitch.tv" ? "twitch" : "kick";
      return { platform, handle: parts[0].toLowerCase(), key: (platform + ":" + parts[0]).toLowerCase() };
    }
    return null;
  }
  function unlistedPage() {
    if (!data || currentLive()) return null;
    const p = pageChannel();
    if (!p || (data.listed || []).includes(p.key)) return null;
    return p;
  }

  function currentLive() {
    if (!data) return null;
    return data.lives.find((l) => l.key === data.current) || null;
  }

  function buildPill() {
    const v = el("div", "view pill");
    v.setAttribute("aria-label", T("Seus Canais"));
    const m = el("span", "m30");
    const art = svgNode(data.mascot.normal);
    if (art) m.append(art);
    const n = data.lives.length;
    const extra = unlistedPage();
    const cur = currentLive() || extra || data.lives[0];
    if (data.empty) v.append(m, el("span", "b", "+ " + T("Adicionar canal")));
    else v.append(m, el("span", n ? "dot" : "dot off"), el("span", "b", n ? `${n} ${T("ao vivo")}` : T("ninguém ao vivo")));
    if (cur) {
      v.append(el("span", "sep"), avatar(cur, 20, 10), el("span", "mut", cur.handle));
    }
    if (currentLive()) {
      const eq = el("span", "eq");
      eq.setAttribute("aria-hidden", "true");
      eq.append(el("i"), el("i"), el("i"), el("i"));
      v.append(eq);
    }
    if (replay.recording) v.append(el("span", "rec", "REC"));
    return v;
  }

  function act(cls, iconName, label, fn) {
    const b = el("button", "act" + (cls ? " " + cls : ""));
    b.type = "button";
    b.append(icon(iconName, 15), document.createTextNode(T(label)));
    b.onclick = async () => {
      b.disabled = true;
      try {
        await fn();
      } finally {
        setTimeout(() => (b.disabled = false), 800);
      }
    };
    return b;
  }

  function send(msg) {
    return new Promise((res) => {
      try {
        chrome.runtime.sendMessage(msg, (r) => {
          void chrome.runtime.lastError;
          res(r);
        });
      } catch (_) {
        res(null);
      }
    });
  }

  function buildPanel() {
    const v = el("div", "view panel");
    const cur = currentLive();
    const extra = unlistedPage();
    const shown = cur || data.lives[0];
    const head = el("div", "head");
    if (extra) {
      const aw = el("span", "avw");
      aw.append(avatar(extra, 44, 17));
      const info = el("div", "info");
      const nm = el("div", "nm");
      nm.append(el("b", "", extra.handle), el("span", "chip", PF[extra.platform] || ""));
      const add = el("button", "addb");
      add.type = "button";
      add.textContent = "+ " + T("Adicionar à lista");
      add.onclick = async () => {
        add.disabled = true;
        add.textContent = T("Adicionando…");
        const r = await send({ type: "ADD_FROM_URL", url: location.href });
        if (!r || r.error) {
          add.disabled = false;
          add.textContent = "+ " + T("Adicionar à lista");
        }
      };
      info.append(nm, el("div", "st off", T("Fora da sua lista")), add);
      head.append(aw, info);
    } else if (shown) {
      const aw = el("span", "avw");
      aw.append(avatar(shown, 44, 17), el("span", "ld"));
      const info = el("div", "info");
      const nm = el("div", "nm");
      nm.append(el("b", "", shown.handle), el("span", "chip", PF[shown.platform] || ""));
      const st = [T("Ao vivo há") + " " + fmtSince(shown.liveSince), fmtViewers(shown.viewers)].filter((x) => x && x.trim()).join(" · ");
      info.append(nm, el("div", "st", cur ? st : T("Você não está nessa live")));
      info.append(el("div", "tt", [shown.title, shown.category].filter(Boolean).join(" · ") || PF[shown.platform] || ""));
      head.append(aw, info);
    } else {
      const info = el("div", "info");
      info.append(el("div", "nm"), el("div", "st off", T("Nenhum canal seu está ao vivo agora")));
      info.firstChild.append(el("b", "", T("Seus Canais")));
      head.append(info);
    }
    const m = el("span", "m52");
    const art = svgNode(data.mascot.wave);
    if (art) m.append(art);
    const x = el("button", "x");
    x.type = "button";
    x.title = T("Esconder a ilha (religa em Configurações)");
    x.setAttribute("aria-label", x.title);
    x.append(icon("close", 14, 2.4));
    x.onclick = async () => {
      await send({ type: "ISLAND_HIDE" });
      box.classList.add("hidden");
    };
    head.append(m, x);
    v.append(head);

    const sw = el("div", "sw");
    const lives = data.lives;
    const per = 3;
    const pages = Math.max(1, Math.ceil(lives.length / per));
    if (page >= pages) page = 0;
    const prev = el("button", "arr");
    prev.type = "button";
    prev.setAttribute("aria-label", T("Live anterior"));
    prev.append(icon("left", 16, 2.4));
    const next = el("button", "arr");
    next.type = "button";
    next.setAttribute("aria-label", T("Próxima live"));
    next.append(icon("right", 16, 2.4));
    const list = el("div", "lives");
    if (!lives.length) list.append(el("div", "empty", T(data.empty ? "Adicione canais pra ver aqui quem está ao vivo." : "Quando alguém entrar ao vivo, aparece aqui.")));
    for (const lv of lives.slice(page * per, page * per + per)) {
      const b = el("button", "lv" + (lv.key === data.current ? " on" : ""));
      b.type = "button";
      b.title = `${lv.handle} · ${PF[lv.platform]}${lv.title ? " · " + lv.title : ""}`;
      const t = el("span");
      t.append(el("span", "n", lv.handle), el("span", "p", PF[lv.platform]));
      b.append(avatar(lv, 24, 11), t);
      b.onclick = () => {
        if (lv.key !== data.current && lv.url) location.href = lv.url;
      };
      list.append(b);
    }
    const idx = lives.findIndex((l) => l.key === data.current);
    const go = (d) => {
      if (lives.length < 2) return;
      if (idx >= 0) {
        const t = lives[(idx + d + lives.length) % lives.length];
        if (t && t.url) location.href = t.url;
      } else {
        page = (page + d + pages) % pages;
        render();
      }
    };
    prev.disabled = next.disabled = lives.length < 2;
    prev.onclick = () => go(-1);
    next.onclick = () => go(1);
    sw.append(prev, list, next);
    v.append(sw);

    const acts = el("div", "acts");
    acts.append(
      act("pri", "flag", "Marcar", () => send({ type: "MARK_MOMENT_HERE" })),
      act("", "scissors", "Cortar", () => send({ type: "CLIP_HERE" })),
      act("", "grid", "Ver juntas", () => send({ type: "OPEN_WATCH_TOGETHER" }))
    );
    v.append(acts);
    if (pageChannel() || currentLive()) v.append(buildFocus());

    const foot = el("div", "foot");
    const bar = el("span", "bar");
    const fill = el("i");
    fill.style.width = Math.round((data.levelProgress || 0) * 100) + "%";
    bar.append(fill);
    foot.append(el("span", "", `${T("Hoje")} ${fmtMin(data.todayMin)}`), bar, el("span", "", `${T("Nível")} ${data.level}`), el("span", "kbd", "Alt+Shift+M"));
    v.append(foot);
    return v;
  }

  // ---- modo foco: pra quem assiste trabalhando ----
  function mainVideo() {
    let best = null, area = 0;
    for (const vd of document.querySelectorAll("video")) {
      if (vd.readyState < 1) continue;
      const r = vd.getBoundingClientRect();
      const a = r.width * r.height;
      if (a > area) {
        area = a;
        best = vd;
      }
    }
    return best;
  }
  function note(title, desc, ok) {
    flash({ kind: ok ? "ok" : "err", title: T(title), desc: desc ? T(desc) : "" });
  }
  function chatUrl() {
    const host = location.hostname.replace(/^www\./, "");
    if (host === "youtube.com") {
      let id = null;
      try {
        id = window.__canaisYt && window.__canaisYt.videoId();
      } catch (_) {}
      return id ? "https://www.youtube.com/live_chat?is_popout=1&v=" + id : null;
    }
    const p = pageChannel();
    if (!p) return null;
    return p.platform === "twitch" ? `https://www.twitch.tv/popout/${p.handle}/chat?popout=` : `https://kick.com/popout/${p.handle}/chat`;
  }
  function focusBtn(iconName, label, tip, on, fn) {
    const b = el("button", "fb" + (on ? " on" : ""));
    b.type = "button";
    b.title = T(tip);
    b.append(icon(iconName, 14), document.createTextNode(T(label)));
    b.onclick = () => {
      b.disabled = true;
      Promise.resolve()
        .then(fn)
        .catch(() => {})
        .finally(() => setTimeout(() => (b.disabled = false), 600));
    };
    return b;
  }
  async function togglePip() {
    // precisa ser chamado direto no clique (o navegador só deixa abrir a janelinha com um clique da pessoa)
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return;
    }
    const vd = mainVideo();
    if (!vd) return note("Não achei o vídeo", "Abra a live e dá play");
    try {
      if (vd.disablePictureInPicture) vd.disablePictureInPicture = false;
      await vd.requestPictureInPicture();
    } catch (_) {
      note("Não deu pra abrir a live flutuante", "Dá play na live e tenta de novo");
    }
  }
  async function toggleLow() {
    const r = await send({ type: "FOCUS_QUALITY", restore: lowQuality });
    if (!r || !r.ok) return note("Não deu pra mudar a qualidade", (r && r.reason) || "");
    lowQuality = !lowQuality;
    note(lowQuality ? "Gastando menos internet" : "Qualidade de volta", r.label ? `${T("Qualidade")}: ${r.label}` : "", true);
  }
  async function openChat() {
    const u = chatUrl();
    if (!u) return note("Não achei o chat dessa página", "Abra a live do canal");
    const r = await send({ type: "FOCUS_CHAT", url: u });
    if (!r || !r.ok) note("Não deu pra abrir o chat", (r && r.reason) || "");
  }
  function buildFocus() {
    const box2 = el("div", "fx");
    box2.append(el("div", "fx-h", T("Modo foco · pra quem assiste trabalhando")));
    const row = el("div", "fx-row");
    row.append(
      focusBtn("low", "Menos internet", "Coloca a live na menor qualidade (clique de novo pra voltar)", lowQuality, toggleLow),
      focusBtn("pip", "Live flutuante", "Janelinha da live por cima das outras janelas", !!document.pictureInPictureElement, togglePip),
      focusBtn("chat", "Chat à parte", "Abre só o chat numa janela pequena, pra comentar sem a live aberta", false, openChat)
    );
    box2.append(row);
    return box2;
  }

  function buildFlash(f) {
    const v = el("div", "view flash");
    v.setAttribute("role", "status");
    const m = el("span", "m34");
    const art = svgNode(f.kind === "live" ? data.mascot.wave : f.kind === "err" ? data.mascot.normal : data.mascot.party);
    if (art) m.append(art);
    v.append(m);
    if (f.kind === "live" && f.lv) v.append(avatar(f.lv, 28, 12));
    else if (f.kind !== "err") {
      const ok = el("span", "ok");
      ok.append(icon("check", 12, 3.4));
      v.append(ok);
    }
    const t = el("span");
    t.append(el("span", "fl-t", f.title || ""), el("span", "fl-d", f.desc || ""));
    v.append(t);
    if (f.url) {
      const g = el("button", "go", T(f.button || "Assistir"));
      g.type = "button";
      g.onclick = () => {
        location.href = f.url;
      };
      v.append(g);
    }
    return v;
  }

  let flashItem = null;
  function render() {
    if (!data || !box) return;
    applyTheme();
    box.textContent = "";
    views = { pill: buildPill(), open: buildPanel() };
    box.append(views.pill, views.open);
    if (flashItem) {
      views.flash = buildFlash(flashItem);
      box.append(views.flash);
    }
    setMode(mode, true);
  }

  function setMode(m, instant) {
    if (m === "flash" && !views.flash) m = "pill";
    mode = m;
    box.classList.toggle("open", m === "open");
    for (const [k, v] of Object.entries(views)) v.classList.toggle("on", k === m);
    const v = views[m];
    if (!v) return;
    const measure = () => {
      box.style.width = v.offsetWidth + "px";
      box.style.height = v.offsetHeight + "px";
      placeWrap(v.offsetWidth, v.offsetHeight);
    };
    if (instant) {
      const t = box.style.transition;
      box.style.transition = "none";
      measure();
      void box.offsetWidth;
      box.style.transition = t;
    } else measure();
  }

  function flash(f) {
    wake();
    flashItem = f;
    clearTimeout(flashTimer);
    render();
    setMode("flash");
    flashTimer = setTimeout(() => {
      flashItem = null;
      setMode("pill");
      wake();
      setTimeout(() => !flashItem && render(), 400);
    }, f.kind === "live" ? 8000 : 4000);
  }

  let failCount = 0;
  let emptyRetry = null;
  let retryTimer = null;
  async function refresh() {
    const r = await send({ type: "GET_ISLAND", url: location.href });
    if (!r) {
      // a extensão ainda não respondeu (acabou de abrir ou de atualizar): tenta de novo
      clearTimeout(retryTimer);
      failCount++;
      retryTimer = setTimeout(refresh, Math.min(30000, 1000 * Math.pow(2, Math.min(failCount, 5))));
      return;
    }
    failCount = 0;
    if (!r.enabled) {
      if (box) box.classList.add("hidden");
      data = r;
      return;
    }
    LANG = r.lang || "pt";
    if (r.empty && !pageChannel()) {
      // ainda sem nenhum canal: só aparece na página de um canal, pra adicionar o primeiro
      if (box) box.classList.add("hidden");
      data = r;
      if (/youtube\.com$/.test(location.hostname) && emptyRetry !== location.href) {
        emptyRetry = location.href;
        setTimeout(() => soon(0), 2500);
      }
      return;
    }
    if (r.light == null) r.light = !(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
    data = r;
    ensureHost();
    render();
    if (/youtube\.com$/.test(location.hostname) && !currentLive() && !pageChannel()) setTimeout(() => mode === "pill" && render(), 2500);
    box.classList.remove("hidden");
    wake();
  }

  let refreshTimer = null;
  const soon = (ms = 300) => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, ms);
  };

  try {
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === "local" && (ch.channels || ch.settings || ch.watchLog || ch.achievements)) soon(ch.watchLog ? 1500 : 300);
    });
    chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
      if (msg && msg.type === "ISLAND_FLASH") {
        if (!data || !data.enabled || !box || document.visibilityState === "hidden") {
          sendResponse({ shown: false });
          return;
        }
        flash(msg.item || {});
        sendResponse({ shown: true });
      }
    });
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        lowQuality = false;
        soon(600);
      }
    }, 1000);
    setInterval(() => {
      if (mode === "pill" && !dragging) refresh();
    }, 60000);
    setInterval(async () => {
      if (!data || !data.enabled || !data.recorder) {
        if (replay.recording) {
          replay = { recording: false };
          if (mode === "pill") render();
        }
        return;
      }
      const before = replay.recording;
      try {
        replay = (window.__canaisReplayStatus && window.__canaisReplayStatus()) || { recording: false };
      } catch (_) {}
      if (before !== replay.recording && mode === "pill") render();
    }, 4000);
    const pipChanged = () => data && data.enabled && box && mode !== "flash" && render();
    document.addEventListener("enterpictureinpicture", pipChanged, true);
    document.addEventListener("leavepictureinpicture", pipChanged, true);
    document.addEventListener("fullscreenchange", () => {
      if (!box || !data || !data.enabled) return;
      ensureHost();
      placeWrap();
      wake();
    });
    document.addEventListener("mousemove", () => document.fullscreenElement && wake(), true);
    try {
      chrome.storage.local.get("islandXY").then(({ islandXY }) => {
        if (islandXY && Number.isFinite(islandXY.cx) && Number.isFinite(islandXY.y)) {
          pos = islandXY;
          placeWrap();
        }
      });
      chrome.storage.onChanged.addListener((ch, area) => {
        if (area === "local" && ch.islandXY && !dragging) {
          const v = ch.islandXY.newValue;
          pos = v && Number.isFinite(v.cx) ? v : null;
          placeWrap();
        }
      });
    } catch (_) {}
    refresh();
  } catch (_) {}
})();
