(() => {
  try {
    if (window.__canaisLikes && window.__canaisLikes()) return;
  } catch (_) {}
  window.__canaisLikes = () => !!(chrome.runtime && chrome.runtime.id);
  if (!location.hostname.endsWith("youtube.com")) return;

  const sent = new Set();
  const tried = new Map();

  function videoId() {
    return window.__canaisYt ? window.__canaisYt.videoId() : null;
  }

  function isLive() {
    return !!(window.__canaisYt && window.__canaisYt.isLiveNow());
  }

  function likePressed() {
    const btn = document.querySelector(
      "segmented-like-dislike-button-view-model like-button-view-model button[aria-pressed], like-button-view-model button[aria-pressed], #segmented-like-button button[aria-pressed], ytd-segmented-like-dislike-button-renderer button[aria-pressed]"
    );
    return !!btn && btn.getAttribute("aria-pressed") === "true";
  }

  // Manda o like com a informação de "parece live"; o fundo da extensão também confere
  // se o vídeo é a live atual de algum canal da lista.
  function tick() {
    const id = videoId();
    if (!id || !/^[\w-]{11}$/.test(id) || sent.has(id)) return;
    if (!likePressed()) return;
    const live = isLive();
    if (live) sent.add(id);
    else {
      // não deu pra ter certeza de que é live: tenta de novo de vez em quando (a extensão confere pela lista de canais)
      const last = tried.get(id) || 0;
      if (Date.now() - last < 60000) return;
      tried.set(id, Date.now());
    }
    try {
      chrome.runtime.sendMessage({ type: "LIKE_LIVE", videoId: id, live }, () => void chrome.runtime.lastError);
    } catch (_) {}
  }

  setInterval(tick, 2500);
})();
