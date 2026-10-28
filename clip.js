(() => {
  try {
    if (window.__canaisClip && window.__canaisClip()) return;
  } catch (_) {}
  window.__canaisClip = () => !!(chrome.runtime && chrome.runtime.id);

  const host = location.hostname.replace(/^www\./, "");
  const SITE = host === "youtube.com" ? "youtube" : host === "twitch.tv" ? "twitch" : host === "kick.com" ? "kick" : null;
  if (!SITE) return;

  // ---- gravador de replay ----
  // Dois gravadores revezando: cada um grava até CYCLE ms e recomeça, com metade do ciclo de diferença.
  // Assim sempre tem um arquivo inteiro com entre CYCLE/2 e CYCLE de vídeo, terminando agora.
  const CYCLE = 90000;
  let enabled = false;
  let video = null;
  let stream = null;
  let recs = [];
  let stagger = null;
  let watchTimer = null;
  let lastErr = "";
  let mp4Broken = false; // se o .mp4 não gerar nada nesse navegador, passa a gravar em .webm

  function pickMime() {
    // .mp4 (H.264) abre em qualquer player, inclusive o do Windows; .webm fica de reserva.
    const all = ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4;codecs=avc1.4D401F,mp4a.40.2", "video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    for (const m of all.filter((x) => !(mp4Broken && /mp4/.test(x)))) {
      try {
        if (MediaRecorder.isTypeSupported(m)) return m;
      } catch (_) {}
    }
    return "";
  }

  function mainVideo() {
    let best = null;
    let area = 0;
    for (const v of document.querySelectorAll("video")) {
      if (v.paused || v.readyState < 2) continue;
      const r = v.getBoundingClientRect();
      const a = r.width * r.height;
      if (a > area) {
        area = a;
        best = v;
      }
    }
    return best;
  }

  function isLivePage() {
    if (SITE === "youtube") return !!(window.__canaisYt && window.__canaisYt.isLiveNow()) || /^\/(live\/|@[^/]+\/live)/.test(location.pathname);
    const parts = location.pathname.split("/").filter(Boolean);
    return parts.length === 1 || (SITE === "kick" && parts.length === 1);
  }

  function makeRec(slot) {
    const mime = pickMime();
    let rec;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 3500000 } : undefined);
    } catch (_) {
      lastErr = "o navegador não conseguiu iniciar a gravação";
      return null;
    }
    const st = { rec, chunks: [], start: Date.now(), slot, timer: null, onDone: null, mime, bytes: 0, lastData: 0 };
    rec.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return;
      st.chunks.push(e.data);
      st.bytes += e.data.size;
      st.lastData = Date.now();
    };
    rec.onstop = () => {
      const done = st.onDone;
      st.onDone = null;
      if (done) done(new Blob(st.chunks, { type: (mime || "video/webm").split(";")[0] }), Date.now() - st.start);
      st.chunks = [];
      st.bytes = 0;
      const alive = stream && stream.getTracks().some((t) => t.readyState === "live");
      if (enabled && alive && recs[slot] === st) restartSlot(slot);
    };
    rec.onerror = () => {
      try {
        rec.stop();
      } catch (_) {}
    };
    try {
      rec.start(1000);
    } catch (_) {
      return null;
    }
    st.timer = setTimeout(() => {
      try {
        if (rec.state !== "inactive") rec.stop();
      } catch (_) {}
    }, CYCLE);
    return st;
  }

  function restartSlot(slot) {
    if (!enabled || !stream) return;
    recs[slot] = makeRec(slot);
  }

  function stopAll() {
    clearTimeout(stagger);
    for (const st of recs) {
      if (!st) continue;
      clearTimeout(st.timer);
      st.onDone = null;
      try {
        if (st.rec.state !== "inactive") st.rec.stop();
      } catch (_) {}
    }
    recs = [];
    stream = null;
    video = null;
  }

  function attach() {
    const v = mainVideo();
    if (!v || !isLivePage()) {
      if (video && (!video.isConnected || video.paused)) stopAll();
      return;
    }
    const tracksAlive = stream && stream.getTracks().some((t) => t.readyState === "live");
    // gravador "travado": está gravando mas não recebe imagem há alguns segundos (o site trocou o vídeo, propaganda etc.)
    const now = Date.now();
    const rec0 = recs.filter((s) => s && s.rec.state === "recording");
    const stuck = rec0.length && rec0.every((s) => now - s.start > 8000 && now - (s.lastData || s.start) > 6000);
    if (stuck && rec0.every((s) => !s.lastData && /mp4/.test(s.mime || ""))) mp4Broken = true;
    if (v === video && tracksAlive && !stuck) return;
    stopAll();
    try {
      stream = v.captureStream ? v.captureStream() : null;
    } catch (_) {
      stream = null;
    }
    if (!stream || !stream.getVideoTracks().length) {
      stream = null;
      lastErr = "o site não deixou gravar este vídeo";
      return;
    }
    lastErr = "";
    video = v;
    recs = [makeRec(0), null];
    stagger = setTimeout(() => {
      if (enabled && stream) recs[1] = makeRec(1);
    }, CYCLE / 2);
  }

  function setEnabled(on) {
    enabled = !!on;
    clearInterval(watchTimer);
    if (!enabled) {
      stopAll();
      return;
    }
    attach();
    watchTimer = setInterval(attach, 3000);
  }

  function replayStatus() {
    const live = recs.filter((s) => s && s.rec.state === "recording");
    if (!live.length) return { recording: false, secs: 0 };
    const oldest = live.reduce((a, b) => (a.start < b.start ? a : b));
    return { recording: true, secs: Math.round((Date.now() - oldest.start) / 1000) };
  }

  window.__canaisReplayStatus = () => ({ ...replayStatus(), enabled });

  function channelName() {
    const parts = location.pathname.split("/").filter(Boolean);
    if (SITE !== "youtube") return parts[0] || SITE;
    const a = document.querySelector("ytd-video-owner-renderer #channel-name a, #owner #channel-name a");
    const name = a ? (a.getAttribute("href") || "").split("/").pop() : "";
    return (name || "youtube").replace(/[^\w.-]+/g, "");
  }

  // O MediaRecorder não grava a duração no arquivo, e alguns editores não conseguem pular no vídeo sem ela.
  function vintAt(b, p) {
    const first = b[p];
    let len = 1;
    while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
    let val = first & (0xff >> len);
    for (let i = 1; i < len; i++) val = val * 256 + b[p + i];
    return { len, val, unknown: val === Math.pow(2, 7 * len) - 1 };
  }
  function idAt(b, p) {
    const first = b[p];
    let len = 1;
    while (len <= 4 && !(first & (0x80 >> (len - 1)))) len++;
    let id = 0;
    for (let i = 0; i < len; i++) id = id * 256 + b[p + i];
    return { len, id };
  }
  function sizeBytes(val, width) {
    const out = new Uint8Array(width);
    let v = val;
    for (let i = width - 1; i >= 0; i--) {
      out[i] = v % 256;
      v = Math.floor(v / 256);
    }
    out[0] |= 0x80 >> (width - 1);
    return out;
  }
  async function withDuration(blob, ms) {
    try {
      const b = new Uint8Array(await blob.arrayBuffer());
      let p = 0;
      const h = idAt(b, p);
      if (h.id !== 0x1a45dfa3) return blob;
      const hs = vintAt(b, p + h.len);
      p += h.len + hs.len + hs.val;
      const seg = idAt(b, p);
      if (seg.id !== 0x18538067) return blob;
      const segSize = vintAt(b, p + seg.len);
      p += seg.len + segSize.len;
      for (let guard = 0; guard < 20 && p < b.length; guard++) {
        const el = idAt(b, p);
        const sz = vintAt(b, p + el.len);
        const dataStart = p + el.len + sz.len;
        if (el.id === 0x1549a966 && !sz.unknown) {
          const dataEnd = dataStart + sz.val;
          for (let q = dataStart; q < dataEnd; ) {
            const ce = idAt(b, q);
            const cs = vintAt(b, q + ce.len);
            if (ce.id === 0x4489) return blob;
            q += ce.len + cs.len + cs.val;
          }
          const dur = new Uint8Array(11);
          dur.set([0x44, 0x89, 0x88]);
          new DataView(dur.buffer).setFloat64(3, ms);
          const newSize = sz.val + 11;
          const width = newSize < Math.pow(2, 7 * sz.len) - 1 ? sz.len : 8;
          const parts = [b.subarray(0, p), b.subarray(p, p + el.len), sizeBytes(newSize, width), b.subarray(dataStart, dataEnd), dur, b.subarray(dataEnd)];
          return new Blob(parts, { type: blob.type });
        }
        if (sz.unknown) break;
        p = dataStart + sz.val;
      }
    } catch (_) {}
    return blob;
  }

  function saveReplay() {
    return new Promise((resolve) => {
      const going = recs.filter((s) => s && s.rec.state === "recording");
      const live = going.filter((s) => Date.now() - s.start > 4000 && s.bytes > 0);
      if (!live.length) {
        if (going.length && going.every((s) => Date.now() - s.start > 8000)) {
          // tá gravando mas sem imagem: recomeça a gravação do zero
          if (going.every((s) => !s.lastData && /mp4/.test(s.mime || ""))) mp4Broken = true;
          stopAll();
          attach();
          return resolve({ ok: false, reason: "o gravador não estava recebendo a imagem da live, já reiniciei. Espera uns 15 segundos e corta de novo" });
        }
        return resolve({ ok: false, reason: "o gravador ainda está começando, espera uns segundos" });
      }
      const st = live.reduce((a, b) => (a.start < b.start ? a : b));
      clearTimeout(st.timer);
      st.onDone = async (raw, ms) => {
        if (!raw.size) {
          stopAll();
          attach();
          return resolve({ ok: false, reason: "o gravador não estava recebendo a imagem da live, já reiniciei. Espera uns 15 segundos e corta de novo" });
        }
        const isMp4 = /mp4/.test(raw.type);
        const blob = isMp4 ? raw : await withDuration(raw, ms);
        const d = new Date();
        const p = (n) => String(n).padStart(2, "0");
        const name = `corte-${channelName()}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}h${p(d.getMinutes())}m${p(d.getSeconds())}.${isMp4 ? "mp4" : "webm"}`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.style.display = "none";
        document.documentElement.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        resolve({ ok: true, mode: "replay", secs: Math.round(ms / 1000), file: name });
      };
      try {
        st.rec.stop();
      } catch (_) {
        resolve({ ok: false, reason: "não deu pra parar o gravador" });
      }
    });
  }

  // ---- clipe do próprio site ----
  function visible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function findNativeClipButton() {
    const sels =
      SITE === "twitch"
        ? ['[data-a-target="player-clip-button"]', 'button[aria-label*="Clip" i]']
        : SITE === "kick"
        ? ['button[aria-label*="clip" i]', 'button[title*="clip" i]', '[data-testid*="clip" i]']
        : ['ytd-menu-renderer button[aria-label*="Clip" i]', 'ytd-menu-renderer button[aria-label*="Clipe" i]', 'button[aria-label="Clip"]', 'button[aria-label="Clipe"]'];
    for (const s of sels) {
      for (const el of document.querySelectorAll(s)) if (visible(el)) return el;
    }
    if (SITE === "kick") {
      for (const el of document.querySelectorAll("button")) if (/^\s*clip\s*$/i.test(el.textContent || "") && visible(el)) return el;
    }
    return null;
  }

  async function clipNow(prefer) {
    // Twitch: usa o clipe do próprio site. YouTube e Kick: usam o gravador.
    if (SITE === "twitch" && prefer !== "replay") {
      const btn = findNativeClipButton();
      if (btn) {
        btn.click();
        return { ok: true, mode: "native", site: SITE };
      }
    }
    if (enabled && replayStatus().recording) return saveReplay();
    const where = SITE === "youtube" ? "no YouTube" : SITE === "kick" ? "na Kick" : "aqui";
    if (!enabled) return { ok: false, reason: `ligue o Gravador de replay nas configurações do Seus Canais pra cortar ${where}`, needsRecorder: true };
    if (!isLivePage()) return { ok: false, reason: "o gravador só grava em página de live" };
    if (!mainVideo()) return { ok: false, reason: "o gravador ainda não pegou o vídeo: dá play na live e espera uns segundos" };
    return { ok: false, reason: lastErr || "o gravador está começando, tenta de novo em uns segundos" };
  }

  try {
    chrome.storage.local.get("settings").then(({ settings = {} }) => setEnabled(settings.clipRecorder === true));
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === "local" && ch.settings) setEnabled(((ch.settings.newValue || {}).clipRecorder) === true);
    });
    chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
      if (!msg) return;
      if (msg.type === "CLIP") {
        clipNow(msg.prefer)
          .then(sendResponse)
          .catch((e) => sendResponse({ ok: false, reason: String((e && e.message) || e) }));
        return true;
      }
      if (msg.type === "REPLAY_STATUS") {
        sendResponse({ ...replayStatus(), enabled, site: SITE });
      }
    });
    window.addEventListener("canais-clip", () => {
      try {
        chrome.runtime.sendMessage({ type: "CLIP_HERE" }, () => void chrome.runtime.lastError);
      } catch (_) {}
    });
  } catch (_) {}
})();
