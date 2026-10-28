(() => {
  try {
    if (window.__canaisToast && window.__canaisToast()) return;
  } catch (_) {}
  window.__canaisToast = () => !!(chrome.runtime && chrome.runtime.id);

  const CSS = `
  :host { all: initial; }
  .wrap { position: fixed; top: 20px; right: 20px; z-index: 2147483647; display: flex; flex-direction: column; gap: 10px; pointer-events: none;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif; }
  .card { pointer-events: auto; cursor: pointer; position: relative; display: flex; align-items: center; gap: 14px; width: 320px; box-sizing: border-box;
    padding: 14px 18px 14px 14px; border-radius: 20px; background: rgba(11,12,20,.92); color: #f1f2f6;
    border: 1px solid rgba(255,255,255,.09); box-shadow: 0 18px 50px rgba(0,0,0,.45), 0 2px 8px rgba(0,0,0,.25);
    -webkit-backdrop-filter: blur(18px) saturate(1.4); backdrop-filter: blur(18px) saturate(1.4);
    animation: card-in .55s cubic-bezier(.2,.9,.25,1.15) both; overflow: visible; }
  .card.out { animation: card-out .38s cubic-bezier(.4,0,.6,1) both; }
  .badge { position: relative; width: 60px; height: 60px; flex-shrink: 0; }
  .badge img, .badge .img { position: relative; z-index: 2; width: 60px; height: 60px; display: block; animation: pop .7s cubic-bezier(.2,.9,.25,1.3) .12s both; }
  .ring { position: absolute; inset: -4px; border-radius: 50%; border: 2px solid #8b7fff; opacity: 0; z-index: 1; animation: ring 1.1s ease-out .35s both; }
  .ring.r2 { border-color: #ff5c9d; animation-delay: .55s; }
  .bit { position: absolute; left: 50%; top: 50%; width: 7px; height: 7px; margin: -3.5px; border-radius: 2px; z-index: 3; opacity: 0;
    animation: burst .9s cubic-bezier(.15,.7,.3,1) .3s both; }
  .bit.round { border-radius: 50%; }
  .txt { min-width: 0; }
  .kicker { font-size: 10.5px; line-height: 13px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #8b7fff; margin-bottom: 3px;
    animation: rise .45s ease-out .25s both; }
  .title { font-size: 15px; line-height: 19px; font-weight: 700; letter-spacing: -0.01em; color: #fff; animation: rise .45s ease-out .32s both; }
  .desc { font-size: 12px; line-height: 16px; color: #a3a5b2; margin-top: 2px; animation: rise .45s ease-out .38s both;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .more { position: absolute; right: 12px; top: 10px; font-size: 11px; font-weight: 700; color: #ff5c9d; }
  .timer { position: absolute; left: 18px; right: 18px; bottom: 6px; height: 2px; border-radius: 2px; background: rgba(255,255,255,.08); overflow: hidden; }
  .timer b { display: block; height: 100%; background: #8b7fff; transform-origin: left; animation: timer var(--dur) linear both; }
  .card:hover .timer b { animation-play-state: paused; }
  @keyframes card-in { from { opacity: 0; transform: translateY(-14px) scale(.96); } to { opacity: 1; transform: none; } }
  @keyframes card-out { to { opacity: 0; transform: translateY(-10px) scale(.97); } }
  @keyframes pop { 0% { opacity: 0; transform: scale(.3) rotate(-24deg); } 60% { opacity: 1; transform: scale(1.14) rotate(6deg); } 100% { transform: scale(1) rotate(0); } }
  @keyframes ring { 0% { opacity: .9; transform: scale(.7); } 100% { opacity: 0; transform: scale(1.5); } }
  @keyframes burst { 0% { opacity: 1; transform: translate(0,0) rotate(0) scale(1); } 100% { opacity: 0; transform: translate(var(--x), var(--y)) rotate(var(--r)) scale(.6); } }
  @keyframes rise { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
  @keyframes timer { from { transform: scaleX(1); } to { transform: scaleX(0); } }
  .mascot { position: relative; width: 60px; height: 60px; flex-shrink: 0; display: grid; place-items: center; }
  .mascot svg { width: 60px; height: 60px; overflow: visible; }
  .side-mascot { width: 44px; height: 44px; flex-shrink: 0; margin-left: auto; }
  .side-mascot svg { width: 44px; height: 44px; overflow: visible; }
  .card.live .kicker { color: #4ade80; }
  .card.live .timer b { background: #4ade80; }
  .live-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #4ade80; margin-right: 6px; vertical-align: 1px; animation: dot 1.4s ease-in-out infinite; }
  .act { margin-top: 8px; display: flex; gap: 6px; }
  .act button { height: 30px; padding: 0 14px; border: none; border-radius: 999px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
  .act .go { background: #8b7fff; color: #0b0c14; }
  .act .later { background: rgba(255,255,255,.08); color: #f1f2f6; }
  @keyframes dot { 50% { opacity: .35; } }
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
  @keyframes dg-hop { 0%, 100% { transform: translateY(0) scale(1.03, .96); } 45% { transform: translateY(-10px) scale(.98, 1.03); } }
  @keyframes dg-pop { 0%, 100% { opacity: 0; transform: scale(.4) translateY(6px); } 40%, 60% { opacity: 1; transform: scale(1) translateY(-4px); } }
  @media (prefers-reduced-motion: reduce) {
    .card, .card.out, .badge img, .badge .img, .kicker, .title, .desc { animation-duration: .01s !important; animation-delay: 0s !important; }
    .bit, .ring { display: none; }
    .dg *, .live-dot { animation: none !important; }
  }`;

  let host = null;
  let root = null;
  let wrap = null;
  const queue = [];
  let showing = false;

  function mountPoint() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.documentElement;
  }

  function ensureHost() {
    if (!host) {
      host = document.createElement("canais-toast");
      root = host.attachShadow({ mode: "closed" });
      const style = document.createElement("style");
      style.textContent = CSS;
      wrap = document.createElement("div");
      wrap.className = "wrap";
      root.append(style, wrap);
    }
    const target = mountPoint();
    if (host.parentNode !== target) target.appendChild(host);
  }

  document.addEventListener("fullscreenchange", () => host && host.isConnected && ensureHost());

  const T = (s) => (typeof trText === "function" ? trText(s, window.__canaisLang || "pt") : s);
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = T(text);
    return e;
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

  function showLive(item) {
    ensureHost();
    const dur = 9000;
    const card = el("div", item.kind === "live" ? "card live" : "card");
    card.style.setProperty("--dur", dur + "ms");
    const m = el("div", "mascot");
    const art = svgNode(item.mascot);
    if (art) m.append(art);
    const txt = el("div", "txt");
    const kick = el("div", "kicker");
    if (item.kind === "live") kick.append(el("span", "live-dot"));
    kick.append(document.createTextNode(T(item.kicker || "Ao vivo agora")));
    const act = el("div", "act");
    const go = el("button", "go", item.button || "Assistir");
    const later = el("button", "later", "Depois");
    act.append(go, later);
    txt.append(kick, el("div", "title", item.title || ""), el("div", "desc", item.desc || ""));
    if (item.url) txt.append(act);
    if (art) card.append(m);
    card.append(txt);
    const timer = el("div", "timer");
    timer.append(el("b"));
    card.append(timer);
    wrap.append(card);
    return new Promise((resolve) => {
      let left = dur;
      let started = Date.now();
      let t = null;
      const close = () => {
        clearTimeout(t);
        card.classList.add("out");
        setTimeout(() => {
          card.remove();
          resolve();
        }, 380);
      };
      const arm = () => {
        started = Date.now();
        t = setTimeout(close, left);
      };
      card.addEventListener("mouseenter", () => {
        clearTimeout(t);
        left -= Date.now() - started;
      });
      card.addEventListener("mouseleave", arm);
      go.addEventListener("click", (e) => {
        e.stopPropagation();
        try {
          chrome.runtime.sendMessage({ type: "OPEN_URL", url: item.url }, () => void chrome.runtime.lastError);
        } catch (_) {}
        close();
      });
      later.addEventListener("click", (e) => {
        e.stopPropagation();
        close();
      });
      arm();
    });
  }

  function showOne(item, extra) {
    if (item.kind === "live" || item.kind === "info") return showLive(item);
    ensureHost();
    const dur = 5200;
    const card = el("div", "card");
    card.style.setProperty("--dur", dur + "ms");
    const badge = el("div", "badge");
    let img = svgNode(item.svg);
    if (img) img.setAttribute("class", "img");
    else {
      img = document.createElement("span");
      img.className = "img";
    }
    badge.append(el("span", "ring"), el("span", "ring r2"), img);
    const colors = ["#3ee8ff", "#5b4bff", "#ff3d8b", "#8b7fff", "#ffffff"];
    for (let i = 0; i < 16; i++) {
      const bit = el("span", "bit" + (i % 3 === 0 ? " round" : ""));
      const ang = (Math.PI * 2 * i) / 16 + (Math.random() - 0.5) * 0.5;
      const dist = 38 + Math.random() * 34;
      bit.style.setProperty("--x", `${Math.cos(ang) * dist}px`);
      bit.style.setProperty("--y", `${Math.sin(ang) * dist}px`);
      bit.style.setProperty("--r", `${Math.round(Math.random() * 360)}deg`);
      bit.style.background = colors[i % colors.length];
      bit.style.animationDelay = `${0.28 + Math.random() * 0.12}s`;
      badge.append(bit);
    }
    const txt = el("div", "txt");
    txt.append(el("div", "kicker", item.kicker || "Conquista desbloqueada"), el("div", "title", item.title || ""), el("div", "desc", item.desc || ""));
    card.append(badge, txt);
    const side = svgNode(item.mascot);
    if (side) {
      const sm = el("div", "side-mascot");
      sm.append(side);
      card.append(sm);
    }
    if (extra > 0) card.append(el("div", "more", `+${extra}`));
    const timer = el("div", "timer");
    timer.append(el("b"));
    card.append(timer);
    wrap.append(card);

    return new Promise((resolve) => {
      let left = dur;
      let started = Date.now();
      let t = null;
      const close = () => {
        clearTimeout(t);
        card.classList.add("out");
        setTimeout(() => {
          card.remove();
          resolve();
        }, 380);
      };
      const arm = () => {
        started = Date.now();
        t = setTimeout(close, left);
      };
      card.addEventListener("mouseenter", () => {
        clearTimeout(t);
        left -= Date.now() - started;
      });
      card.addEventListener("mouseleave", arm);
      card.addEventListener("click", close);
      arm();
    });
  }

  async function drain() {
    if (showing) return;
    showing = true;
    while (queue.length) {
      const item = queue.shift();
      const extra = queue.length > 2 ? queue.length : 0;
      await showOne(item, extra);
      if (extra) queue.length = 0;
    }
    showing = false;
  }

  try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg && msg.type === "GET_TIME") {
        let v = null;
        for (const el of document.querySelectorAll("video")) if (!v || (el.duration || 0) > (v.duration || 0) || (!el.paused && v.paused)) v = el;
        const live = !!(window.__canaisYt && window.__canaisYt.isLiveNow()) || /twitch\.tv\/[^/]+\/?$|kick\.com\/[^/]+\/?$/.test(location.href);
        sendResponse(v ? { ok: true, currentTime: v.currentTime || 0, duration: Number.isFinite(v.duration) ? v.duration : null, live, title: document.title } : { ok: false, live, title: document.title });
        return;
      }
      if (msg && (msg.type === "SHOW_BADGES" || msg.type === "SHOW_CARDS") && Array.isArray(msg.items)) {
        if (document.visibilityState === "hidden") {
          sendResponse({ shown: false });
          return;
        }
        queue.push(...msg.items.slice(0, 10));
        drain();
        sendResponse({ shown: true });
      }
    });
  } catch (_) {}
})();
