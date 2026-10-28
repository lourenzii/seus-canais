// Descobre se a página do YouTube é uma live acontecendo agora e qual é o vídeo.
// Não usa texto da tela (muda com o idioma): só classes, atributos e os dados da página.
(() => {
  if (!/(^|\.)youtube\.com$/.test(location.hostname)) return;

  function ytVideoId() {
    const flexy = document.querySelector("ytd-watch-flexy[video-id]");
    const fromFlexy = flexy && flexy.getAttribute("video-id");
    if (fromFlexy && /^[\w-]{11}$/.test(fromFlexy)) return fromFlexy;
    try {
      const u = new URL(location.href);
      if (u.pathname === "/watch" && /^[\w-]{11}$/.test(u.searchParams.get("v") || "")) return u.searchParams.get("v");
      const m = u.pathname.match(/^\/live\/([\w-]{11})/);
      if (m) return m[1];
    } catch (_) {}
    const canon = document.querySelector('link[rel="canonical"]');
    const c = canon && (canon.getAttribute("href") || "").match(/[?&]v=([\w-]{11})/);
    return c ? c[1] : null;
  }

  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden";
  }

  function ytIsLiveNow() {
    if (document.querySelector("#movie_player.ytp-live")) return true;
    for (const b of document.querySelectorAll("#movie_player .ytp-live-badge, #movie_player [class*='live-badge']")) {
      if (visible(b) && !b.closest("[aria-hidden='true']")) return true;
    }
    const id = ytVideoId();
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      const t = s.textContent || "";
      if (!/"isLiveBroadcast"\s*:\s*true/.test(t)) continue;
      if (id && t.indexOf(id) < 0) continue;
      if (/"endDate"/.test(t)) continue;
      const st = (t.match(/"startDate"\s*:\s*"([^"]+)"/) || [])[1];
      if (st && Date.parse(st) <= Date.now()) return true;
    }
    return false;
  }

  window.__canaisYt = { videoId: ytVideoId, isLiveNow: ytIsLiveNow };
})();
