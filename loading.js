(() => {
  const q = new URLSearchParams(location.search);
  const url = q.get("u") || "";
  const name = q.get("n") || "";
  const ok = /^https:\/\/(www\.youtube\.com|www\.twitch\.tv|kick\.com)\//.test(url);
  chrome.storage.local.get("settings").then(({ settings = {} }) => {
    const lang = typeof uiLang === "function" ? uiLang(settings) : "pt";
    const T = (s) => (typeof trText === "function" ? trText(s, lang) : s);
    document.documentElement.lang = lang === "en" ? "en" : "pt-BR";
    document.getElementById("t").textContent = T("Carregando live…");
    document.title = T("Carregando live…");
    if (name) document.getElementById("h").textContent = name;
    let variant = "iris";
    try {
      variant = currentMascot({ ...settings, hideMascot: false }, { level: 999 }) || "iris";
    } catch (_) {}
    document.getElementById("m").innerHTML = mascotSvg(variant, "acenando", 120);
  });
  if (ok) setTimeout(() => location.replace(url), 350);
})();
