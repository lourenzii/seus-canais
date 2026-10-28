// Troca o texto do popup pro inglês quando o idioma escolhido for inglês.
(function () {
  let lang = "pt";
  try {
    lang = localStorage.getItem("canaisLang") || "pt";
  } catch (_) {}
  window.__canaisLang = lang;
  document.documentElement.lang = lang === "en" ? "en" : "pt-BR";
  const ATTRS = ["title", "placeholder", "aria-label"];
  const setText = new WeakMap();
  const setAttr = new WeakMap();
  const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA"]);

  function trNode(n) {
    if (window.__canaisLang !== "en") return;
    const p = n.parentNode;
    if (!p || SKIP.has(p.nodeName)) return;
    const v = n.nodeValue;
    if (!v || !/[A-Za-zÀ-ú]/.test(v) || setText.get(n) === v) return;
    const t = trText(v, "en");
    if (t !== v) {
      setText.set(n, t);
      n.nodeValue = t;
    } else setText.set(n, v);
  }
  function trAttr(e, a) {
    if (window.__canaisLang !== "en" || !e.getAttribute) return;
    const v = e.getAttribute(a);
    if (!v) return;
    let m = setAttr.get(e);
    if (m && m[a] === v) return;
    const t = trText(v, "en");
    if (!m) setAttr.set(e, (m = {}));
    m[a] = t;
    if (t !== v) e.setAttribute(a, t);
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) return trNode(root);
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) {
      if (SKIP.has(root.nodeName)) return;
      for (const a of ATTRS) if (root.hasAttribute(a)) trAttr(root, a);
    }
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n = tw.nextNode();
    while (n) {
      if (n.nodeType === 3) trNode(n);
      else for (const a of ATTRS) if (n.hasAttribute(a)) trAttr(n, a);
      n = tw.nextNode();
    }
  }
  const obs = new MutationObserver((muts) => {
    if (window.__canaisLang !== "en") return;
    for (const m of muts) {
      if (m.type === "childList") m.addedNodes.forEach(walk);
      else if (m.type === "characterData") trNode(m.target);
      else if (m.type === "attributes") trAttr(m.target, m.attributeName);
    }
  });
  obs.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  if (lang === "en") document.addEventListener("DOMContentLoaded", () => walk(document.body));

  // textos desenhados em imagem (cartão de perfil, retrospectiva)
  try {
    const P = CanvasRenderingContext2D.prototype;
    const fill = P.fillText;
    const measure = P.measureText;
    P.fillText = function (t, ...a) {
      return fill.call(this, window.__canaisLang === "en" ? trText(String(t), "en") : t, ...a);
    };
    P.measureText = function (t) {
      return measure.call(this, window.__canaisLang === "en" ? trText(String(t), "en") : t);
    };
  } catch (_) {}

  try {
    chrome.storage.local.get("settings").then(({ settings = {} }) => {
      const real = uiLang(settings);
      try {
        localStorage.setItem("canaisLang", real);
      } catch (_) {}
      if (real !== window.__canaisLang) {
        if (real === "en") {
          window.__canaisLang = "en";
          document.documentElement.lang = "en";
          walk(document.body);
        } else location.reload();
      }
    });
  } catch (_) {}
})();
