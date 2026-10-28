// Sincroniza canais, configurações, conquistas e um resumo do tempo assistido
// entre computadores, usando o chrome.storage.sync (a conta do Chrome). Sem servidor.

const SYNC_CH_FIELDS = ["platform", "handle", "favorite", "preAlert", "notify", "autoOpen", "paused", "notifyVideos", "autoOpenVideos", "sound", "notifyChanges", "keywords", "autoOpenScheduled"];
const SYNC_SETTING_FIELDS = ["accent", "frame", "mascot", "hideMascot", "theme", "oled", "fx", "mentionNicks", "mentionAlerts", "interval", "sortLiveFirst", "quietHours", "weeklySummary", "showStreaks", "achievementAlerts", "missedAlerts", "holdWhenAway", "countChat", "countLikes", "hideToday", "pageLiveToast", "scheduleAlerts"];
const SYNC_CHUNK = 6500;
const SYNC_DAYS = 90;
const REMOTE_PREFIX = "remote:";

function syncHash(obj) {
  const s = JSON.stringify(obj);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(36) + ":" + s.length;
}

function syncChannelKey(c) {
  return ((c.platform || "youtube") + ":" + c.handle).toLowerCase();
}

function minimalChannels(channels) {
  return (channels || []).map((c) => {
    const o = {};
    for (const k of SYNC_CH_FIELDS) if (k in c) o[k] = c[k];
    o.platform = o.platform || "youtube";
    return o;
  });
}

function pickSettings(settings) {
  const o = {};
  for (const k of SYNC_SETTING_FIELDS) if (settings && k in settings) o[k] = settings[k];
  return o;
}

function ownDailyTotals(watchLog, now = Date.now()) {
  const cutoff = insightDayKey(now - SYNC_DAYS * 86400000);
  const days = {};
  for (const [k, map] of Object.entries(watchLog || {})) {
    if (k.startsWith(REMOTE_PREFIX)) continue;
    for (const [d, v] of Object.entries(map || {})) if (d >= cutoff && v > 0) days[d] = Math.round(((days[d] || 0) + v) * 10) / 10;
  }
  return days;
}

function mergeAchievements(local, remote) {
  const out = { ...(local || {}) };
  let changed = false;
  for (const [id, t] of Object.entries(remote || {})) {
    if (!/^[a-z0-9-]{1,40}$/.test(id) || !(t > 0)) continue;
    if (!out[id] || t < out[id]) {
      if (!out[id]) changed = true;
      out[id] = t;
    }
  }
  return { merged: out, changed };
}

function achStateSummary(st) {
  const s = st || {};
  const weeks = Object.keys(s.challengesDone || {}).sort().slice(-10);
  const cd = {};
  for (const w of weeks) cd[w] = s.challengesDone[w];
  return {
    installedAt: s.installedAt || 0,
    videoOpens: s.videoOpens || 0,
    quickOpens: s.quickOpens || 0,
    virada: !!s.virada,
    historic: !!s.historic,
    msgs: (s.messages && s.messages.total) || 0,
    likes: (s.likedLives || []).length,
    cd,
  };
}

function mergeAchState(local, sum) {
  const s = local || {};
  if (!sum) return { state: s, changed: false };
  const before = JSON.stringify(s);
  if (sum.installedAt && (!s.installedAt || sum.installedAt < s.installedAt)) s.installedAt = sum.installedAt;
  s.videoOpens = Math.max(s.videoOpens || 0, sum.videoOpens || 0);
  s.quickOpens = Math.max(s.quickOpens || 0, sum.quickOpens || 0);
  if (sum.virada) s.virada = true;
  if (sum.historic) s.historic = true;
  s.messages = s.messages || { total: 0, perKey: {} };
  s.messages.total = Math.max(s.messages.total || 0, sum.msgs || 0);
  s.likesRemote = Math.max(s.likesRemote || 0, sum.likes || 0);
  s.challengesDone = s.challengesDone || {};
  for (const [w, list] of Object.entries(sum.cd || {})) {
    const cur = new Set(s.challengesDone[w] || []);
    for (const id of list || []) cur.add(id);
    s.challengesDone[w] = [...cur];
  }
  return { state: s, changed: JSON.stringify(s) !== before };
}

async function syncEnabled() {
  const { settings = {} } = await chrome.storage.local.get("settings");
  return settings.sync === true && !!(chrome.storage && chrome.storage.sync);
}

async function getDeviceId() {
  const { deviceId } = await chrome.storage.local.get("deviceId");
  if (deviceId) return deviceId;
  const id = Math.random().toString(36).slice(2, 10);
  await chrome.storage.local.set({ deviceId: id });
  return id;
}

let syncLock = Promise.resolve();
function withSyncLock(fn) {
  const run = syncLock.then(fn, fn);
  syncLock = run.catch(() => {});
  return run;
}

function syncPush(now = Date.now()) {
  return withSyncLock(async () => {
    if (!(await syncEnabled())) return { skipped: true };
    const dev = await getDeviceId();
    const { channels = [], settings = {}, achievements = {}, achState = {}, watchLog = {}, syncState = {} } = await chrome.storage.local.get(["channels", "settings", "achievements", "achState", "watchLog", "syncState"]);
    const writes = {};
    const removes = [];

    const ch = minimalChannels(channels);
    const chH = syncHash(ch);
    if (chH !== syncState.chHash) {
      syncState.chHash = chH;
      syncState.chEditAt = now;
    }
    if (syncState.chPushed !== chH && syncState.firstDone) {
      const text = JSON.stringify(ch);
      const n = Math.max(1, Math.ceil(text.length / SYNC_CHUNK));
      for (let i = 0; i < n; i++) writes["sc_ch_" + i] = text.slice(i * SYNC_CHUNK, (i + 1) * SYNC_CHUNK);
      writes.sc_chn = { n, u: syncState.chEditAt || now, h: chH, by: dev };
      for (let i = n; i < (syncState.chChunks || 0); i++) removes.push("sc_ch_" + i);
      syncState.chChunks = n;
      syncState.chPushed = chH;
    }

    const st = pickSettings(settings);
    const stH = syncHash(st);
    if (stH !== syncState.setHash) {
      syncState.setHash = stH;
      syncState.setEditAt = now;
    }
    if (syncState.setPushed !== stH && syncState.firstDone) {
      writes.sc_set = { u: syncState.setEditAt || now, s: st, by: dev };
      syncState.setPushed = stH;
    }

    const ach = {};
    for (const [id, t] of Object.entries(achievements)) if (!id.startsWith("c-")) ach[id] = t;
    const achPayload = { a: ach, st: achStateSummary(achState) };
    const achH = syncHash(achPayload);
    if (achH !== syncState.achPushed) {
      writes["sc_ach_" + dev] = achPayload;
      syncState.achPushed = achH;
    }

    const days = ownDailyTotals(watchLog, now);
    const dH = syncHash(days);
    if (dH !== syncState.devPushed) {
      writes["sc_dev_" + dev] = { u: now, d: days };
      syncState.devPushed = dH;
    }

    if (Object.keys(writes).length) await chrome.storage.sync.set(writes);
    if (removes.length) await chrome.storage.sync.remove(removes);
    syncState.lastPush = Object.keys(writes).length ? now : syncState.lastPush || 0;
    await chrome.storage.local.set({ syncState });
    return { wrote: Object.keys(writes) };
  });
}

function syncPull(now = Date.now()) {
  return withSyncLock(async () => {
    if (!(await syncEnabled())) return { skipped: true };
    const dev = await getDeviceId();
    const remote = await chrome.storage.sync.get(null);
    const local = await chrome.storage.local.get(["channels", "settings", "achievements", "achState", "watchLog", "syncState"]);
    const syncState = local.syncState || {};
    const patch = {};
    let achChanged = false;

    // canais
    let applyChannels = null;
    const meta = remote.sc_chn;
    if (meta && meta.n > 0) {
      let text = "";
      for (let i = 0; i < meta.n; i++) text += remote["sc_ch_" + i] || "";
      let list = null;
      try {
        list = JSON.parse(text);
      } catch (_) {}
      const firstMerge = !syncState.firstDone;
      if (Array.isArray(list) && (firstMerge || (meta.u || 0) > (syncState.chEditAt || 0))) {
        const clean = list.filter((r) => r && typeof r.handle === "string" && r.handle.length <= 100 && ["youtube", "twitch", "kick"].includes(r.platform || "youtube"));
        applyChannels = (cur) => {
          const channels = cur.slice();
          const byKey = new Map(channels.map((c) => [syncChannelKey(c), c]));
          const keys = new Set();
          for (const r of clean) {
            const k = syncChannelKey(r);
            keys.add(k);
            const mine = byKey.get(k);
            if (mine) {
              if (!firstMerge) for (const f of SYNC_CH_FIELDS) if (f in r && f !== "handle" && f !== "platform") mine[f] = r[f];
            } else {
              const c = { ...r, platform: r.platform || "youtube", isLive: false, lastChecked: null, addedAt: now };
              channels.push(c);
              byKey.set(k, c);
            }
          }
          return firstMerge ? channels : channels.filter((c) => keys.has(syncChannelKey(c)));
        };
        syncState.chEditAt = firstMerge ? now : meta.u;
      }
    }

    // configurações
    const rs = remote.sc_set;
    if (rs && rs.s && (rs.u || 0) > (syncState.setEditAt || 0) && syncState.firstDone) {
      const settings = { ...(local.settings || {}) };
      for (const k of SYNC_SETTING_FIELDS) if (k in rs.s) settings[k] = rs.s[k];
      patch.settings = settings;
      syncState.setHash = syncHash(pickSettings(settings));
      syncState.setEditAt = rs.u;
      syncState.setPushed = syncState.setHash;
    }

    // conquistas e tempo de outros computadores
    let achievements = local.achievements || {};
    let achState = local.achState || {};
    const watchLog = local.watchLog || {};
    let watchChanged = false;
    const seenDevs = new Set();
    for (const [key, val] of Object.entries(remote)) {
      if (key.startsWith("sc_ach_") && key !== "sc_ach_" + dev && val) {
        const m = mergeAchievements(achievements, val.a);
        achievements = m.merged;
        if (m.changed) achChanged = true;
        const ms = mergeAchState(achState, val.st);
        achState = ms.state;
        if (ms.changed) achChanged = true;
      }
      if (key.startsWith("sc_dev_") && key !== "sc_dev_" + dev && val && val.d) {
        const other = key.slice(7);
        if (!/^[a-z0-9]{4,16}$/.test(other)) continue;
        seenDevs.add(other);
        const rk = REMOTE_PREFIX + other;
        const clean = {};
        for (const [d, v] of Object.entries(val.d)) if (/^\d{4}-\d{2}-\d{2}$/.test(d) && v > 0) clean[d] = Math.min(Number(v), 1440);
        const old = watchLog[rk] || {};
        const merged = { ...old, ...clean };
        if (JSON.stringify(merged) !== JSON.stringify(old)) {
          watchLog[rk] = merged;
          watchChanged = true;
        }
      }
    }
    if (achChanged) {
      patch.achievements = achievements;
      patch.achState = achState;
    }
    if (watchChanged) patch.watchLog = watchLog;

    syncState.firstDone = true;
    syncState.lastPull = now;
    syncState.devices = seenDevs.size;
    const remoteWatch = patch.watchLog;
    delete patch.watchLog;
    if (applyChannels) {
      const { channels: cur = [] } = await chrome.storage.local.get("channels");
      const next = applyChannels(cur);
      const h = syncHash(minimalChannels(next));
      if (h !== syncHash(minimalChannels(cur))) patch.channels = next;
      syncState.chHash = h;
      if (meta && h === meta.h) syncState.chPushed = h;
    }
    patch.syncState = syncState;
    await chrome.storage.local.set(patch);
    if (remoteWatch) {
      await withHistoryLock(async () => {
        const { watchLog: cur = {} } = await chrome.storage.local.get("watchLog");
        for (const [k, v] of Object.entries(remoteWatch)) if (k.startsWith(REMOTE_PREFIX)) cur[k] = v;
        await chrome.storage.local.set({ watchLog: cur });
      });
    }
    return { applied: Object.keys(patch), achChanged, watchChanged };
  });
}

let syncPushTimer = null;
function schedulePush(delay = 4000) {
  clearTimeout(syncPushTimer);
  syncPushTimer = setTimeout(() => syncPush().catch((e) => console.warn("Canais: sync falhou", e?.message || e)), delay);
}

async function syncNow() {
  const pulled = await syncPull();
  if (pulled && (pulled.achChanged || pulled.watchChanged) && typeof evaluateAchievements === "function") await evaluateAchievements().catch(() => {});
  const pushed = await syncPush();
  return { pulled, pushed };
}
