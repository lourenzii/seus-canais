importScripts("i18n.js", "channel-url.js", "insights.js", "mascot.js", "sync.js");

// idioma da interface (português ou inglês)
let UI_LANG = "pt";
function tl(s) {
  return typeof trText === "function" ? trText(s, UI_LANG) : s;
}
function refreshLang() {
  return chrome.storage.local
    .get("settings")
    .then(({ settings = {} }) => {
      const before = UI_LANG;
      UI_LANG = uiLang(settings);
      if (before !== UI_LANG) setupContextMenus();
    })
    .catch(() => {});
}
refreshLang();
if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === "local" && ch.settings) refreshLang();
  });
}
function notifCreate(id, opts, cb) {
  const o = { ...opts };
  for (const k of ["title", "message", "contextMessage"]) if (o[k]) o[k] = String(o[k]).split("\n").map(tl).join("\n");
  if (Array.isArray(o.buttons)) o.buttons = o.buttons.map((b) => ({ ...b, title: tl(b.title) }));
  if (Array.isArray(o.items)) o.items = o.items.map((it) => ({ title: tl(it.title), message: tl(it.message) }));
  return cb ? chrome.notifications.create(id, o, cb) : chrome.notifications.create(id, o);
}
function trItem(it) {
  const o = { ...it };
  for (const k of ["kicker", "title", "desc", "button"]) if (o[k]) o[k] = tl(o[k]);
  return o;
}

const ALARM_NAME = "streambell-check";
const WATCH_ALARM = "canais-watch";

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { interval: 5, ...(settings || {}) };
}

async function updateAlarm() {
  const settings = await getSettings();
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: settings.interval });
  chrome.alarms.create(WATCH_ALARM, { periodInMinutes: 1 });
}

function minutesOfDay(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function isQuietNow(settings, now = new Date()) {
  if (settings.dndUntil && settings.dndUntil > now.getTime()) return true;
  const q = settings.quietHours;
  if (!q || !q.enabled) return false;
  const start = minutesOfDay(q.start);
  const end = minutesOfDay(q.end);
  if (start === null || end === null || start === end) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  return start < end ? cur >= start && cur < end : cur >= start || cur < end;
}

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function matchesKeywords(channel, title, category) {
  const words = String(channel.keywords || "")
    .split(",")
    .map((w) => normalizeText(w).trim())
    .filter(Boolean);
  if (!words.length) return true;
  if (!title && !category) return true;
  const hay = normalizeText(title) + " " + normalizeText(category);
  return words.some((w) => hay.includes(w));
}

function decodeHtml(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function pruneNotifMap(map, now = Date.now()) {
  for (const [id, e] of Object.entries(map)) if (!e || !e.at || now - e.at > 3 * 86400000) delete map[id];
  return map;
}

function channelKey(c) {
  return (c.platform || "youtube") + ":" + c.handle;
}

function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

let historyLock = Promise.resolve();
function withHistoryLock(fn) {
  const run = historyLock.then(fn, fn);
  historyLock = run.catch(() => {});
  return run;
}

const MAX_HISTORY = 500;
const KEEP_DAYS = 400;

function tabMatchesChannel(url, ch) {
  let u;
  try {
    u = new URL(url);
  } catch (_) {
    return false;
  }
  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
  const platform = ch.platform || "youtube";
  const h = ch.handle.replace("@", "").trim().toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p).toLowerCase());
  if (platform === "twitch") return host === "twitch.tv" && parts.length === 1 && parts[0] === h;
  if (platform === "kick") return host === "kick.com" && parts.length === 1 && parts[0] === h;
  if (host !== "youtube.com") return false;
  if (parts[0] === "@" + h && parts[1] === "live") return true;
  if (!ch.liveVideoId) return false;
  if (parts[0] === "watch" && u.searchParams.get("v") === ch.liveVideoId) return true;
  if (parts[0] === "live" && parts[1] === ch.liveVideoId.toLowerCase()) return true;
  return false;
}

function fmtMin(min) {
  const m = Math.round(min || 0);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}min` : `${h}h`;
}

function channelPageUrl(ch) {
  const pf = ch.platform || "youtube";
  const h = ch.handle.replace("@", "");
  if (pf === "twitch") return `https://www.twitch.tv/${h.toLowerCase()}`;
  if (pf === "kick") return `https://kick.com/${h.toLowerCase()}`;
  return `https://www.youtube.com/@${h}`;
}

async function isUserAway() {
  try {
    if (!chrome.idle?.queryState) return false;
    const state = await chrome.idle.queryState(600);
    if (state === "locked") return true;
    if (state === "idle") {
      const audible = await chrome.tabs.query({ audible: true });
      return audible.length === 0;
    }
  } catch (_) {}
  return false;
}

async function queueAway(item) {
  const { pendingAway = [] } = await chrome.storage.local.get("pendingAway");
  const rest = pendingAway.filter((p) => !(p.kind === item.kind && p.key === item.key));
  rest.push({ ...item, at: Date.now() });
  await chrome.storage.local.set({ pendingAway: rest.slice(-20) });
}

async function flushAway() {
  const { pendingAway = [], channels = [] } = await chrome.storage.local.get(["pendingAway", "channels"]);
  if (!pendingAway.length) return;
  await chrome.storage.local.set({ pendingAway: [] });
  const settings = await getSettings();
  if (isQuietNow(settings)) return;
  const now = Date.now();
  const items = pendingAway.filter((p) => {
    if (now - p.at > 12 * 3600000) return false;
    if (p.kind !== "live") return true;
    const ch = channels.find((c) => channelKey(c) === p.key);
    return ch && ch.isLive && !ch.paused;
  });
  if (!items.length) return;
  const lines = items.map((p) => {
    if (p.kind === "live") {
      const ch = channels.find((c) => channelKey(c) === p.key);
      const since = ch?.liveSince || p.at;
      return `${p.handle} está ao vivo há ${fmtMin((now - since) / 60000)}`;
    }
    return `Novo vídeo de ${p.handle}${p.title ? ": " + p.title : ""}`;
  });
  const shown = lines.slice(0, 3);
  if (lines.length > 3) shown.push(`e mais ${lines.length - 3}`);
  const urls = items.map((p) => p.url).filter(Boolean);
  const anySound = items.some((p) => p.sound !== false);
  await showNotification(
    { sound: anySound },
    {
      title: items.length === 1 ? "Enquanto você estava fora" : `Enquanto você estava fora (${items.length})`,
      message: shown.join("\n"),
      contextMessage: items.length > 1 ? "Clique para abrir tudo" : "Clique para abrir",
      url: urls[0],
      urls: urls.slice(0, 6),
      priority: 2,
    }
  );
}

if (chrome.idle?.onStateChanged) {
  try {
    chrome.idle.setDetectionInterval(600);
  } catch (_) {}
  chrome.idle.onStateChanged.addListener((state) => {
    if (state === "active") flushAway().catch((e) => console.warn("Canais: resumo de ausência falhou", e?.message || e));
  });
}

async function checkPreAlerts(channels, now) {
  const targets = channels.filter((c) => c.preAlert && !c.isLive && !c.paused);
  if (!targets.length) return;
  const settings = await getSettings();
  if (isQuietNow(settings, new Date(now))) return;
  const { liveHistory = [], preAlerts = {} } = await chrome.storage.local.get(["liveHistory", "preAlerts"]);
  let changed = false;
  for (const ch of targets) {
    if (((ch.schedule && ch.schedule.items) || []).some((it) => Math.abs(it.start - now) < 3 * 3600000)) continue;
    const key = channelKey(ch);
    const habit = computeHabit(liveHistory.filter((s) => channelKey(s) === key), now);
    const diff = minutesUntilHabit(habit, now);
    if (diff === null || diff < 10 || diff > 15) continue;
    const today = dayKey(now);
    if (preAlerts[key] === today) continue;
    preAlerts[key] = today;
    changed = true;
    if (await isUserAway()) continue;
    await showNotification(ch, {
      title: `${ch.handle} costuma entrar em ~${Math.round(diff)} min`,
      message: `Normalmente começa por volta das ${habit.time}.`,
      url: channelPageUrl(ch),
    });
  }
  if (changed) await chrome.storage.local.set({ preAlerts });
}

function weekKey(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return dayKey(d.getTime());
}

async function checkWeeklySummary(now) {
  const settings = await getSettings();
  if (settings.weeklySummary === false) return;
  const d = new Date(now);
  if (d.getDay() !== 0) return;
  const { watchState = {}, summaryState = {} } = await chrome.storage.local.get(["watchState", "summaryState"]);
  const wk = weekKey(now);
  if (summaryState.lastWeek === wk) return;
  const hist = Array.isArray(watchState.hourHist) ? watchState.hourHist : [];
  const totalHist = hist.reduce((a, b) => a + (b || 0), 0);
  let prefHour = 20;
  if (totalHist >= 60) prefHour = hist.indexOf(Math.max(...hist));
  if (d.getHours() < prefHour) return;
  if (isQuietNow(settings, d)) return;
  if (await isUserAway()) return;

  const { watchLog = {}, liveHistory = [] } = await chrome.storage.local.get(["watchLog", "liveHistory"]);
  const days = [];
  for (let i = 0; i < 7; i++) days.push(dayKey(now - i * 86400000));
  let total = 0;
  const perKey = {};
  for (const [k, map] of Object.entries(watchLog)) {
    for (const day of days) {
      const v = map[day] || 0;
      total += v;
      if (!k.startsWith("remote:")) perKey[k] = (perKey[k] || 0) + v;
    }
  }
  await chrome.storage.local.set({ summaryState: { ...summaryState, lastWeek: wk } });
  if (total < 30) return;
  const top = Object.entries(perKey).sort((a, b) => b[1] - a[1])[0];
  const topName = top ? top[0].split(":").slice(1).join(":") : "";
  let best = null;
  const byKey = {};
  for (const s of liveHistory) (byKey[channelKey(s)] = byKey[channelKey(s)] || []).push(s);
  for (const [k, list] of Object.entries(byKey)) {
    const st = computeStreak(list, now);
    if (st.count >= 2 && (!best || st.count > best.count)) best = { key: k, count: st.count };
  }
  await showNotification(
    { sound: false },
    {
      title: "Sua semana no Seus Canais",
      message: `${fmtMin(total)} de live assistida${topName ? ` · mais visto: ${topName}` : ""}`,
      contextMessage: best ? `Sequência: ${best.count} lives seguidas de ${best.key.split(":").slice(1).join(":")}` : "",
      url: chrome.runtime.getURL("popup.html?full=1#history"),
    }
  );
}

const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

async function checkMonthlyRetro(now) {
  const d = new Date(now);
  if (d.getDate() > 3 || d.getHours() < 10) return;
  const settings = await getSettings();
  if (settings.weeklySummary === false) return;
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const id = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const { summaryState = {}, watchLog = {} } = await chrome.storage.local.get(["summaryState", "watchLog"]);
  if (summaryState.lastRetro === id) return;
  if (isQuietNow(settings, d) || (await isUserAway())) return;
  await chrome.storage.local.set({ summaryState: { ...summaryState, lastRetro: id } });
  const r = computeRetro({ watchLog }, prev.getTime(), new Date(d.getFullYear(), d.getMonth(), 1).getTime());
  if (r.total < 60) return;
  await showNotification(
    { sound: false },
    {
      title: `Sua retrospectiva de ${MONTH_NAMES[prev.getMonth()]} está pronta`,
      message: `${fmtMin(r.total)} de live${r.top[0] ? ` · mais visto: ${r.top[0].name}` : ""}`,
      contextMessage: "Clique pra ver e compartilhar",
      url: chrome.runtime.getURL(`popup.html?full=1#retro-${id}`),
      kind: "retro",
    }
  );
}

async function watchTick() {
  const now = Date.now();
  const { channels = [] } = await chrome.storage.local.get("channels");
  const live = channels.filter((c) => c.isLive && !c.paused);

  let watching = [];
  if (live.length) {
    let tabs = [];
    let minimized = new Set();
    try {
      tabs = await chrome.tabs.query({});
      const wins = await chrome.windows.getAll();
      minimized = new Set(wins.filter((w) => w.state === "minimized").map((w) => w.id));
    } catch (_) {}
    const counted = tabs.filter((t) => t.url && (t.audible || (t.active && !minimized.has(t.windowId))));
    watching = live.filter((ch) => counted.some((t) => tabMatchesChannel(t.url, ch)));
  }

  await withHistoryLock(async () => {
    const { watchState = {} } = await chrome.storage.local.get("watchState");
    const last = watchState.lastTick || 0;
    let elapsed = last ? (now - last) / 60000 : 1;
    if (!(elapsed > 0) || elapsed > 2.5) elapsed = 1;
    watchState.lastTick = now;
    if (watching.length) {
      const hist = Array.isArray(watchState.hourHist) && watchState.hourHist.length === 24 ? watchState.hourHist : new Array(24).fill(0);
      hist[new Date(now).getHours()] = Math.round((hist[new Date(now).getHours()] + elapsed) * 100) / 100;
      watchState.hourHist = hist;
    }
    await chrome.storage.local.set({ watchState });
    if (!watching.length) return;

    const { watchLog = {}, openSessions = {} } = await chrome.storage.local.get(["watchLog", "openSessions"]);
    const day = dayKey(now);
    for (const ch of watching) {
      const key = channelKey(ch);
      const days = (watchLog[key] = watchLog[key] || {});
      days[day] = Math.round(((days[day] || 0) + elapsed) * 100) / 100;
      if (!openSessions[key]) {
        openSessions[key] = {
          platform: ch.platform || "youtube",
          handle: ch.handle,
          start: ch.liveSince || now,
          lastSeen: now,
          title: ch.liveTitle || "",
          category: ch.liveCategory || "",
          watched: 0,
        };
      }
      openSessions[key].watched = Math.round((openSessions[key].watched + elapsed) * 100) / 100;
      if (!openSessions[key].firstWatchAt) openSessions[key].firstWatchAt = now;
      if (Number.isFinite(ch.liveViewers))
        openSessions[key].peakViewers = Math.max(openSessions[key].peakViewers || 0, ch.liveViewers);
    }
    await chrome.storage.local.set({ watchLog, openSessions });

    const { achState = {} } = await chrome.storage.local.get("achState");
    const d = new Date(now);
    const h = d.getHours();
    if (h >= 2 && h < 4) {
      achState.owlMin = achState.owlMin || {};
      achState.owlMin[day] = Math.round(((achState.owlMin[day] || 0) + elapsed) * 100) / 100;
    } else if (h >= 5 && h < 8) {
      achState.morningMin = achState.morningMin || {};
      achState.morningMin[day] = Math.round(((achState.morningMin[day] || 0) + elapsed) * 100) / 100;
    }
    for (const m of ["owlMin", "morningMin"]) {
      const keys = Object.keys(achState[m] || {}).sort();
      while (keys.length > 14) delete achState[m][keys.shift()];
    }
    if (d.getMonth() === 0 && d.getDate() === 1 && h === 0 && d.getMinutes() < 15) achState.virada = true;
    for (const ch of watching) {
      if (!Number.isFinite(ch.liveViewers)) continue;
      const peaks = (achState.peaks || {})[channelKey(ch)] || [];
      if (peaks.length >= 3 && ch.liveViewers > Math.max(...peaks)) achState.historic = true;
    }
    await chrome.storage.local.set({ achState });
  });

  try {
    await checkScheduleAlerts(now);
    await checkScheduleAutoOpen(now);
    checkSchedules(now).catch((e) => console.warn("Canais: agenda falhou", e?.message || e));
    checkForUpdate().catch(() => {});
  } catch (e) {
    console.warn("Canais: aviso de agenda falhou", e?.message || e);
  }
  try {
    await checkPreAlerts(channels, now);
    await checkWeeklySummary(now);
    await checkMonthlyRetro(now);
  } catch (e) {
    console.warn("Canais: lembretes falharam", e?.message || e);
  }
  if (new Date(now).getMinutes() % 15 === 7) syncNow().catch((e) => console.warn("Canais: sync falhou", e?.message || e));
  if (watching.length || new Date(now).getMinutes() % 15 === 0) {
    evaluateAchievements(now).catch((e) => console.warn("Canais: conquistas falharam", e?.message || e));
  }
}

async function handleMention(msg, sender) {
  const settings = await getSettings();
  if (settings.mentionAlerts === false || !settings.mentionNicks) return;
  if (isQuietNow(settings)) return;
  const tab = sender && sender.tab;
  if (!tab) return;
  try {
    const win = await chrome.windows.get(tab.windowId);
    if (tab.active && win.focused && !(await isUserAway())) return;
  } catch (_) {}
  const platform = ["youtube", "twitch", "kick"].includes(msg.platform) ? msg.platform : "youtube";
  let where = "";
  if (platform === "youtube" && msg.videoId) {
    const { channels = [] } = await chrome.storage.local.get("channels");
    const ch = channels.find((c) => c.liveVideoId === msg.videoId);
    if (ch) where = ch.handle;
  } else if (msg.handle) where = msg.handle;
  const label = platform === "twitch" ? "Twitch" : platform === "kick" ? "Kick" : "YouTube";
  const author = String(msg.author || "").slice(0, 40);
  const notifId = `streambell-${crypto.randomUUID()}`;
  const { notifMap = {} } = await chrome.storage.local.get("notifMap");
  pruneNotifMap(notifMap);
  notifMap[notifId] = { kind: "mention", at: Date.now(), tabId: tab.id, windowId: tab.windowId, url: tab.url };
  await chrome.storage.local.set({ notifMap });
  notifCreate(notifId, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: author ? `${author} te marcou no chat` : "Te marcaram no chat",
    message: String(msg.text || "").slice(0, 160) || " ",
    contextMessage: where ? `${where} · ${label}` : label,
    priority: 2,
  });
  await playNotificationSound();
}

const badgeSvgCache = new Map();
async function badgeSvgText(icon) {
  if (!/^[a-z0-9-]{1,40}$/.test(icon || "")) return "";
  if (badgeSvgCache.has(icon)) return badgeSvgCache.get(icon);
  try {
    const res = await fetch(chrome.runtime.getURL(`badges/${icon}.svg`));
    const text = res.ok ? await res.text() : "";
    badgeSvgCache.set(icon, text);
    return text;
  } catch (_) {
    return "";
  }
}

const TOAST_SITES = /^https:\/\/(www\.youtube\.com|www\.twitch\.tv|kick\.com)\//;

function mascotMarkup(settings, mood, size) {
  try {
    if (typeof currentMascot !== "function") return "";
    const m = currentMascot(settings || {}, { level: 999 });
    return m ? mascotSvg(m, mood, size) : "";
  } catch (_) {
    return "";
  }
}

async function sendPageCards(items, skipUrl) {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tabs.length) tabs = await chrome.tabs.query({ active: true });
  } catch (_) {
    return false;
  }
  const settings = await getSettings();
  for (const tab of tabs) {
    if (!tab.url || !TOAST_SITES.test(tab.url)) continue;
    if (skipUrl && skipUrl(tab.url)) continue;
    if (settings.island !== false && items.length === 1 && (items[0].kind === "live" || items[0].kind === "info")) {
      try {
        const it = items[0];
        const t = trItem(it);
        const res = await chrome.tabs.sendMessage(tab.id, { type: "ISLAND_FLASH", item: { kind: it.error ? "err" : it.kind, title: it.kind === "live" ? t.title : t.kicker + (t.title ? " · " + t.title : ""), desc: t.desc, url: it.url, button: t.button, lv: it.lv } });
        if (res && res.shown) return true;
      } catch (_) {}
    }
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: "SHOW_CARDS", items: items.map(trItem) });
      if (res && res.shown) return true;
    } catch (_) {}
  }
  return false;
}

async function showLiveToast(channel) {
  const settings = await getSettings();
  if (settings.pageLiveToast === false) return false;
  const desc = [channel.liveTitle, channel.liveCategory].filter(Boolean).join(" · ") || `Na ${platformLabelOf(channel)}`;
  return sendPageCards(
    [{ kind: "live", kicker: "Ao vivo agora", title: `${channel.handle} entrou ao vivo`, desc, url: channel.liveUrl, button: "Assistir", mascot: mascotMarkup(settings, "acenando", 60), lv: { handle: channel.handle, platform: channel.platform || "youtube", avatar: channel.avatarUrl || null } }],
    (url) => tabMatchesChannel(url, channel)
  );
}

async function showBadgeToast(items) {
  const settings = await getSettings();
  const side = mascotMarkup(settings, "festa", 44);
  const payload = await Promise.all(
    items.map(async (a) => trItem({ id: a.id, icon: a.icon, svg: a.svg || (await badgeSvgText(a.icon)), title: a.title, desc: a.desc, kicker: a.kicker || "", mascot: side }))
  );
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tabs.length) tabs = await chrome.tabs.query({ active: true });
  } catch (_) {
    return false;
  }
  for (const tab of tabs) {
    if (!tab.url || !TOAST_SITES.test(tab.url)) continue;
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: "SHOW_BADGES", items: payload });
      if (res && res.shown) return true;
    } catch (_) {}
  }
  return false;
}

let achLock = Promise.resolve();
function evaluateAchievements(now = Date.now()) {
  const run = achLock.then(() => evaluateAchievementsNow(now));
  achLock = run.catch(() => {});
  return run;
}

async function evaluateAchievementsNow(now = Date.now()) {
  const data = await chrome.storage.local.get(["watchLog", "liveHistory", "openSessions", "achState", "achievements", "settings"]);
  const achState = data.achState || {};
  if (!achState.installedAt) achState.installedAt = now;
  const list = computeAchievements({ ...data, achState }, now);
  const unlocked = data.achievements || {};
  let fresh = list.filter((a) => a.unlocked && !unlocked[a.id]);
  if (unlocked[PERK_ID] && !PERK) await openPerk();
  if (fresh.some((a) => a.id === PERK_ID)) {
    if (await openPerk()) fresh = fresh.map(perkify);
    else fresh = fresh.filter((a) => a.id !== PERK_ID);
  }
  for (const a of fresh) unlocked[a.id] = now;

  const ch = computeChallenges({ ...data, achState, achievements: unlocked }, now);
  const doneMap = (achState.challengesDone = achState.challengesDone || {});
  const doneNow = doneMap[ch.weekId] || [];
  const freshChallenges = ch.items.filter((c) => c.value >= c.target && !doneNow.includes(c.id));
  if (freshChallenges.length) doneMap[ch.weekId] = [...doneNow, ...freshChallenges.map((c) => c.id)];
  const weeks = Object.keys(doneMap).sort();
  while (weeks.length > 60) delete doneMap[weeks.shift()];

  const lvl = computeLevel({ ...data, achState, achievements: unlocked });
  const prevLevel = achState.lastLevel;
  achState.lastLevel = lvl.level;
  const leveledUp = prevLevel && lvl.level > prevLevel;

  await chrome.storage.local.set({ achievements: unlocked, achState });

  const freshIds = fresh.map((a) => a.id);
  const metal = ["lendaria-ouro", "lendaria-prata", "lendaria-bronze"].find((id) => freshIds.includes(id));
  if (metal || freshIds.includes(PERK_ID)) {
    const { settings: cur = {} } = await chrome.storage.local.get("settings");
    const patch = {};
    if (metal) {
      patch.accent = metal.replace("lendaria-", "");
      patch.frame = metal.replace("lendaria-", "");
    }
    if (freshIds.includes(PERK_ID)) {
      patch.fx = true;
      patch.accent = PERK_ID;
    }
    await chrome.storage.local.set({ settings: { ...cur, ...patch } });
  }

  const items = [
    ...fresh.map((a) => ({ id: a.id, icon: a.icon, title: a.title, desc: a.desc, svg: a.svg, kicker: a.kicker || (a.group === "lendarias" ? "Conquista lendária" : "") })),
    ...freshChallenges.map((c) => ({ id: "desafio-" + c.id, icon: "desafio", title: "Desafio concluído", desc: `${c.title} · +${XP_PER_CHALLENGE} XP`, kicker: "Desafio da semana" })),
  ];
  if (leveledUp) {
    const newRewards = [...ACCENTS, ...FRAME_REWARDS, ...(typeof MASCOTS !== "undefined" ? MASCOTS.filter((m) => m.level > 1).map((m) => ({ ...m, name: "mascote " + m.name })) : [])].filter((r) => r.level && r.level > prevLevel && r.level <= lvl.level).map((r) => r.name);
    items.push({
      id: "level-" + lvl.level,
      icon: "level",
      kicker: "Subiu de nível",
      title: `Nível ${lvl.level} · ${lvl.rank}`,
      desc: newRewards.length ? `Desbloqueou: ${newRewards.join(", ")}` : `Faltam ${Math.max(0, Math.ceil((lvl.next - lvl.xp) / 60))}h pro próximo`,
    });
  }
  if (!items.length) return [];

  const settings = { interval: 5, ...(data.settings || {}) };
  if (settings.achievementAlerts !== false && !isQuietNow(settings) && !(await isUserAway())) {
    const shown = await showBadgeToast(items);
    if (shown) {
      const { settings: cur = {} } = await chrome.storage.local.get("settings");
      await chrome.storage.local.set({ settings: { ...cur, achCelebratedAt: now } });
      return fresh.map((a) => a.id);
    }
    await showNotification(
      { sound: false },
      {
        title:
          items.length === 1
            ? items[0].kicker || "Conquista desbloqueada"
            : `${items.length} novidades no Seus Canais`,
        message: items.length === 1 ? `${items[0].title} · ${items[0].desc}` : items.slice(0, 4).map((a) => a.title).join(", "),
        url: chrome.runtime.getURL("popup.html?full=1#achievements"),
        kind: "achievement",
      }
    );
  }
  return fresh.map((a) => a.id);
}

function sessionSeen(ch, now = Date.now()) {
  return withHistoryLock(async () => {
    const { openSessions = {} } = await chrome.storage.local.get("openSessions");
    const key = channelKey(ch);
    const s = openSessions[key];
    if (s) {
      s.lastSeen = now;
      if (ch.liveVideoId) s.videoId = ch.liveVideoId;
      if (Number.isFinite(ch.liveViewers)) s.seenPeak = Math.max(s.seenPeak || 0, ch.liveViewers);
      if (ch.liveTitle) s.title = ch.liveTitle;
      if (ch.liveCategory) s.category = ch.liveCategory;
    } else {
      openSessions[key] = {
        platform: ch.platform || "youtube",
        handle: ch.handle,
        start: ch.liveSince || now,
        lastSeen: now,
        title: ch.liveTitle || "",
        category: ch.liveCategory || "",
        watched: 0,
      };
    }
    await chrome.storage.local.set({ openSessions });
  });
}

function sessionEnd(ch) {
  return withHistoryLock(async () => {
    const { openSessions = {}, liveHistory = [] } = await chrome.storage.local.get(["openSessions", "liveHistory"]);
    const key = channelKey(ch);
    const s = openSessions[key];
    if (!s) return;
    delete openSessions[key];
    liveHistory.unshift({
      platform: s.platform,
      handle: s.handle,
      start: s.start,
      end: s.lastSeen || Date.now(),
      title: s.title || "",
      category: s.category || "",
      watched: Math.round(s.watched || 0),
      firstWatchAt: s.firstWatchAt || null,
      peakViewers: s.peakViewers || null,
      videoId: s.videoId || ch.liveVideoId || null,
    });
    if (liveHistory.length > MAX_HISTORY) liveHistory.length = MAX_HISTORY;
    const { achState = {} } = await chrome.storage.local.get("achState");
    const peak = Math.max(s.peakViewers || 0, Number.isFinite(ch.liveViewers) ? ch.liveViewers : 0, s.seenPeak || 0);
    if (peak > 0) {
      achState.peaks = achState.peaks || {};
      const list = (achState.peaks[key] = achState.peaks[key] || []);
      list.push(peak);
      if (list.length > 20) list.shift();
    }
    await chrome.storage.local.set({ openSessions, liveHistory, achState });
    const ended = liveHistory[0];
    const dur = (ended.end - ended.start) / 60000;
    if ((ended.watched || 0) < 5 && dur >= 20) await recordMissedLive(ch, ended);
  });
}

function vodUrlFor(ch, session) {
  const pf = ch.platform || "youtube";
  const h = ch.handle.replace("@", "");
  if (pf === "youtube") return session.videoId ? `https://www.youtube.com/watch?v=${session.videoId}` : `https://www.youtube.com/@${h}/streams`;
  if (pf === "twitch") return `https://www.twitch.tv/${h.toLowerCase()}/videos?filter=archives`;
  return `https://kick.com/${h.toLowerCase()}/videos`;
}

async function recordMissedLive(ch, session) {
  const { missedLives = [], settings = {} } = await chrome.storage.local.get(["missedLives", "settings"]);
  const item = {
    key: channelKey(ch),
    platform: ch.platform || "youtube",
    handle: ch.handle,
    start: session.start,
    end: session.end,
    title: session.title || "",
    vodUrl: vodUrlFor(ch, session),
    at: Date.now(),
  };
  const list = [item, ...missedLives.filter((m) => !(m.key === item.key && m.start === item.start))].slice(0, 30);
  await chrome.storage.local.set({ missedLives: list });
  const mode = settings.missedAlerts || "favoritos";
  if (mode === "off" || (mode === "favoritos" && !ch.favorite) || ch.paused) return;
  if (isQuietNow({ interval: 5, ...settings }) || (await isUserAway())) return;
  const dur = Math.round((session.end - session.start) / 60000);
  await showNotification(
    { sound: false },
    {
      title: `Você perdeu a live de ${ch.handle}`,
      message: session.title || `Durou ${fmtMin(dur)}`,
      contextMessage: "Clique para ver a gravação",
      url: item.vodUrl,
      kind: "missed",
    }
  );
}

async function pruneHistory() {
  await withHistoryLock(async () => {
    const { watchLog = {} } = await chrome.storage.local.get("watchLog");
    const cutoff = dayKey(Date.now() - KEEP_DAYS * 86400000);
    let changed = false;
    for (const key of Object.keys(watchLog)) {
      for (const d of Object.keys(watchLog[key])) {
        if (d < cutoff) {
          delete watchLog[key][d];
          changed = true;
        }
      }
      if (!Object.keys(watchLog[key]).length) {
        delete watchLog[key];
        changed = true;
      }
    }
    if (changed) await chrome.storage.local.set({ watchLog });
  });
}

const SITE_PATTERNS = ["*://*.youtube.com/*", "*://*.twitch.tv/*", "*://kick.com/*", "*://*.kick.com/*"];

// Monta o menu do botão direito. Roda um de cada vez: se duas chamadas se cruzassem
// (instalar + trocar idioma), o Chrome reclamava de item duplicado.
let menuChain = Promise.resolve();
function setupContextMenus() {
  menuChain = menuChain.then(buildContextMenus).catch((e) => console.warn("Canais: menu de contexto indisponível", e?.message || e));
  return menuChain;
}
async function buildContextMenus() {
  if (!chrome.contextMenus) return;
  await new Promise((r) =>
    chrome.contextMenus.removeAll(() => {
      void chrome.runtime.lastError;
      r();
    })
  );
  const items = [
    { id: "canais-add-page", title: tl("Adicionar este canal ao Seus Canais"), contexts: ["page"], documentUrlPatterns: SITE_PATTERNS },
    { id: "canais-mark-moment", title: tl("Marcar momento desta live"), contexts: ["page", "video"], documentUrlPatterns: SITE_PATTERNS },
    { id: "canais-add-link", title: tl("Adicionar canal do link ao Seus Canais"), contexts: ["link"], targetUrlPatterns: SITE_PATTERNS },
  ];
  for (const it of items) {
    await new Promise((r) =>
      chrome.contextMenus.create(it, () => {
        void chrome.runtime.lastError;
        r();
      })
    );
  }
}

// Repositório oficial: usado pro aviso de versão nova, pro "Reportar problema" e pra página de desinstalar.
const OFFICIAL_REPO = "lourenzii/seus-canais";

const UNINSTALL_FEEDBACK_URL =
  `https://github.com/${OFFICIAL_REPO}/issues/new?title=` +
  encodeURIComponent("Desinstalei o Seus Canais") +
  "&body=" +
  encodeURIComponent("Conta rapidinho por que você desinstalou (opcional):\n\n- [ ] Não funcionou direito\n- [ ] Notificações demais\n- [ ] Não uso mais\n- [ ] Outro motivo:\n");

function setupUninstallPage() {
  try {
    if (UNINSTALL_FEEDBACK_URL) chrome.runtime.setUninstallURL(UNINSTALL_FEEDBACK_URL);
  } catch (_) {}
}

chrome.runtime.onInstalled.addListener((details) => {
  updateAlarm();
  syncNow().catch(() => {});
  setupContextMenus();
  setupUninstallPage();
  pruneHistory().catch(() => {});
  if (details && details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("popup.html?full=1#welcome") }).catch(() => {});
  }
  injectIntoOpenTabs().catch(() => {});
  if (details && details.reason === "update") {
    // depois de atualizar, busca a agenda de novo (o jeito de ler pode ter mudado)
    chrome.storage.local
      .get("channels")
      .then(({ channels = [] }) => chrome.storage.local.set({ channels: channels.map((c) => (c.schedule ? { ...c, schedule: { ...c.schedule, at: 0 } } : c)) }))
      .then(() => checkSchedules())
      .catch(() => {});
  }
});

// Abas que já estavam abertas antes de instalar/atualizar não recebem os scripts sozinhas.
async function injectIntoOpenTabs() {
  if (!chrome.scripting) return;
  const scripts = (chrome.runtime.getManifest().content_scripts || []).filter((cs) => !cs.all_frames);
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: ["https://www.youtube.com/*", "https://www.twitch.tv/*", "https://kick.com/*"] });
  } catch (_) {
    return;
  }
  for (const tab of tabs) {
    if (tab.discarded || !tab.url) continue;
    const files = [];
    for (const cs of scripts) {
      if (cs.matches.some((m) => new RegExp("^" + m.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$").test(tab.url))) files.push(...cs.js);
    }
    if (!files.length) continue;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [...new Set(files)] });
    } catch (_) {}
  }
}

async function resolveChannelFromUrl(url) {
  const parsed = parseChannelUrl(url);
  if (!parsed) return { error: "isso não parece a página de um canal do YouTube, Twitch ou Kick" };
  if (!parsed.needsResolve) return { platform: parsed.platform, handle: parsed.handle };
  const wd = new AbortController();
  const timer = setTimeout(() => wd.abort(), WATCHDOG_MS);
  try {
    const html = await fetchText(parsed.url, { signal: wd.signal });
    const handle = findYoutubeHandleInHtml(html);
    if (!handle) return { error: "não achei o @ do canal nessa página" };
    return { platform: "youtube", handle };
  } catch (e) {
    return { error: String(e?.message || e).slice(0, 120) };
  } finally {
    clearTimeout(timer);
  }
}

async function addChannelFromUrl(url) {
  const r = await resolveChannelFromUrl(url);
  if (r.error) return { status: "error", error: r.error };
  const { channels = [] } = await chrome.storage.local.get("channels");
  const sameHandle = (c) =>
    (c.platform || "youtube") === r.platform && c.handle.toLowerCase() === r.handle.toLowerCase();
  if (channels.some(sameHandle)) return { status: "exists", ...r };
  const ch = {
    platform: r.platform,
    handle: r.handle,
    notify: true,
    autoOpen: false,
    paused: false,
    sound: true,
    notifyChanges: false,
    keywords: "",
    favorite: false,
    isLive: false,
    lastChecked: null,
    notifyVideos: false,
    autoOpenVideos: false,
  };
  channels.push(ch);
  await chrome.storage.local.set({ channels });
  checkChannel(ch, false, { silent: true })
    .then(updateBadge)
    .catch(() => {});
  return { status: "added", ...r };
}

function infoNotification(title, message) {
  try {
    notifCreate(`canais-info-${crypto.randomUUID()}`, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title,
      message: message || " ",
      priority: 0,
    });
  } catch (_) {}
}

if (chrome.contextMenus?.onClicked) {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "canais-mark-moment") {
      const r = await markMoment(tab, "menu");
      if (r && r.error) infoNotification("Não deu pra marcar", r.error);
      return;
    }
    const url = info.menuItemId === "canais-add-link" ? info.linkUrl : info.pageUrl || tab?.url;
    if (!url) return;
    const res = await addChannelFromUrl(url);
    if (res.status === "added") infoNotification("Canal adicionado", `${res.handle} agora está na sua lista.`);
    else if (res.status === "exists") infoNotification("Já está na lista", `${res.handle} já está na sua lista.`);
    else infoNotification("Não deu pra adicionar", res.error);
  });
}

async function openAllLive() {
  const { channels = [] } = await chrome.storage.local.get("channels");
  const live = channels.filter((c) => c.isLive && !c.paused && c.liveUrl);
  let opened = 0;
  let skipped = 0;
  for (const ch of live.slice(0, 12)) {
    if (await isChannelTabOpen(ch)) {
      skipped++;
      continue;
    }
    await openTab(ch.liveUrl, opened === 0);
    opened++;
  }
  return { opened, skipped, total: live.length };
}

(async () => {
  const { channels = [] } = await chrome.storage.local.get("channels");
  if (channels.some((c) => c.checkingSince)) {
    channels.forEach((c) => (c.checkingSince = null));
    await chrome.storage.local.set({ channels });
  }
  try {
    if (!(await chrome.alarms.get(WATCH_ALARM))) chrome.alarms.create(WATCH_ALARM, { periodInMinutes: 1 });
  } catch (_) {}
  try {
    const { achState = {} } = await chrome.storage.local.get("achState");
    if (!achState.installedAt) {
      achState.installedAt = Date.now();
      await chrome.storage.local.set({ achState });
    }
  } catch (_) {}
})();

self.addEventListener("online", () => {
  setTimeout(() => checkAllChannels().catch(() => {}), 5000);
});
chrome.runtime.onStartup.addListener(() => {
  updateAlarm();
  syncNow().catch(() => {});
  setupContextMenus();
  setupUninstallPage();
  pruneHistory().catch(() => {});
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkAllChannels();
    return;
  }
  if (alarm.name === WATCH_ALARM) {
    watchTick().catch((e) => console.warn("Canais: contagem de tempo assistido falhou", e?.message || e));
    return;
  }
  if (alarm.name.startsWith("recheck|")) {
    const [, platform, handle] = alarm.name.split("|");
    const { channels = [] } = await chrome.storage.local.get("channels");
    const ch = channels.find((c) => c.handle === handle && (c.platform || "youtube") === platform);
    if (ch && !ch.paused) checkChannel(ch).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "CHECK_NOW") {
    checkAllChannels(true)
      .catch((e) => console.error("Canais: CHECK_NOW falhou", e))
      .finally(() => sendResponse({ done: true }));
    return true;
  }
  if (msg?.type === "RESET") {
    resetExtension()
      .catch((e) => console.error("Canais: reset falhou", e))
      .finally(() => sendResponse({ done: true }));
    return true;
  }
  if (msg?.type === "UPDATE_ALARM") {
    updateAlarm().finally(() => sendResponse({ done: true }));
    return true;
  }
  if (msg?.type === "CHAT_SENT") {
    (async () => {
      const { settings = {} } = await chrome.storage.local.get("settings");
      if (settings.countChat === false) return;
      const platform = ["youtube", "twitch", "kick"].includes(msg.platform) ? msg.platform : null;
      if (!platform) return;
      let key = null;
      const { channels = [], achState = {} } = await chrome.storage.local.get(["channels", "achState"]);
      if (platform === "youtube" && msg.videoId) {
        const ch = channels.find((c) => (c.platform || "youtube") === "youtube" && c.liveVideoId === msg.videoId);
        if (ch) key = channelKey(ch);
      } else if (msg.handle && /^[a-z0-9_-]{2,30}$/i.test(msg.handle)) {
        const ch = channels.find((c) => c.platform === platform && c.handle.toLowerCase() === msg.handle.toLowerCase());
        key = ch ? channelKey(ch) : `${platform}:${msg.handle.toLowerCase()}`;
      }
      const m = (achState.messages = achState.messages || { total: 0, perKey: {} });
      m.total = (m.total || 0) + 1;
      if (key) m.perKey[key] = (m.perKey[key] || 0) + 1;
      const today = dayKey(Date.now());
      const byDay = (achState.messagesByDay = achState.messagesByDay || {});
      byDay[today] = (byDay[today] || 0) + 1;
      const dk = Object.keys(byDay).sort();
      while (dk.length > 21) delete byDay[dk.shift()];
      await chrome.storage.local.set({ achState });
      await evaluateAchievements();
    })().catch(() => {});
    return false;
  }
  if (msg?.type === "LIKE_LIVE") {
    (async () => {
      const id = String(msg.videoId || "");
      if (!/^[\w-]{11}$/.test(id)) return;
      const { settings = {}, channels = [] } = await chrome.storage.local.get(["settings", "channels"]);
      if (settings.countLikes === false) return;
      const isChannelLive = channels.some((c) => c.isLive && c.liveVideoId === id);
      if (msg.live === false && !isChannelLive) return;
      const { achState = {} } = await chrome.storage.local.get("achState");
      const list = (achState.likedLives = achState.likedLives || []);
      if (list.includes(id)) return;
      list.push(id);
      if (list.length > 1000) list.splice(0, list.length - 1000);
      await chrome.storage.local.set({ achState });
      await evaluateAchievements();
    })().catch(() => {});
    return false;
  }
  if (msg?.type === "TILE_LIVES") {
    tileLives(Array.isArray(msg.urls) ? msg.urls : [])
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === "MARK_MOMENT") {
    (async () => {
      let tab = null;
      try {
        [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tab && tab.url && tab.url.startsWith("chrome-extension://")) [tab] = (await chrome.tabs.query({ active: true })).filter((x) => !x.url.startsWith("chrome-extension://"));
      } catch (_) {}
      return markMoment(tab, "popup");
    })()
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === "CLIP_HERE" || msg?.type === "CLIP") {
    (async () => {
      let tab = sender && sender.tab;
      if (!tab) {
        try {
          [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          if (tab && tab.url && tab.url.startsWith("chrome-extension://")) [tab] = (await chrome.tabs.query({ active: true })).filter((x) => !x.url.startsWith("chrome-extension://"));
        } catch (_) {}
      }
      return clipTab(tab, sender && sender.tab ? "ilha" : "popup");
    })()
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === "CHECK_UPDATE") {
    checkForUpdate(true)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === "GET_ISLAND") {
    islandData(msg.url || (sender && sender.tab && sender.tab.url) || "")
      .then((r) => sendResponse(r))
      .catch(() => sendResponse({ enabled: false }));
    return true;
  }
  if (msg?.type === "FOCUS_QUALITY") {
    focusQuality(sender && sender.tab, !!msg.restore)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, reason: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === "FOCUS_CHAT") {
    focusChat(sender && sender.tab, msg.url)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, reason: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === "ISLAND_HIDE") {
    patchSettingsBg({ island: false }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === "MARK_MOMENT_HERE") {
    markMoment(sender && sender.tab, "ilha")
      .then(async (r) => {
        if (r && r.error) await sendPageCards([{ kind: "info", kicker: "Momento", title: "Não deu pra marcar", desc: r.error }]).catch(() => {});
        sendResponse(r);
      })
      .catch((e) => sendResponse({ error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === "OPEN_WATCH_TOGETHER") {
    chrome.tabs.create({ url: chrome.runtime.getURL("popup.html?full=1#juntas") }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.type === "SYNC_NOW") {
    syncNow()
      .then(async (r) => {
        const { syncState = {} } = await chrome.storage.local.get("syncState");
        sendResponse({ ok: true, syncState, r });
      })
      .catch((e) => sendResponse({ error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === "OPEN_URL") {
    if (typeof msg.url === "string" && /^https:\/\/(www\.youtube\.com|www\.twitch\.tv|kick\.com)\//.test(msg.url)) openTab(msg.url);
    return false;
  }
  if (msg?.type === "CHAT_MENTION") {
    handleMention(msg, sender).catch(() => {});
    return false;
  }
  if (msg?.type === "IMPORT_CHANNELS") {
    (async () => {
      const list = Array.isArray(msg.channels) ? msg.channels.slice(0, 500) : [];
      const { channels = [] } = await chrome.storage.local.get("channels");
      const exists = new Set(channels.map((c) => ((c.platform || "youtube") + ":" + c.handle).toLowerCase()));
      let added = 0;
      for (const c of list) {
        if (!c || typeof c !== "object") continue;
        const platform = ["youtube", "twitch", "kick"].includes(c.platform) ? c.platform : null;
        let handle = typeof c.handle === "string" ? c.handle.trim().slice(0, 100) : "";
        if (!platform || !handle) continue;
        if (platform === "youtube" && !handle.startsWith("@")) handle = "@" + handle;
        if (platform !== "youtube") handle = handle.replace(/^@/, "").toLowerCase();
        const id = (platform + ":" + handle).toLowerCase();
        if (exists.has(id)) continue;
        exists.add(id);
        const avatarUrl = typeof c.avatar === "string" && /^https:\/\/[\w.-]+\.(ggpht\.com|googleusercontent\.com|ytimg\.com|jtvnw\.net|kick\.com)\//.test(c.avatar) ? c.avatar.slice(0, 500) : null;
        channels.push({
          ...(avatarUrl ? { avatarUrl } : {}),
          platform,
          handle,
          notify: true,
          autoOpen: false,
          paused: false,
          sound: true,
          notifyChanges: false,
          keywords: "",
          favorite: false,
          isLive: false,
          lastChecked: null,
          notifyVideos: false,
          autoOpenVideos: false,
        });
        added++;
      }
      await chrome.storage.local.set({ channels });
      sendResponse({ added, skipped: list.length - added });
      if (added) checkAllChannels(false, { silent: true }).catch(() => {});
    })().catch((e) => sendResponse({ error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === "TEST_TOAST") {
    showBadgeToast([{ id: "total-1", icon: msg.icon || "total-1", title: msg.title || "10 horas", desc: msg.desc || "Tempo total de live assistida" }])
      .then((shown) => sendResponse({ shown }))
      .catch(() => sendResponse({ shown: false }));
    return true;
  }
  if (msg?.type === "EVAL_ACHIEVEMENTS") {
    evaluateAchievements()
      .then((ids) => sendResponse({ ids }))
      .catch((e) => sendResponse({ error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === "RESOLVE_URL") {
    resolveChannelFromUrl(msg.url)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === "ADD_FROM_URL") {
    addChannelFromUrl(msg.url)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ status: "error", error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === "OPEN_ALL_LIVE") {
    openAllLive()
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === "CLEAR_HISTORY") {
    withHistoryLock(async () => {
      if (msg.key) {
        const { watchLog = {}, liveHistory = [] } = await chrome.storage.local.get(["watchLog", "liveHistory"]);
        delete watchLog[msg.key];
        const rest = liveHistory.filter((s) => channelKey(s) !== msg.key);
        await chrome.storage.local.set({ watchLog, liveHistory: rest });
      } else {
        await chrome.storage.local.set({ watchLog: {}, liveHistory: [] });
      }
    }).finally(() => sendResponse({ done: true }));
    return true;
  }
  if (msg?.type === "IMPORT_HISTORY") {
    withHistoryLock(async () => {
      const { watchLog = {}, liveHistory = [] } = await chrome.storage.local.get(["watchLog", "liveHistory"]);
      const inLog = msg.watchLog && typeof msg.watchLog === "object" ? msg.watchLog : {};
      for (const key of Object.keys(inLog)) {
        if (key.startsWith("remote:")) continue;
        const days = inLog[key];
        if (!days || typeof days !== "object") continue;
        const mine = (watchLog[key] = watchLog[key] || {});
        for (const d of Object.keys(days)) {
          const v = Number(days[d]);
          if (/^\d{4}-\d{2}-\d{2}$/.test(d) && v > 0) mine[d] = Math.max(mine[d] || 0, Math.min(v, 1440));
        }
      }
      const seen = new Set(liveHistory.map((s) => channelKey(s) + "|" + s.start));
      for (const s of Array.isArray(msg.liveHistory) ? msg.liveHistory : []) {
        if (!s || !s.handle || !s.start) continue;
        const id = channelKey(s) + "|" + s.start;
        if (seen.has(id)) continue;
        seen.add(id);
        liveHistory.push({
          platform: s.platform || "youtube",
          handle: String(s.handle),
          start: Number(s.start),
          end: Number(s.end) || Number(s.start),
          title: String(s.title || ""),
          category: String(s.category || ""),
          watched: Math.max(0, Math.round(Number(s.watched) || 0)),
        });
      }
      liveHistory.sort((a, b) => b.start - a.start);
      if (liveHistory.length > MAX_HISTORY) liveHistory.length = MAX_HISTORY;
      const { achievements = {}, achState = {} } = await chrome.storage.local.get(["achievements", "achState"]);
      if (msg.achievements && typeof msg.achievements === "object") {
        for (const [id, ts] of Object.entries(msg.achievements)) {
          const t = Number(ts);
          if (/^[a-z0-9-]{2,30}$/.test(id) && t > 0) achievements[id] = achievements[id] ? Math.min(achievements[id], t) : t;
        }
      }
      const inAch = msg.achState && typeof msg.achState === "object" ? msg.achState : {};
      const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      if (inAch.installedAt) achState.installedAt = Math.min(achState.installedAt || Infinity, num(inAch.installedAt)) || achState.installedAt;
      achState.videoOpens = Math.max(num(achState.videoOpens), num(inAch.videoOpens));
      achState.quickOpens = Math.max(num(achState.quickOpens), num(inAch.quickOpens));
      if (inAch.virada) achState.virada = true;
      if (inAch.historic) achState.historic = true;
      if (inAch.messages) {
        const m = (achState.messages = achState.messages || { total: 0, perKey: {} });
        m.total = Math.max(num(m.total), num(inAch.messages.total));
      }
      await chrome.storage.local.set({ watchLog, liveHistory, achievements, achState });
    })
      .then(() => evaluateAchievements().catch(() => {}))
      .finally(() => sendResponse({ done: true }));
    return true;
  }
  if (msg?.type === "CHECK_ONE") {
    (async () => {
      try {
        const { channels = [] } = await chrome.storage.local.get("channels");
        const ch = channels.find(
          (c) => c.handle === msg.handle && (c.platform || "youtube") === (msg.platform || "youtube")
        );
        if (ch) {
          await checkChannel(ch, true);
          await updateBadge();
        }
      } catch (e) {
        console.error("Canais: CHECK_ONE falhou", e);
      }
      sendResponse({ done: true });
    })();
    return true;
  }
});

async function updateBadge() {
  const { channels = [] } = await chrome.storage.local.get("channels");
  const liveCount = channels.filter((c) => c.isLive && !c.paused).length;
  await chrome.action.setBadgeText({ text: liveCount > 0 ? String(liveCount) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#8b5cf6" });
}

const FETCH_TIMEOUT_MS = 10000;
const WATCHDOG_MS = 20000;

function watchdogError() {
  const e = new Error(`verificação passou de ${WATCHDOG_MS / 1000}s`);
  e.isWatchdog = true;
  return e;
}

async function fetchOnce(url, options = {}) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const { signal: watchdog, ...rest } = options;
  if (watchdog?.aborted) throw watchdogError();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const onWatchdog = () => controller.abort();
  watchdog?.addEventListener("abort", onWatchdog);
  try {
    const res = await fetch(url, { ...rest, signal: controller.signal });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    if (watchdog?.aborted) throw watchdogError();
    const e = new Error(
      err?.name === "AbortError"
        ? `${host} não respondeu em ${FETCH_TIMEOUT_MS / 1000}s`
        : `sem resposta de ${host} (${err?.message || err})`
    );
    e.isNetworkError = true;
    throw e;
  } finally {
    clearTimeout(timer);
    watchdog?.removeEventListener("abort", onWatchdog);
  }
}

async function safeFetch(url, options) {
  try {
    return await fetchOnce(url, options);
  } catch (err) {
    if (!err.isNetworkError || err.isWatchdog) throw err;
    await new Promise((r) => setTimeout(r, 2000));
    if (options?.signal?.aborted) throw watchdogError();
    return fetchOnce(url, options);
  }
}

async function fetchText(url, options) {
  const res = await safeFetch(url, options);
  if (!res.ok) {
    const e = new Error(`HTTP ${res.status} em ${new URL(url).hostname}`);
    e.status = res.status;
    throw e;
  }
  return res.body;
}

function startKeepAlive() {
  const id = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
  return () => clearInterval(id);
}

async function fetchYoutubeChannelInfo(handle, signal) {
  const cleanHandle = handle.startsWith("@") ? handle : `@${handle}`;
  const html = await fetchText(`https://www.youtube.com/${cleanHandle}`, { signal });

  const idMatch =
    html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/) ||
    html.match(/"externalId"\s*:\s*"(UC[\w-]{22})"/) ||
    html.match(/<meta itemprop="identifier" content="(UC[\w-]{22})"/) ||
    html.match(/"channelId"\s*:\s*"(UC[\w-]{22})"/);

  const avatarMatch =
    html.match(/<meta property="og:image" content="([^"]+)"/) ||
    html.match(/"avatar"\s*:\s*\{\s*"thumbnails"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]+)"/);

  return {
    channelId: idMatch ? idMatch[1] : null,
    avatarUrl: avatarMatch ? avatarMatch[1].replace(/&amp;/g, "&") : null,
  };
}

function decodeXml(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fetchLatestVideoFromRss(channelId, signal) {
  const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, { signal });
  const entryMatch = xml.match(/<entry>[\s\S]*?<\/entry>/);
  if (!entryMatch) return null;

  const entry = entryMatch[0];
  const idMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
  const titleMatch = entry.match(/<title>([^<]*)<\/title>/);
  if (!idMatch) return null;

  return {
    videoId: idMatch[1],
    url: `https://www.youtube.com/watch?v=${idMatch[1]}`,
    title: titleMatch ? decodeXml(titleMatch[1]) : "",
  };
}

async function fetchLatestVideoFromPage(channelId, signal) {
  const html = await fetchText(`https://www.youtube.com/channel/${channelId}/videos`, { signal });
  const idMatch = html.match(/"videoId"\s*:\s*"([\w-]{11})"/);
  if (!idMatch) return null;
  return {
    videoId: idMatch[1],
    url: `https://www.youtube.com/watch?v=${idMatch[1]}`,
    title: "",
  };
}

async function fetchLatestVideo(channelId, signal) {
  try {
    const v = await fetchLatestVideoFromRss(channelId, signal);
    if (v) return v;
  } catch (err) {
    if (err.isWatchdog) throw err;
    console.warn("Canais: feed RSS falhou, usando página de vídeos", err.message);
  }
  return fetchLatestVideoFromPage(channelId, signal);
}

async function checkNewVideo(channelConfig, gen, signal) {
  if ((channelConfig.platform || "youtube") !== "youtube") return;
  if (!channelConfig.notifyVideos && !channelConfig.autoOpenVideos) return;

  try {
    let channelId = channelConfig.channelId;
    if (!channelId) {
      const info = await fetchYoutubeChannelInfo(channelConfig.handle, signal);
      channelId = info.channelId;
      if (!channelId) throw new Error("não achei o ID do canal na página");
    }

    const latest = await fetchLatestVideo(channelId, signal);

    const { channels = [] } = await chrome.storage.local.get("channels");
    const idx = channels.findIndex(
      (c) => c.handle === channelConfig.handle && (c.platform || "youtube") === "youtube"
    );
    if (idx === -1) return;

    if (gen !== undefined && gen !== resetGeneration) return;

    channels[idx].channelId = channelId;
    channels[idx].videoError = null;

    if (latest) {
      const isFirstRun = !channels[idx].lastVideoId;
      const isNew = !isFirstRun && channels[idx].lastVideoId !== latest.videoId;

      channels[idx].lastVideoId = latest.videoId;
      channels[idx].lastVideoUrl = latest.url;
      if (latest.title) channels[idx].lastVideoTitle = latest.title;

      await chrome.storage.local.set({ channels });

      const isTheCurrentLive = channels[idx].isLive && channels[idx].liveVideoId === latest.videoId;
      if (isNew && !isTheCurrentLive) {
        await onNewVideo(channels[idx], latest.title);
      }
    } else {
      await chrome.storage.local.set({ channels });
    }
  } catch (err) {
    if (err.isWatchdog) throw err;
    console.warn(`Canais: erro ao checar vídeos de ${channelConfig.handle}`, err.message);
    await patchChannel(channelConfig, { videoError: String(err.message || err).slice(0, 160) }, gen);
  }
}

async function onNewVideo(channel, title) {
  const settings = await getSettings();
  if (isQuietNow(settings)) return;
  if (settings.holdWhenAway !== false && (await isUserAway())) {
    if (channel.notifyVideos || channel.autoOpenVideos)
      await queueAway({ kind: "video", key: channelKey(channel) + "|" + channel.lastVideoId, handle: channel.handle, url: channel.lastVideoUrl, title, sound: channel.sound });
    return;
  }
  if (channel.notifyVideos) {
    await showNotification(channel, {
      title: `Novo vídeo de ${channel.handle}`,
      message: title || "Clique para assistir",
      url: channel.lastVideoUrl,
      kind: "video",
    });
  }
  if (channel.autoOpenVideos && channel.lastVideoUrl) {
    await openTab(channel.lastVideoUrl);
  }
}

async function patchChannel(channelConfig, fields, gen) {
  if (gen !== undefined && gen !== resetGeneration) return;
  const { channels = [] } = await chrome.storage.local.get("channels");
  const idx = channels.findIndex(
    (c) =>
      c.handle === channelConfig.handle &&
      (c.platform || "youtube") === (channelConfig.platform || "youtube")
  );
  if (idx === -1) return;
  Object.assign(channels[idx], fields);
  await chrome.storage.local.set({ channels });
}

const inProgress = new Map();

let resetGeneration = 0;

async function checkChannel(channelConfig, isManualCheck = false, { silent = false } = {}) {
  const platform = channelConfig.platform || "youtube";
  const key = platform + ":" + channelConfig.handle;
  const gen = resetGeneration;
  if (inProgress.get(key) === gen) return;
  inProgress.set(key, gen);
  const stopKeepAlive = startKeepAlive();
  await patchChannel(channelConfig, { checkingSince: Date.now() }, gen);
  try {

    let stuck = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (gen !== resetGeneration) break;
      const wd = new AbortController();
      const timer = setTimeout(() => wd.abort(), WATCHDOG_MS);
      try {
        await doCheckChannel(channelConfig, isManualCheck, platform, gen, silent, wd.signal);
        stuck = null;
        break;
      } catch (err) {
        if (!err.isWatchdog) throw err;
        stuck = err;
        console.warn(`Canais: verificação de ${channelConfig.handle} travou (tentativa ${attempt}), refazendo`);
      } finally {
        clearTimeout(timer);
      }
    }
    if (stuck) {
      await patchChannel(
        channelConfig,
        {
          lastError: `travou 2x (mais de ${WATCHDOG_MS / 1000}s cada) — tenta de novo no próximo ciclo`,
          lastChecked: Date.now(),
        },
        gen
      );
    }
  } finally {
    if (inProgress.get(key) === gen) inProgress.delete(key);
    stopKeepAlive();
    await patchChannel(channelConfig, { checkingSince: null }, gen);
  }
}

function parseTwitchLd(html) {
  const out = { title: "", startedAt: null };
  const blocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  for (const b of blocks) {
    try {
      const json = JSON.parse(b.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, ""));
      const nodes = [];
      const walk = (n) => {
        if (!n || typeof n !== "object") return;
        if (Array.isArray(n)) return n.forEach(walk);
        nodes.push(n);
        if (n["@graph"]) walk(n["@graph"]);
      };
      walk(json);
      const video = nodes.find((n) => n["@type"] === "VideoObject" && n.publication);
      if (video) {
        const pub = Array.isArray(video.publication) ? video.publication[0] : video.publication;
        out.title = String(video.description || "").trim();
        const t = Date.parse(pub?.startDate || "");
        if (!isNaN(t)) out.startedAt = t;
        return out;
      }
    } catch (_) {}
  }
  return out;
}

function plausibleStart(ts) {
  return ts && ts <= Date.now() + 60000 && Date.now() - ts < 3 * 86400000 ? ts : null;
}

async function doCheckChannel(channelConfig, isManualCheck, platform, gen, silent, signal) {
  try {
    let isLive = false;
    let liveUrl = "";
    let liveVideoId = null;
    let detectedAvatarUrl = null;
    let liveTitle = "";
    let liveCategory = "";
    let liveViewers = null;
    let startedAt = null;
    let upcomingHere = null;

    if (platform === "twitch") {
      const cleanHandle = channelConfig.handle.replace("@", "").trim().toLowerCase();
      liveUrl = `https://www.twitch.tv/${cleanHandle}`;
      const html = await fetchText(liveUrl, { redirect: "follow", signal });

      isLive = /"isLiveBroadcast"\s*:\s*true/.test(html);
      if (isLive) {
        const ld = parseTwitchLd(html);
        liveTitle = ld.title;
        startedAt = plausibleStart(ld.startedAt);
      }

      const avatarMatch = html.match(
        /https:\/\/static-cdn\.jtvnw\.net\/jtv_user_pictures\/[a-zA-Z0-9\-_/.]+\.(?:png|jpe?g)/
      );
      if (avatarMatch) detectedAvatarUrl = avatarMatch[0];
    } else if (platform === "kick") {
      const cleanHandle = channelConfig.handle.replace("@", "").trim().toLowerCase();
      liveUrl = `https://kick.com/${cleanHandle}`;

      const apiRes = await safeFetch(`https://kick.com/api/v1/channels/${cleanHandle}`, {
        headers: { Accept: "application/json" },
        signal,
      });
      if (!apiRes.ok) {
        throw new Error(`Kick respondeu ${apiRes.status} (pode ser bloqueio da Cloudflare)`);
      }
      const data = JSON.parse(apiRes.body);

      isLive = !!(data && data.livestream);
      const apiAvatar = data?.user?.profile_pic || data?.profile_picture || null;
      if (apiAvatar) detectedAvatarUrl = apiAvatar;
      if (isLive) {
        const ls = data.livestream;
        liveTitle = String(ls.session_title || "").trim();
        liveCategory = String(ls.categories?.[0]?.name || ls.category?.name || "").trim();
        if (Number.isFinite(ls.viewer_count)) liveViewers = ls.viewer_count;
        const raw = String(ls.start_time || ls.created_at || "");
        const t = Date.parse(/Z|[+-]\d\d:?\d\d$/.test(raw) ? raw : raw.replace(" ", "T") + "Z");
        startedAt = plausibleStart(isNaN(t) ? null : t);
      }
    } else {
      const cleanHandle = channelConfig.handle.startsWith("@") ? channelConfig.handle : `@${channelConfig.handle}`;
      liveUrl = `https://www.youtube.com/${cleanHandle}/live`;
      const html = await fetchText(liveUrl, { redirect: "follow", signal });

      const yt = youtubeLiveState(html);
      isLive = yt.live;
      if (yt.upcoming) upcomingHere = yt.upcoming;
      if (isLive) {
        const vid = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/);
        if (vid) liveVideoId = vid[1];
        const t =
          html.match(/<meta name="title" content="([^"]*)"/) || html.match(/<meta property="og:title" content="([^"]*)"/);
        if (t) liveTitle = decodeHtml(t[1]).trim();
        const cat = html.match(/"category"\s*:\s*"([^"]{1,60})"/);
        if (cat) liveCategory = cat[1];
        const st = html.match(/"startTimestamp"\s*:\s*"([^"]+)"/);
        if (st) startedAt = plausibleStart(Date.parse(st[1]) || null);
      }
    }

    const { channels = [] } = await chrome.storage.local.get("channels");
    const idx = channels.findIndex(
      (c) => c.handle === channelConfig.handle && (c.platform || "youtube") === platform
    );
    if (idx === -1) return;

    const ch = channels[idx];
    const wasLive = !!ch.isLive;
    ch.lastChecked = Date.now();
    ch.lastError = null;
    if (upcomingHere && !isLive) {
      const items = ((ch.schedule && ch.schedule.items) || []).filter((x) => x.id !== upcomingHere.id);
      items.push(upcomingHere);
      items.sort((a, c) => a.start - c.start);
      ch.schedule = { ...(ch.schedule || {}), at: Date.now(), items: items.slice(0, 5), error: null };
    }

    let pendingEnd = false;
    let endConfirmed = false;
    let notifyLive = null;
    let changeNote = "";
    if (isLive) {
      const oldTitle = ch.liveTitle || "";
      const oldCategory = ch.liveCategory || "";
      ch.offlineStreak = 0;
      ch.isLive = true;
      ch.liveUrl = liveUrl;
      if (liveVideoId) ch.liveVideoId = liveVideoId;
      if (!wasLive) {
        ch.liveSince = startedAt || Date.now();
        ch.liveNotified = false;
      } else if (startedAt && (!ch.liveSince || Math.abs(ch.liveSince - startedAt) > 120000)) {
        ch.liveSince = startedAt;
      }
      if (liveTitle) ch.liveTitle = liveTitle;
      if (liveCategory) ch.liveCategory = liveCategory;
      ch.liveViewers = liveViewers;

      const matches = matchesKeywords(ch, ch.liveTitle, ch.liveCategory);
      if (!wasLive) {
        if (matches) notifyLive = { allowAutoOpen: true };
      } else if (ch.liveNotified === false && matches) {
        notifyLive = { allowAutoOpen: true };
      } else if (isManualCheck && matches) {
        notifyLive = { allowAutoOpen: false };
      } else if (ch.notifyChanges && ch.liveNotified !== false) {
        const titleChanged = liveTitle && oldTitle && liveTitle !== oldTitle;
        const catChanged = liveCategory && oldCategory && liveCategory !== oldCategory;
        if (catChanged) changeNote = `agora em ${liveCategory}`;
        else if (titleChanged) changeNote = `novo título: ${liveTitle}`;
      }
      if (notifyLive) ch.liveNotified = true;
    } else if (wasLive && (ch.offlineStreak || 0) < 1) {
      ch.offlineStreak = 1;
      pendingEnd = true;
    } else {
      endConfirmed = true;
      if (wasLive) ch.lastLiveEnd = Date.now();
      ch.offlineStreak = 0;
      ch.isLive = false;
      ch.liveSince = null;
      ch.liveVideoId = null;
      ch.liveTitle = "";
      ch.liveCategory = "";
      ch.liveViewers = null;
      ch.liveNotified = false;
    }

    if (platform !== "youtube" && !channels[idx].avatarUrl && detectedAvatarUrl) {

      channels[idx].avatarUrl = detectedAvatarUrl;
    }

    if (gen !== resetGeneration) return;

    await chrome.storage.local.set({ channels });

    if (isLive) await sessionSeen(ch).catch(() => {});
    else if (endConfirmed) await sessionEnd(ch).catch(() => {});

    if (pendingEnd) scheduleRecheck(ch);

    if (!silent && notifyLive) await onChannelWentLive(ch, notifyLive);
    else if (!silent && changeNote) await onLiveChanged(ch, changeNote);

    if (platform === "youtube" && (!channels[idx].avatarUrl || !channels[idx].channelId)) {
      try {
        const info = await fetchYoutubeChannelInfo(channelConfig.handle, signal);
        const fields = {};
        if (info.avatarUrl && !channels[idx].avatarUrl) fields.avatarUrl = info.avatarUrl;
        if (info.channelId && !channels[idx].channelId) fields.channelId = info.channelId;
        if (Object.keys(fields).length) await patchChannel(channelConfig, fields, gen);
      } catch (avatarErr) {
        if (avatarErr.isWatchdog) throw avatarErr;
        console.warn(`Canais: erro ao buscar foto de ${channelConfig.handle}`, avatarErr.message);
      }
    }

    const { channels: fresh = [] } = await chrome.storage.local.get("channels");
    const current = fresh.find(
      (c) => c.handle === channelConfig.handle && (c.platform || "youtube") === platform
    );
    if (current) await checkNewVideo(current, gen, signal);
  } catch (err) {
    if (err?.isWatchdog) throw err;
    const message = String(err?.message || err).slice(0, 160);
    await patchChannel(channelConfig, { lastError: message, lastChecked: Date.now() }, gen);
    if (err?.isNetworkError) {
      console.warn(`Canais: falha de rede ao checar ${channelConfig.handle}:`, message);
    } else {
      console.error(`Canais: erro ao checar ${channelConfig.handle}`, err);
    }
  }
}

async function checkAllChannels(isManualCheck = false, opts = {}) {
  const gen = resetGeneration;
  const { channels = [] } = await chrome.storage.local.get("channels");

  for (const c of channels) {
    if (gen !== resetGeneration) return;
    if (!c.paused) {
      await checkChannel(c, isManualCheck, opts);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  await updateBadge();
}

async function resetExtension() {
  resetGeneration++;
  inProgress.clear();

  const { channels = [] } = await chrome.storage.local.get("channels");
  const cleaned = channels.map((c) => ({
    platform: c.platform || "youtube",
    handle: c.handle,
    notify: !!c.notify,
    autoOpen: !!c.autoOpen,
    paused: !!c.paused,
    notifyVideos: !!c.notifyVideos,
    autoOpenVideos: !!c.autoOpenVideos,
    autoOpenScheduled: !!c.autoOpenScheduled,
    sound: c.sound !== false,
    notifyChanges: !!c.notifyChanges,
    keywords: c.keywords || "",
    favorite: !!c.favorite,
    preAlert: !!c.preAlert,
    lastLiveEnd: c.lastLiveEnd || null,
    liveTitle: "",
    liveCategory: "",
    liveViewers: null,
    liveNotified: false,
    isLive: false,
    lastChecked: null,
    liveUrl: null,
    liveSince: null,
    liveVideoId: null,
    channelId: null,
    lastVideoId: null,
    lastVideoUrl: null,
    lastVideoTitle: null,
    avatarUrl: null,
    lastError: null,
    videoError: null,
    checkingSince: null,
    offlineStreak: 0,
    lastAutoOpenAt: null,
    lastAutoOpenKey: null,
  }));
  await chrome.storage.local.set({ channels: cleaned, notifMap: {} });

  await chrome.action.setBadgeText({ text: "" });
  try {
    if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument();
  } catch (_) {}
  await chrome.alarms.clearAll();
  await updateAlarm();

  checkAllChannels(false, { silent: true }).catch((e) => console.error("Canais: pós-reset", e));
}

async function openTab(url, active = true) {
  try {
    await chrome.tabs.create({ url, active });
  } catch (err) {
    try {
      await chrome.windows.create({ url, focused: true });
    } catch (err2) {
      console.warn("Canais: não consegui abrir a aba", err2?.message || err2);
    }
  }
}

async function ensureOffscreenDocument() {
  const has = await chrome.offscreen.hasDocument();
  if (has) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Tocar o som de notificação quando um canal fica ao vivo ou publica vídeo novo",
  });
}

async function playNotificationSound() {
  try {
    await ensureOffscreenDocument();
    chrome.runtime.sendMessage({ type: "PLAY_SOUND" }).catch(() => {});
  } catch (err) {
    console.error("Canais: erro ao tocar som de notificação", err);
  }
}

function scheduleRecheck(channel) {
  const name = `recheck|${channel.platform || "youtube"}|${channel.handle}`;
  chrome.alarms.create(name, { delayInMinutes: 1 });
}

async function isChannelTabOpen(channel) {
  const platform = channel.platform || "youtube";
  const h = channel.handle.replace("@", "").trim().toLowerCase();
  const patterns = [];
  if (platform === "youtube") {
    patterns.push(`*://www.youtube.com/@${channel.handle.replace("@", "")}/live*`);
    if (channel.liveVideoId) patterns.push(`*://www.youtube.com/watch?v=${channel.liveVideoId}*`);
  } else if (platform === "twitch") {
    patterns.push(`*://www.twitch.tv/${h}*`);
  } else {
    patterns.push(`*://kick.com/${h}*`);
  }
  try {
    const tabs = await chrome.tabs.query({ url: patterns });
    return tabs.length > 0;
  } catch (_) {
    return false;
  }
}

const AUTO_OPEN_COOLDOWN_MS = 15 * 60 * 1000;

async function shouldAutoOpen(channel) {
  if (!channel.autoOpen || !channel.liveUrl) return false;

  if (channel.liveVideoId && channel.lastAutoOpenKey === channel.liveVideoId) return false;

  if (!channel.liveVideoId && channel.lastAutoOpenAt && Date.now() - channel.lastAutoOpenAt < AUTO_OPEN_COOLDOWN_MS)
    return false;

  if (await isChannelTabOpen(channel)) return false;
  return true;
}

function platformLabelOf(channel) {
  return channel.platform === "twitch" ? "Twitch" : channel.platform === "kick" ? "Kick" : "YouTube";
}

function formatViewers(n) {
  if (!Number.isFinite(n)) return "";
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".", ",") + " mil assistindo";
  return n + " assistindo";
}

async function showNotification(channel, { title, message, contextMessage, url, urls, priority = 1, kind = "" }) {
  const notifId = `streambell-${crypto.randomUUID()}`;
  const { notifMap = {} } = await chrome.storage.local.get("notifMap");
  pruneNotifMap(notifMap);
  notifMap[notifId] = { ...(urls && urls.length > 1 ? { url, urls } : { url }), kind, at: Date.now() };
  await chrome.storage.local.set({ notifMap });

  const opts = {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message: message || " ",
    priority,
  };
  if (contextMessage) opts.contextMessage = contextMessage;
  notifCreate(notifId, opts);
  if (channel.sound !== false) await playNotificationSound();
}

async function onLiveChanged(channel, note) {
  const settings = await getSettings();
  if (!channel.notify || isQuietNow(settings)) return;
  if (settings.holdWhenAway !== false && (await isUserAway())) return;
  await showNotification(channel, {
    title: `${channel.handle} (${platformLabelOf(channel)})`,
    message: note,
    contextMessage: [channel.liveCategory, formatViewers(channel.liveViewers)].filter(Boolean).join(" · "),
    url: channel.liveUrl,
  });
}

async function onChannelWentLive(channel, { allowAutoOpen = true } = {}) {
  const settings = await getSettings();
  if (isQuietNow(settings)) return;
  if (allowAutoOpen && settings.holdWhenAway !== false && (await isUserAway())) {
    if (channel.notify || channel.autoOpen)
      await queueAway({ kind: "live", key: channelKey(channel), handle: channel.handle, url: channel.liveUrl, sound: channel.sound });
    return;
  }
  let streakNote = "";
  try {
    const { liveHistory = [], openSessions = {} } = await chrome.storage.local.get(["liveHistory", "openSessions"]);
    const key = channelKey(channel);
    const st = computeStreak(liveHistory.filter((s) => channelKey(s) === key));
    if (settings.showStreaks !== false && st.count >= 2) streakNote = `sua sequência: ${st.count} lives`;
  } catch (_) {}

  if (channel.notify) {
    await showNotification(channel, {
      title: `${channel.handle} está ao vivo ${platformLabelOf(channel) === "YouTube" ? "no" : "na"} ${platformLabelOf(channel)}!`,
      message: channel.liveTitle || "Clique para assistir",
      contextMessage: [channel.liveCategory, formatViewers(channel.liveViewers), streakNote].filter(Boolean).join(" · "),
      url: channel.liveUrl,
      priority: 2,
      kind: "live",
    });
  }
  if (channel.notify) showLiveToast(channel).catch(() => {});
  if (allowAutoOpen && (await shouldAutoOpen(channel))) {
    await patchChannel(channel, {
      lastAutoOpenAt: Date.now(),
      lastAutoOpenKey: channel.liveVideoId || channel.liveUrl,
    });
    await openTab(channel.liveUrl);
  }
}

chrome.notifications.onClicked.addListener(async (notifId) => {
  if (!notifId.startsWith("streambell-")) return;

  const { notifMap = {} } = await chrome.storage.local.get("notifMap");
  const entry = notifMap[notifId];
  if (entry && (entry.kind === "video" || entry.kind === "live")) {
    const { achState = {} } = await chrome.storage.local.get("achState");
    if (entry.kind === "video") achState.videoOpens = (achState.videoOpens || 0) + 1;
    if (entry.kind === "live" && Date.now() - (entry.at || 0) <= 2 * 60000) achState.quickOpens = (achState.quickOpens || 0) + 1;
    await chrome.storage.local.set({ achState });
    evaluateAchievements().catch(() => {});
  }
  if (entry && entry.kind === "mention" && entry.tabId) {
    try {
      await chrome.tabs.update(entry.tabId, { active: true });
      await chrome.windows.update(entry.windowId, { focused: true });
      delete notifMap[notifId];
      await chrome.storage.local.set({ notifMap });
      return;
    } catch (_) {}
  }
  if (entry?.urls?.length) {
    for (let i = 0; i < entry.urls.length; i++) await openTab(entry.urls[i], i === 0);
  } else if (entry?.url) await openTab(entry.url);

  delete notifMap[notifId];
  await chrome.storage.local.set({ notifMap });
});

chrome.notifications.onClosed.addListener(async (notifId) => {
  if (!notifId.startsWith("streambell-")) return;
  const { notifMap = {} } = await chrome.storage.local.get("notifMap");
  if (notifMap[notifId]) {
    delete notifMap[notifId];
    await chrome.storage.local.set({ notifMap });
  }
});

// ---- lives agendadas ----
const SCHEDULE_EVERY_MS = 60 * 60000;
const TWITCH_GQL_CLIENT = "kimne78kx3ncx6brgo4mv6wki5h1ko";

function unescapeJsonText(s) {
  try {
    return JSON.parse('"' + s + '"');
  } catch (_) {
    return s;
  }
}

// Na página /@canal/live, a sala de espera de uma live agendada também diz que é "live".
// Só conta como ao vivo quando o próprio vídeo está transmitindo agora e não está marcado como futuro.
function jsonBlockAfter(html, key, max = 4000) {
  const i = html.indexOf(`"${key}":{`);
  if (i < 0) return "";
  let depth = 0;
  const start = i + key.length + 3;
  for (let j = start; j < Math.min(html.length, start + max); j++) {
    const c = html[j];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return html.slice(start, j + 1);
    }
  }
  return html.slice(start, start + max);
}

function youtubeLiveState(html, now = Date.now()) {
  const vd = jsonBlockAfter(html, "videoDetails", 20000);
  const lbd = jsonBlockAfter(html, "liveBroadcastDetails", 1000);
  const isUpcoming = vd ? /"isUpcoming"\s*:\s*true/.test(vd) : /"isUpcoming"\s*:\s*true/.test(html);
  let live;
  if (vd) live = (/"isLive"\s*:\s*true/.test(vd) || /"isLiveNow"\s*:\s*true/.test(lbd)) && !isUpcoming;
  else live = (/"isLiveNow"\s*:\s*true/.test(html) || /"isLive"\s*:\s*true/.test(html)) && !isUpcoming;
  if (/"isLiveNow"\s*:\s*false/.test(lbd) && !/"isLive"\s*:\s*true/.test(vd)) live = false;
  let upcoming = null;
  if (!live && isUpcoming) {
    const id = ((vd || "").match(/"videoId"\s*:\s*"([\w-]{11})"/) || html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/) || [])[1];
    const st = (html.match(/"upcomingEventData"\s*:\s*\{\s*"startTime"\s*:\s*"(\d{9,11})"/) || [])[1];
    const sched = st ? Number(st) * 1000 : Date.parse(((lbd || "").match(/"startTimestamp"\s*:\s*"([^"]+)"/) || [])[1] || "");
    const title = ((vd || "").match(/"title"\s*:\s*"((?:[^"\\]|\\.){1,200})"/) || [])[1];
    if (id && sched && sched > now - 10 * 60000 && sched < now + 30 * 86400000)
      upcoming = { id, start: sched, title: title ? unescapeJsonText(title) : "", url: `https://www.youtube.com/watch?v=${id}` };
  }
  if (!live && !upcoming) {
    const cid = (html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/) || (vd || "").match(/"videoId"\s*:\s*"([\w-]{11})"/) || [])[1];
    if (cid) upcoming = youtubeUpcomingFromWatch(html, cid, now);
  }
  return { live, upcoming };
}

function parseYoutubeUpcoming(html, now = Date.now()) {
  const out = [];
  const seen = new Set();
  const re = /"upcomingEventData"\s*:\s*\{\s*"startTime"\s*:\s*"(\d{9,11})"/g;
  let m;
  while ((m = re.exec(html)) && out.length < 5) {
    const start = Number(m[1]) * 1000;
    if (!(start > now - 10 * 60000 && start < now + 14 * 86400000)) continue;
    const before = html.slice(Math.max(0, m.index - 6000), m.index);
    const ids = [...before.matchAll(/"videoId"\s*:\s*"([\w-]{11})"/g)];
    if (!ids.length) continue;
    const id = ids[ids.length - 1][1];
    if (seen.has(id)) continue;
    seen.add(id);
    const after = before.slice(ids[ids.length - 1].index);
    const t = after.match(/"title"\s*:\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"((?:[^"\\]|\\.){1,200})"/) || after.match(/"title"\s*:\s*\{\s*"simpleText"\s*:\s*"((?:[^"\\]|\\.){1,200})"/);
    out.push({ id, start, title: t ? unescapeJsonText(t[1]) : "", url: `https://www.youtube.com/watch?v=${id}` });
  }
  // formato novo do YouTube (2026): cada vídeo é um "lockupViewModel"; a agendada traz o horário em "startTime"
  const marks = [];
  const lre = /"lockupViewModel"\s*:\s*\{/g;
  while ((m = lre.exec(html))) marks.push(m.index);
  for (let k = 0; k < marks.length && out.length < 5; k++) {
    const seg = html.slice(marks[k], Math.min(k + 1 < marks.length ? marks[k + 1] : html.length, marks[k] + 60000));
    const st = seg.match(/"startTime"\s*:\s*"?(\d{9,11})"?/);
    const idm = seg.match(/"contentId"\s*:\s*"([\w-]{11})"/);
    if (!st || !idm || seen.has(idm[1])) continue;
    const start = Number(st[1]) * 1000;
    if (!(start > now - 10 * 60000 && start < now + 14 * 86400000)) continue;
    seen.add(idm[1]);
    const t = seg.match(/"lockupMetadataViewModel"\s*:\s*\{\s*"title"\s*:\s*\{\s*"content"\s*:\s*"((?:[^"\\]|\\.){1,200})"/);
    out.push({ id: idm[1], start, title: t ? unescapeJsonText(t[1]) : "", url: `https://www.youtube.com/watch?v=${idm[1]}` });
  }
  return out.sort((a, b) => a.start - b.start);
}

// Página de um vídeo agendado: horário pelos campos numéricos (iguais em qualquer idioma).
function youtubeUpcomingFromWatch(html, id, now = Date.now()) {
  if (!html || !/"isUpcoming"\s*:\s*true/.test(html) || /"isLiveNow"\s*:\s*true/.test(html)) return null;
  const sst = html.match(/"scheduledStartTime"\s*:\s*"(\d{9,11})"/);
  const ts = html.match(/"startTimestamp"\s*:\s*"([^"]{10,40})"/);
  const start = sst ? Number(sst[1]) * 1000 : ts ? Date.parse(ts[1]) : NaN;
  if (!Number.isFinite(start) || start < now - 10 * 60000 || start > now + 60 * 86400000) return null;
  const vd = jsonBlockAfter(html, "videoDetails", 20000) || "";
  const tm = vd.match(/"title"\s*:\s*"((?:[^"\\]|\\.){1,200})"/) || html.match(/<meta name="title" content="([^"]{1,200})"/);
  const title = tm ? (tm[0].startsWith("<meta") ? tm[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'") : unescapeJsonText(tm[1])) : "";
  return { id, start, title, url: `https://www.youtube.com/watch?v=${id}` };
}

// Vídeos da aba Live que não são gravação (sem duração tipo 1:02:33) nem live agora: candidatos a agendada.
function youtubeUpcomingCandidates(html) {
  const marks = [];
  const re = /"lockupViewModel"\s*:\s*\{/g;
  let m;
  while ((m = re.exec(html))) marks.push(m.index);
  const out = [];
  for (let k = 0; k < marks.length && k < 15 && out.length < 5; k++) {
    const seg = html.slice(marks[k], Math.min(k + 1 < marks.length ? marks[k + 1] : html.length, marks[k] + 60000));
    const idm = seg.match(/"contentId"\s*:\s*"([\w-]{11})"/);
    if (!idm || out.includes(idm[1])) continue;
    const badges = [...seg.matchAll(/"thumbnailBadgeViewModel"\s*:\s*\{\s*"text"\s*:\s*"([^"]{0,40})"\s*,\s*"badgeStyle"\s*:\s*"([A-Z_]+)"/g)];
    if (!badges.length) continue;
    if (badges.some((b) => /^\d{1,2}(:\d{2}){1,2}$/.test(b[1].trim()) || /LIVE/.test(b[2]))) continue;
    out.push(idm[1]);
  }
  return out;
}

function parseTwitchSchedule(json, handle, now = Date.now()) {
  const segs = (((((json || [])[0] || {}).data || {}).user || {}).channel || {}).schedule;
  const list = (segs && segs.segments) || [];
  return list
    .map((s) => ({ id: "tw-" + (s.id || s.startAt), start: Date.parse(s.startAt), title: String(s.title || "").trim(), category: (s.categories && s.categories[0] && s.categories[0].name) || "", url: `https://www.twitch.tv/${handle}` }))
    .filter((s) => s.start > now - 10 * 60000 && s.start < now + 14 * 86400000)
    .sort((a, b) => a.start - b.start)
    .slice(0, 5);
}

async function fetchSchedule(ch, signal) {
  const pf = ch.platform || "youtube";
  if (pf === "youtube") {
    const h = ch.handle.startsWith("@") ? ch.handle : "@" + ch.handle;
    const html = await fetchText(`https://www.youtube.com/${h}/streams`, { signal });
    const found = parseYoutubeUpcoming(html);
    if (found.length) return found;
    // A aba Live não traz mais o horário em número, só o texto ("Scheduled for…"), que muda com o idioma.
    // Então abre a página das que parecem agendadas e lê o horário de lá (dado que não depende do idioma).
    const out = [];
    for (const id of youtubeUpcomingCandidates(html).slice(0, 5)) {
      try {
        const up = youtubeUpcomingFromWatch(await fetchText(`https://www.youtube.com/watch?v=${id}`, { signal }), id);
        if (up) out.push(up);
      } catch (e) {
        if (signal && signal.aborted) throw e;
      }
    }
    return out.sort((a, b) => a.start - b.start);
  }
  if (pf === "twitch") {
    const login = ch.handle.replace("@", "").toLowerCase();
    if (!/^[a-z0-9_]{2,25}$/.test(login)) return [];
    const res = await safeFetch("https://gql.twitch.tv/gql", {
      method: "POST",
      headers: { "Client-Id": TWITCH_GQL_CLIENT, "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify([{ query: `query{user(login:"${login}"){channel{schedule{segments(first:5){id startAt title categories{name}}}}}}` }]),
      signal,
    });
    if (!res.ok) throw new Error(`agenda da Twitch respondeu ${res.status}`);
    return parseTwitchSchedule(JSON.parse(res.body), login);
  }
  return [];
}

async function checkSchedules(now = Date.now()) {
  const settings = await getSettings();
  if (settings.scheduleAlerts === false) return;
  const { channels = [] } = await chrome.storage.local.get("channels");
  const due = channels
    .filter((c) => !c.paused && (c.platform || "youtube") !== "kick" && !(c.schedule && now - (c.schedule.at || 0) < SCHEDULE_EVERY_MS))
    .slice(0, 3);
  for (const ch of due) {
    const wd = new AbortController();
    const timer = setTimeout(() => wd.abort(), WATCHDOG_MS);
    try {
      const items = await fetchSchedule(ch, wd.signal);
      await patchChannel(ch, { schedule: { at: now, items, error: null } });
    } catch (e) {
      await patchChannel(ch, { schedule: { at: now, items: (ch.schedule && ch.schedule.items) || [], error: String(e && e.message ? e.message : e).slice(0, 120) } });
    } finally {
      clearTimeout(timer);
    }
  }
}

// Abre a página da live agendada assim que ela aparece, pra quem ligou essa opção no canal.
// Uma por canal de cada vez: a próxima só abre depois que a anterior já passou.
async function checkScheduleAutoOpen(now = Date.now()) {
  const settings = await getSettings();
  const { channels = [], schedOpened = {} } = await chrome.storage.local.get(["channels", "schedOpened"]);
  const due = [];
  for (const ch of channels) {
    if (ch.paused || !ch.autoOpenScheduled || ch.isLive) continue;
    const items = ((ch.schedule && ch.schedule.items) || []).slice().sort((a, b) => a.start - b.start);
    if (items.some((it) => schedOpened[it.id] && it.start > now - 3 * 3600000)) continue;
    const it = items.find((x) => x.start > now - 10 * 60000 && !schedOpened[x.id]);
    if (it) due.push({ ch, it });
  }
  if (!due.length) return;
  if (isQuietNow(settings, new Date(now))) return;
  if (settings.holdWhenAway !== false && (await isUserAway())) return;
  for (const { ch, it } of due) {
    schedOpened[it.id] = now;
    let open = await isChannelTabOpen(ch);
    if (!open && /youtube\.com\/watch\?v=/.test(it.url)) {
      try {
        open = (await chrome.tabs.query({ url: `*://www.youtube.com/watch?v=${it.url.split("v=")[1]}*` })).length > 0;
      } catch (_) {}
    }
    if (!open) await openTab(it.url, true);
  }
  for (const [k, t] of Object.entries(schedOpened)) if (now - t > 40 * 86400000) delete schedOpened[k];
  await chrome.storage.local.set({ schedOpened });
}

async function checkScheduleAlerts(now = Date.now()) {
  const settings = await getSettings();
  if (settings.scheduleAlerts === false || isQuietNow(settings, new Date(now))) return;
  const { channels = [], schedAlerts = {} } = await chrome.storage.local.get(["channels", "schedAlerts"]);
  let changed = false;
  for (const ch of channels) {
    if (ch.paused || !ch.notify || ch.isLive) continue;
    for (const it of (ch.schedule && ch.schedule.items) || []) {
      const mins = (it.start - now) / 60000;
      if (mins < 8 || mins > 16 || schedAlerts[it.id]) continue;
      schedAlerts[it.id] = now;
      changed = true;
      if (await isUserAway()) continue;
      const t = new Date(it.start);
      const hh = `${t.getHours()}h${t.getMinutes() ? String(t.getMinutes()).padStart(2, "0") : ""}`;
      await showNotification(ch, {
        title: `${ch.handle} começa em ${Math.round(mins)} min`,
        message: it.title || `Live agendada pras ${hh}`,
        contextMessage: `Agendada · ${hh}`,
        url: it.url,
        kind: "scheduled",
      });
    }
  }
  if (changed) {
    for (const [k, t] of Object.entries(schedAlerts)) if (now - t > 3 * 86400000) delete schedAlerts[k];
    await chrome.storage.local.set({ schedAlerts });
  }
}


if (chrome.storage && chrome.storage.onChanged) {
  let pullTimer = null;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.channels || changes.settings || changes.achievements)) schedulePush();
    if (area === "sync") {
      clearTimeout(pullTimer);
      pullTimer = setTimeout(async () => {
        try {
          const dev = await getDeviceId();
          const foreign = Object.keys(changes).some((k) => {
            if (k === "sc_ach_" + dev || k === "sc_dev_" + dev) return false;
            if (k === "sc_chn" || k === "sc_set") return ((changes[k].newValue || {}).by || "") !== dev;
            return !k.startsWith("sc_ch_");
          });
          if (!foreign) return;
          const r = await syncPull();
          if (r && (r.achChanged || r.watchChanged)) await evaluateAchievements().catch(() => {});
        } catch (e) {
          console.warn("Canais: sync falhou", e?.message || e);
        }
      }, 1500);
    }
  });
}


// ---- marcar momento ----
function fmtOffset(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function twitchT(sec) {
  sec = Math.max(0, Math.floor(sec));
  return `${Math.floor(sec / 3600)}h${Math.floor((sec % 3600) / 60)}m${sec % 60}s`;
}

function momentUrl(m) {
  if (m.platform === "youtube" && m.videoId) return `https://www.youtube.com/watch?v=${m.videoId}&t=${Math.max(0, Math.floor(m.offset))}s`;
  if (m.platform === "twitch" && m.vodId) return `https://www.twitch.tv/videos/${m.vodId}?t=${twitchT(m.offset)}`;
  if (m.platform === "twitch") return `https://www.twitch.tv/${m.handle.replace("@", "").toLowerCase()}/videos?filter=archives`;
  if (m.platform === "kick") return `https://kick.com/${m.handle.replace("@", "").toLowerCase()}/videos`;
  return m.pageUrl || "";
}

async function markMoment(tab, source = "atalho", opts = {}) {
  if (!tab || !tab.url) return { error: "abra a aba da live primeiro" };
  let u;
  try {
    u = new URL(tab.url);
  } catch (_) {
    return { error: "aba inválida" };
  }
  const host = u.hostname.replace(/^www\./, "");
  if (!["youtube.com", "twitch.tv", "kick.com"].includes(host)) return { error: "abra uma live do YouTube, Twitch ou Kick" };
  const now = Date.now();
  let info = null;
  try {
    info = await chrome.tabs.sendMessage(tab.id, { type: "GET_TIME" });
  } catch (_) {}
  const { channels = [] } = await chrome.storage.local.get("channels");
  const ch = channels.find((c) => c.isLive && tabMatchesChannel(tab.url, c));
  const m = { id: `m${now.toString(36)}`, at: now, note: "", pageUrl: tab.url, source };
  if (host === "youtube.com") {
    const vid = u.searchParams.get("v") || (u.pathname.match(/^\/live\/([\w-]{11})/) || [])[1] || (ch && ch.liveVideoId) || null;
    m.platform = "youtube";
    m.videoId = vid;
    m.handle = ch ? ch.handle : "";
    m.live = !!(ch || (info && info.live));
    if (m.live && ch && ch.liveSince) m.offset = (now - ch.liveSince) / 1000 - 10;
    else m.offset = info && info.ok ? info.currentTime : 0;
    m.title = (ch && ch.liveTitle) || (info && info.title ? info.title.replace(/ - YouTube$/, "") : "");
  } else {
    const parts = u.pathname.split("/").filter(Boolean);
    m.platform = host === "twitch.tv" ? "twitch" : "kick";
    if (m.platform === "twitch" && parts[0] === "videos" && parts[1]) {
      m.vodId = parts[1].replace(/\D/g, "");
      m.offset = info && info.ok ? info.currentTime : 0;
      m.handle = "";
      m.live = false;
      m.title = info && info.title ? info.title.replace(/ - Twitch$/, "") : "";
    } else {
      if (!ch) return { error: "esse canal não está ao vivo na sua lista" };
      m.handle = ch.handle;
      m.live = true;
      m.offset = ch.liveSince ? (now - ch.liveSince) / 1000 - 10 : info && info.ok ? info.currentTime : 0;
      m.title = ch.liveTitle || "";
    }
  }
  m.liveStart = ch && ch.liveSince ? ch.liveSince : null;
  m.offset = Math.max(0, Math.round(m.offset || 0));
  m.url = momentUrl(m);
  if (opts.note) m.note = opts.note;
  if (opts.kind) m.kind = opts.kind;
  const { moments = [] } = await chrome.storage.local.get("moments");
  moments.unshift(m);
  if (moments.length > 500) moments.length = 500;
  await chrome.storage.local.set({ moments });
  if (opts.quiet) return { ok: true, moment: m };
  const settings = await getSettings();
  const label = fmtOffset(m.offset);
  const shown = await sendPageCards([
    { kind: "info", kicker: "Momento marcado", title: `${label}${m.handle ? " · " + m.handle : ""}`, desc: "Tá na aba Momentos do Seus Canais, com o link pro minuto.", mascot: mascotMarkup(settings, "normal", 60) },
  ]).catch(() => false);
  if (!shown) infoNotification("Momento marcado", `${label}${m.handle ? " na live de " + m.handle : ""}. Veja em Momentos no Seus Canais.`);
  return { ok: true, moment: m };
}

if (chrome.commands && chrome.commands.onCommand) {
  chrome.commands.onCommand.addListener(async (command, tab) => {
    if (command !== "mark-moment") return;
    let t = tab;
    if (!t || !t.url) {
      try {
        [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      } catch (_) {}
    }
    const r = await markMoment(t, "atalho");
    if (r && r.error) infoNotification("Não deu pra marcar", r.error);
  });
  chrome.commands.onCommand.addListener(async (command, tab) => {
    if (command !== "clip-now") return;
    let t = tab;
    if (!t || !t.url) {
      try {
        [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      } catch (_) {}
    }
    await clipTab(t, "atalho");
  });
}

// ---- versão nova ----
function versionParts(v) {
  return String(v || "").replace(/^v/i, "").split(/[.-]/).slice(0, 3).map((x) => parseInt(x, 10) || 0);
}
function isNewerVersion(a, b) {
  const x = versionParts(a), y = versionParts(b);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}
async function checkForUpdate(force = false) {
  const { updateInfo = {} } = await chrome.storage.local.get("updateInfo");
  const now = Date.now();
  if (!force && updateInfo.at && now - updateInfo.at < 20 * 3600000) return updateInfo;
  const info = { ...updateInfo, at: now, error: null };
  try {
    const res = await fetch(`https://api.github.com/repos/${OFFICIAL_REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" });
    if (res.status === 404) info.error = "ainda não tem versão publicada";
    else if (!res.ok) info.error = `GitHub respondeu ${res.status}`;
    else {
      const j = await res.json();
      info.latest = String(j.tag_name || "").replace(/^v/i, "");
      info.url = j.html_url || `https://github.com/${OFFICIAL_REPO}/releases/latest`;
      info.notes = String(j.body || "").slice(0, 600);
    }
  } catch (e) {
    info.error = "sem conexão com o GitHub";
  }
  info.current = chrome.runtime.getManifest().version;
  info.available = !!info.latest && isNewerVersion(info.latest, info.current);
  await chrome.storage.local.set({ updateInfo: info });
  return info;
}

// ---- ilha ----
async function patchSettingsBg(patch) {
  const { settings = {} } = await chrome.storage.local.get("settings");
  await chrome.storage.local.set({ settings: { ...settings, ...patch } });
}

async function islandData(url) {
  const data = await chrome.storage.local.get(["channels", "settings", "watchLog", "achievements", "achState"]);
  const settings = { ...(data.settings || {}) };
  const channels = data.channels || [];
  if (settings.island === false) return { enabled: false };
  const lives = channels
    .filter((c) => c.isLive && !c.paused)
    .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || (a.liveSince || 0) - (b.liveSince || 0))
    .map((c) => ({
      key: channelKey(c),
      handle: c.handle,
      platform: c.platform || "youtube",
      title: c.liveTitle || "",
      category: c.liveCategory || "",
      viewers: Number.isFinite(c.liveViewers) ? c.liveViewers : null,
      liveSince: c.liveSince || null,
      url: c.liveUrl || channelPageUrl(c),
      avatar: c.avatarUrl || null,
    }));
  const cur = channels.find((c) => c.isLive && !c.paused && url && tabMatchesChannel(url, c));
  const day = dayKey();
  const todayMin = Object.entries(data.watchLog || {}).filter(([k]) => !k.startsWith("remote:")).reduce((a, [, m]) => a + ((m || {})[day] || 0), 0);
  const lvl = computeLevel(data);
  const acc = ACCENTS.find((a) => a.id === settings.accent) || ACCENTS[0];
  const theme = settings.theme || "auto";
  return {
    enabled: true,
    empty: !channels.length,
    listed: channels.map((c) => channelKey(c).toLowerCase()),
    lang: typeof uiLang === "function" ? uiLang(settings) : "pt",
    light: theme === "light" ? true : theme === "dark" ? false : null,
    accent: { light: acc.light, dark: acc.dark },
    position: settings.islandPos === "bottom" ? "bottom" : "top",
    lives,
    current: cur ? channelKey(cur) : null,
    todayMin,
    level: lvl.level,
    levelProgress: lvl.progress,
    recorder: settings.clipRecorder === true,
    mascot: { normal: mascotMarkup(settings, "normal", 30), wave: mascotMarkup(settings, "acenando", 52), party: mascotMarkup(settings, "festa", 34) },
  };
}

// ---- modo foco ----
// Roda dentro da página (mundo MAIN) pra conseguir usar o player do site.
async function focusQualityInPage(site, restore) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (site === "youtube") {
    const p = document.getElementById("movie_player");
    if (!p || typeof p.getAvailableQualityLevels !== "function") return { ok: false, reason: "player não encontrado" };
    const lv = (p.getAvailableQualityLevels() || []).filter((q) => q && q !== "auto");
    if (!lv.length) return { ok: false, reason: "a qualidade ainda não carregou, dá play e tenta de novo" };
    const NAMES = { tiny: "144p", small: "240p", medium: "360p", large: "480p", hd720: "720p", hd1080: "1080p", hd1440: "1440p", hd2160: "4K", highres: "8K" };
    let q;
    if (restore) {
      const prev = window.__scPrevQuality;
      q = prev && lv.includes(prev) ? prev : lv[0];
    } else {
      const now = typeof p.getPlaybackQuality === "function" ? p.getPlaybackQuality() : "";
      if (now && now !== lv[lv.length - 1]) window.__scPrevQuality = now;
      q = lv[lv.length - 1];
    }
    if (typeof p.setPlaybackQualityRange === "function") p.setPlaybackQualityRange(q, q);
    if (typeof p.setPlaybackQuality === "function") p.setPlaybackQuality(q);
    return { ok: true, label: NAMES[q] || q };
  }
  if (site === "twitch") {
    const btn = document.querySelector('[data-a-target="player-settings-button"]');
    if (!btn) return { ok: false, reason: "player não encontrado" };
    btn.click();
    await sleep(300);
    const qi = document.querySelector('[data-a-target="player-settings-menu-item-quality"]');
    if (!qi) {
      btn.click();
      return { ok: false, reason: "não achei o menu de qualidade" };
    }
    qi.click();
    await sleep(300);
    const rows = [...document.querySelectorAll('[data-a-target="player-settings-submenu-quality-option"]')];
    const inputs = rows.map((r) => r.querySelector("input")).filter(Boolean);
    if (!inputs.length) {
      btn.click();
      return { ok: false, reason: "não achei as opções de qualidade" };
    }
    const target = restore ? inputs[0] : inputs[inputs.length - 1];
    target.click();
    const label = ((target.closest('[data-a-target="player-settings-submenu-quality-option"]') || {}).textContent || "").trim();
    await sleep(200);
    if (document.querySelector('[data-a-target="player-settings-menu"]')) btn.click();
    return { ok: true, label };
  }
  return { ok: false, reason: "na Kick ainda não dá, troca a qualidade na engrenagem do player" };
}

async function focusQuality(tab, restore) {
  if (!tab || !tab.id) return { ok: false, reason: "aba não encontrada" };
  const host = (() => {
    try {
      return new URL(tab.url).hostname.replace(/^www\./, "");
    } catch (_) {
      return "";
    }
  })();
  const site = host === "youtube.com" ? "youtube" : host === "twitch.tv" ? "twitch" : host === "kick.com" ? "kick" : "";
  if (!site) return { ok: false, reason: "abra uma live" };
  const res = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", func: focusQualityInPage, args: [site, restore] });
  return (res && res[0] && res[0].result) || { ok: false, reason: "não deu pra mudar a qualidade" };
}

async function focusChat(tab, url) {
  if (!url || !/^https:\/\/(www\.youtube\.com\/live_chat\?|www\.twitch\.tv\/popout\/|kick\.com\/popout\/)/.test(url)) return { ok: false, reason: "chat não encontrado" };
  const geo = { type: "popup", width: 400, height: 680 };
  try {
    const w = tab && tab.windowId != null ? await chrome.windows.get(tab.windowId) : null;
    if (w && Number.isFinite(w.left) && Number.isFinite(w.width)) {
      geo.left = Math.max(0, w.left + w.width - 410);
      geo.top = Math.max(0, (w.top || 0) + 60);
      geo.height = Math.max(420, Math.min(760, (w.height || 760) - 80));
    }
  } catch (_) {}
  await chrome.windows.create({ ...geo, url, focused: true });
  return { ok: true };
}

// ---- cortes ----
async function askTab(tabId, msg, files) {
  try {
    return await chrome.tabs.sendMessage(tabId, msg);
  } catch (_) {
    if (!chrome.scripting) return null;
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files });
      return await chrome.tabs.sendMessage(tabId, msg);
    } catch (_) {
      return null;
    }
  }
}

async function clipTab(tab, source = "atalho") {
  const settings = await getSettings();
  const fail = async (desc) => {
    const shown = await sendPageCards([{ kind: "info", error: true, kicker: "Corte", title: "Não deu pra cortar", desc, mascot: mascotMarkup(settings, "dormindo", 60) }]).catch(() => false);
    if (!shown) infoNotification("Não deu pra cortar", desc);
    return { error: desc };
  };
  if (!tab || !tab.url || !TOAST_SITES.test(tab.url)) return fail("abra uma live do YouTube, Twitch ou Kick primeiro");
  const r = await askTab(tab.id, { type: "CLIP" }, ["clip.js"]);
  if (!r) return fail("recarregue a página da live e tente de novo");
  if (!r.ok) return fail(r.reason || "o site não deixou");
  const site = r.site === "twitch" ? "Twitch" : r.site === "kick" ? "Kick" : "YouTube";
  const note = r.mode === "replay" ? `corte salvo: ${r.file}` : `clipe criado na ${site}`;
  await markMoment(tab, source === "atalho" ? "corte" : source, { quiet: true, note, kind: "clip" }).catch(() => null);
  const item =
    r.mode === "replay"
      ? { kind: "info", kicker: "Corte salvo", title: `Últimos ${r.secs}s da live`, desc: `Tá na pasta de downloads: ${r.file}`, mascot: mascotMarkup(settings, "festa", 60) }
      : { kind: "info", kicker: "Corte", title: `Editor de clipe aberto`, desc: `Ajuste o trecho no editor da ${site} e publique. O minuto ficou salvo em Momentos.`, mascot: mascotMarkup(settings, "acenando", 60) };
  const shown = await sendPageCards([item]).catch(() => false);
  if (!shown) infoNotification(item.kicker, `${item.title}. ${item.desc}`);
  return { ok: true, ...r };
}


// ---- ver juntas ----
function tileRects(n, area) {
  const { left, top, width, height } = area;
  const half = (v) => Math.floor(v / 2);
  if (n === 2) return [
    { left, top, width: half(width), height },
    { left: left + half(width), top, width: width - half(width), height },
  ];
  if (n === 3) return [
    { left, top, width: half(width), height },
    { left: left + half(width), top, width: width - half(width), height: half(height) },
    { left: left + half(width), top: top + half(height), width: width - half(width), height: height - half(height) },
  ];
  return [
    { left, top, width: half(width), height: half(height) },
    { left: left + half(width), top, width: width - half(width), height: half(height) },
    { left, top: top + half(height), width: half(width), height: height - half(height) },
    { left: left + half(width), top: top + half(height), width: width - half(width), height: height - half(height) },
  ];
}

async function tileLives(urls) {
  const clean = urls.filter((u) => typeof u === "string" && /^https:\/\/(www\.youtube\.com|www\.twitch\.tv|kick\.com)\//.test(u)).slice(0, 4);
  if (clean.length < 2) return { error: "escolha pelo menos 2 lives" };
  let area = { left: 0, top: 0, width: 1280, height: 720 };
  try {
    const w = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
    if (w && w.width && w.height) area = { left: w.left || 0, top: w.top || 0, width: w.width, height: w.height };
  } catch (_) {}
  const { channels = [] } = await chrome.storage.local.get("channels");
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: ["https://www.youtube.com/*", "https://www.twitch.tv/*", "https://kick.com/*"] });
  } catch (_) {}
  const used = new Set();
  // Se a live já está aberta numa aba, leva essa aba pra grade em vez de abrir outra (não duplica o som).
  const findOpen = (url) => {
    const ch = channels.find((c) => c.liveUrl === url || liveLinkOfBg(c) === url);
    return tabs.find((t) => !used.has(t.id) && t.url && (t.url.split("#")[0] === url || (ch && tabMatchesChannel(t.url, ch))));
  };
  const rects = tileRects(clean.length, area);
  const ids = [];
  for (let i = 0; i < clean.length; i++) {
    const r = rects[i];
    const geo = { type: "popup", left: r.left, top: r.top, width: Math.max(400, r.width), height: Math.max(300, r.height), focused: i === clean.length - 1 };
    const open = findOpen(clean[i]);
    try {
      let win;
      if (open) {
        used.add(open.id);
        win = await chrome.windows.create({ ...geo, tabId: open.id });
      } else {
        const ch = channels.find((c) => c.liveUrl === clean[i] || liveLinkOfBg(c) === clean[i]);
        const page = chrome.runtime.getURL(`loading.html?u=${encodeURIComponent(clean[i])}&n=${encodeURIComponent(ch ? ch.handle : "")}`);
        win = await chrome.windows.create({ ...geo, url: page });
      }
      ids.push(win.id);
    } catch (e) {
      try {
        if (!open) await chrome.tabs.create({ url: clean[i], active: false });
      } catch (_) {}
    }
  }
  return { ok: true, opened: ids.length };
}

function liveLinkOfBg(c) {
  if (c.liveUrl) return c.liveUrl;
  const h = c.handle.replace("@", "");
  if (c.platform === "twitch") return `https://www.twitch.tv/${h.toLowerCase()}`;
  if (c.platform === "kick") return `https://kick.com/${h.toLowerCase()}`;
  return `https://www.youtube.com/@${h}/live`;
}
