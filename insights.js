const INSIGHT_WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const HABIT_WINDOW_DAYS = 60;
const STREAK_MIN_WATCH = 10;
const STREAK_MIN_LIVE = 15;
const DAY_MS = 86400000;

function shiftedTime(ts) {
  const d = new Date(ts);
  let m = d.getHours() * 60 + d.getMinutes();
  let wd = d.getDay();
  if (m < 240) {
    m += 1440;
    wd = (wd + 6) % 7;
  }
  return { m, wd };
}

function computeHabit(sessions, now = Date.now()) {
  const since = now - HABIT_WINDOW_DAYS * DAY_MS;
  const recent = (sessions || []).filter((s) => s && s.start >= since && s.start <= now);
  if (recent.length < 3) return { enough: false, count: recent.length };
  const perDay = [0, 0, 0, 0, 0, 0, 0];
  const mins = [];
  for (const s of recent) {
    const { m, wd } = shiftedTime(s.start);
    perDay[wd]++;
    mins.push(m);
  }
  mins.sort((a, b) => a - b);
  const minutes = Math.round(mins[Math.floor(mins.length / 2)] / 15) * 15;
  const h = Math.floor(minutes / 60) % 24;
  const mm = minutes % 60;
  const time = mm ? `${h}h${String(mm).padStart(2, "0")}` : `${h}h`;
  const max = Math.max(...perDay);
  const days = perDay.map((c, i) => (c >= Math.max(1, Math.ceil(max * 0.4)) ? i : -1)).filter((i) => i >= 0);
  const ordered = [1, 2, 3, 4, 5, 6, 0].filter((i) => days.includes(i));
  let daysLabel;
  if (ordered.length >= 6) daysLabel = "quase todo dia";
  else if (ordered.join() === "1,2,3,4,5") daysLabel = "seg a sex";
  else daysLabel = ordered.map((i) => INSIGHT_WEEKDAYS[i]).join(", ");
  return {
    enough: true,
    count: recent.length,
    perDay,
    days,
    minutes,
    time,
    daysLabel,
    label: `costuma entrar ${daysLabel} · ~${time}`,
  };
}

function minutesUntilHabit(habit, now = Date.now()) {
  if (!habit || !habit.enough) return null;
  const { m, wd } = shiftedTime(now);
  if (!habit.days.includes(wd)) return null;
  return habit.minutes - m;
}

function computeStreak(sessions, now = Date.now()) {
  const list = (sessions || [])
    .filter((s) => s && s.start)
    .slice()
    .sort((a, b) => b.start - a.start);
  let count = 0;
  let freezes = [];
  let lastWatched = null;
  for (const s of list) {
    const watched = (s.watched || 0) >= STREAK_MIN_WATCH;
    const ongoing = !!s.now;
    const duration = ((ongoing ? now : s.end || s.start) - s.start) / 60000;
    if (watched) {
      count++;
      if (!lastWatched) lastWatched = s.start;
      continue;
    }
    if (ongoing) continue;
    if (duration < STREAK_MIN_LIVE) continue;
    const freezeOk = !freezes.some((f) => Math.abs(f - s.start) < 7 * DAY_MS);
    if (freezeOk) {
      freezes.push(s.start);
      continue;
    }
    break;
  }
  return { count, freezesUsed: freezes.length, lastWatched };
}

function insightDayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dailyTotals(watchLog) {
  const days = {};
  for (const map of Object.values(watchLog || {})) for (const [d, v] of Object.entries(map || {})) days[d] = (days[d] || 0) + (v || 0);
  return days;
}

function computeDayStreak(watchLog, now = Date.now(), minMinutes = 5) {
  const days = dailyTotals(watchLog);
  const has = (ts) => (days[insightDayKey(ts)] || 0) >= minMinutes;
  let cursor = now;
  if (!has(cursor)) cursor -= DAY_MS;
  let count = 0;
  const gaps = [];
  for (let i = 0; i < 4000; i++) {
    if (has(cursor)) {
      count++;
    } else {
      const okGap = count > 0 && !gaps.some((g) => Math.abs(g - cursor) < 7 * DAY_MS) && has(cursor - DAY_MS);
      if (!okGap) break;
      gaps.push(cursor);
    }
    cursor -= DAY_MS;
  }
  return count;
}

function computeWeekendStreak(watchLog, now = Date.now(), minMinutes = 5) {
  const days = dailyTotals(watchLog);
  const ok = (ts) => (days[insightDayKey(ts)] || 0) >= minMinutes;
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  const back = (d.getDay() + 1) % 7;
  let sat = d.getTime() - back * DAY_MS;
  let count = 0;
  let first = true;
  for (let i = 0; i < 300; i++) {
    const sun = sat + DAY_MS;
    const full = ok(sat) && ok(sun);
    if (full) count++;
    else if (!(first && sun >= now - DAY_MS)) break;
    first = false;
    sat -= 7 * DAY_MS;
  }
  return count;
}

function fmtHoursShort(min) {
  const h = min / 60;
  if (h >= 10) return `${Math.floor(h)}h`;
  if (h >= 1) return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1).replace(".", ",")}h`;
  return `${Math.floor(min)} min`;
}

const ACHIEVEMENT_GROUPS = [
  { id: "tempo", title: "Tempo" },
  { id: "dedicacao", title: "Dedicação" },
  { id: "chat", title: "Chat e likes" },
  { id: "especiais", title: "Especiais" },
  { id: "lendarias", title: "Lendárias" },
  { id: "p", get title() { return (PERK && PERK.g) || ""; } },
];

const OWL_MINUTES = 110;

function computeAchievements(data, now = Date.now()) {
  const watchLog = data.watchLog || {};
  const sessions = [
    ...(data.liveHistory || []),
    ...Object.values(data.openSessions || {}).map((s) => ({ ...s, now: true })),
  ];
  const ach = data.achState || {};
  const perKey = {};
  for (const [k, map] of Object.entries(watchLog)) perKey[k] = Object.values(map || {}).reduce((a, b) => a + (b || 0), 0);
  const total = Object.values(perKey).reduce((a, b) => a + b, 0);
  let bestKey = null;
  let bestMin = 0;
  const realKeys = Object.entries(perKey).filter(([k]) => !k.startsWith("remote:"));
  for (const [k, v] of realKeys) if (v > bestMin) (bestMin = v), (bestKey = k);
  const bestName = bestKey ? bestKey.split(":").slice(1).join(":") : "";
  const distinct = realKeys.filter(([, v]) => v >= 10).length;
  const platforms = new Set(realKeys.filter(([, v]) => v >= 10).map(([k]) => k.split(":")[0]));
  const dayStreak = computeDayStreak(watchLog, now);
  const weekendStreak = computeWeekendStreak(watchLog, now);
  const maxSession = sessions.reduce((m, s) => Math.max(m, s.watched || 0), 0);
  const punctual = sessions.filter((s) => s.firstWatchAt && s.start && s.firstWatchAt - s.start <= 5 * 60000 && (s.watched || 0) >= 10).length;
  const fullLive = sessions.some((s) => {
    if (s.now) return false;
    const dur = ((s.end || s.start) - s.start) / 60000;
    return dur >= 30 && (s.watched || 0) >= dur * 0.9;
  });
  let loyal = false;
  const byMonth = {};
  for (const s of sessions) {
    const dur = (((s.now ? now : s.end) || s.start) - s.start) / 60000;
    if (dur < 15) continue;
    const d = new Date(s.start);
    const k = `${(s.platform || "youtube")}:${s.handle}|${d.getFullYear()}-${d.getMonth()}`;
    const e = (byMonth[k] = byMonth[k] || { lives: 0, watched: 0 });
    e.lives++;
    if ((s.watched || 0) >= 10) e.watched++;
  }
  for (const e of Object.values(byMonth)) if (e.lives >= 4 && e.watched / e.lives >= 0.5) loyal = true;
  const msgs = (ach.messages && ach.messages.total) || 0;
  const nightOk = Object.values(ach.owlMin || {}).some((v) => v >= OWL_MINUTES);
  const morningOk = Object.values(ach.morningMin || {}).some((v) => v >= 10);
  const firstLive = sessions.some((s) => (s.watched || 0) >= 5) || total >= 5;
  const installedDays = ach.installedAt ? (now - ach.installedAt) / DAY_MS : 0;

  const list = [];
  const tier = (group, id, icon, title, value, target, fmt, desc) =>
    list.push({ group, id, icon, title, value, target, unlocked: value >= target, progress: `${fmt(Math.min(value, target))} de ${fmt(target)}`, desc });
  const single = (group, id, icon, title, unlocked, desc, progress) =>
    list.push({ group, id, icon, title, value: unlocked ? 1 : 0, target: 1, unlocked: !!unlocked, progress: progress || "", desc });

  [[600, "10 horas"], [6000, "100 horas"], [30000, "500 horas"], [60000, "1.000 horas"]].forEach(([t, title], i) =>
    tier("tempo", `total-${i + 1}`, `total-${i + 1}`, title, total, t, fmtHoursShort, "Tempo total de live assistida"));
  [[600, "10h num canal"], [3000, "50h num canal"], [6000, "100h num canal"], [30000, "500h num canal"]].forEach(([t, title], i) =>
    tier("tempo", `canal-${i + 1}`, `canal-${i + 1}`, title, bestMin, t, fmtHoursShort, bestName ? `Seu canal mais assistido: ${bestName}` : "Tempo num mesmo canal"));
  [[240, "Maratona 4h"], [480, "Maratona 8h"], [720, "Maratona 12h"]].forEach(([t, title], i) =>
    tier("tempo", `maratona-${i + 1}`, `maratona-${i + 1}`, title, maxSession, t, fmtHoursShort, "Tempo assistido numa mesma live"));
  [[10, "10 dias seguidos"], [30, "30 dias seguidos"], [100, "100 dias seguidos"], [365, "1 ano seguido"]].forEach(([t, title], i) =>
    tier("dedicacao", `seq-${i + 1}`, `seq-${i + 1}`, title, dayStreak, t, (v) => `${v}`, "Dias seguidos assistindo live (1 dia de folga por semana)"));
  [[5, "Explorador"], [15, "Explorador II"], [30, "Explorador III"]].forEach(([t, title], i) =>
    tier("dedicacao", `explorador-${i + 1}`, `explorador-${i + 1}`, title, distinct, t, (v) => `${v}`, `Canais diferentes assistidos (10 min ou mais)`));
  [[100, "Tagarela"], [1000, "Tagarela II"], [10000, "Tagarela III"]].forEach(([t, title], i) =>
    tier("chat", `tagarela-${i + 1}`, `tagarela-${i + 1}`, title, msgs, t, (v) => v.toLocaleString("pt-BR"), "Mensagens enviadas no chat das lives"));
  single("chat", "primeirapalavra", "primeirapalavra", "Primeira palavra", msgs >= 1, "Mandou sua primeira mensagem num chat");
  const likes = Math.max((ach.likedLives || []).length, ach.likesRemote || 0);
  [[1, "Primeiro like"], [10, "10 likes"], [100, "100 likes"]].forEach(([t, title], k) =>
    tier("chat", `curtida-${k + 1}`, `curtida-${k + 1}`, title, likes, t, (v) => `${v}`, "Lives curtidas no YouTube (conta 1 por live)"));

  single("especiais", "primeira", "primeira", "Primeira de todas", firstLive, "Assistiu sua primeira live com o Seus Canais");
  single("especiais", "coruja", "coruja", "Coruja", nightOk, "Assistiu live das 2h às 4h da manhã");
  single("especiais", "madrugador", "madrugador", "Madrugador", morningOk, "Assistiu live entre 5h e 8h da manhã");
  tier("especiais", "pontual", "pontual", "Pontual", punctual, 10, (v) => `${v}`, "Entrou nos primeiros 5 minutos de live");
  single("especiais", "comecoaofim", "comecoaofim", "Do começo ao fim", fullLive, "Assistiu 90% de uma live inteira");
  single("especiais", "fiel", "fiel", "Fiel", loyal, "Assistiu metade das lives de um canal num mês");
  tier("especiais", "tresmundos", "tresmundos", "Três mundos", platforms.size, 3, (v) => `${v}`, "Assistiu live no YouTube, na Twitch e na Kick");
  tier("especiais", "fimdesemana", "fimdesemana", "Fim de semana", weekendStreak, 4, (v) => `${v}`, "Assistiu sábado e domingo, 4 fins de semana seguidos");
  tier("especiais", "cacadorvideos", "cacadorvideos", "Caçador de vídeos", ach.videoOpens || 0, 25, (v) => `${v}`, "Abriu vídeos novos pela notificação");
  tier("especiais", "nuncaperde", "nuncaperde", "Nunca perde", ach.quickOpens || 0, 10, (v) => `${v}`, "Abriu a live até 2 min depois do aviso");
  single("especiais", "virada", "virada", "Virada", !!ach.virada, "Estava assistindo live na virada do ano");
  single("especiais", "diahistorico", "diahistorico", "Dia histórico", !!ach.historic, "Assistiu uma live no recorde de espectadores do canal (Kick)");
  tier("especiais", "aniversario", "aniversario", "Aniversário", Math.floor(installedDays), 365, (v) => `${v}`, "1 ano usando o Seus Canais");

  const lvlNow = typeof computeLevel === "function" ? computeLevel(data).level : 1;
  tier("lendarias", "lendaria-bronze", "lendaria-bronze", "Lendária de Bronze", lvlNow, 50, (v) => `nível ${v}`, "Chegou ao nível 50");
  tier("lendarias", "lendaria-prata", "lendaria-prata", "Lendária de Prata", lvlNow, 75, (v) => `nível ${v}`, "Chegou ao nível 75");
  tier("lendarias", "lendaria-ouro", "lendaria-ouro", "Lendária de Ouro", lvlNow, 100, (v) => `nível ${v}`, "Chegou ao nível 100");

  const stored = data.achievements || {};
  const allOthers = list.every((a) => a.unlocked || stored[a.id]);
  list.push(perkify({ group: "p", id: PERK_ID, icon: "level", title: "???", value: allOthers ? 1 : 0, target: 1, unlocked: allOthers, progress: "", desc: "", hidden: true }));
  return list;
}

function computeChannelAchievements(key, data, now = Date.now()) {
  const days = (data.watchLog || {})[key] || {};
  const total = Object.values(days).reduce((a, b) => a + (b || 0), 0);
  const sessions = [
    ...(data.liveHistory || []).filter((s) => `${s.platform || "youtube"}:${s.handle}` === key),
    ...Object.entries(data.openSessions || {}).filter(([k]) => k === key).map(([, s]) => ({ ...s, now: true })),
  ];
  const maxSession = sessions.reduce((m, s) => Math.max(m, s.watched || 0), 0);
  let bestStreak = 0;
  const sorted = sessions.slice().sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i++) {
    const st = computeStreak(sorted.slice(0, i + 1), now).count;
    if (st > bestStreak) bestStreak = st;
  }
  const msgs = (((data.achState || {}).messages || {}).perKey || {})[key] || 0;
  const punctual = sessions.filter((s) => s.firstWatchAt && s.start && s.firstWatchAt - s.start <= 5 * 60000 && (s.watched || 0) >= 10).length;
  const fullLive = sessions.some((s) => {
    if (s.now) return false;
    const dur = ((s.end || s.start) - s.start) / 60000;
    return dur >= 30 && (s.watched || 0) >= dur * 0.9;
  });
  const byMonth = {};
  for (const s of sessions) {
    const dur = (((s.now ? now : s.end) || s.start) - s.start) / 60000;
    if (dur < 15) continue;
    const d = new Date(s.start);
    const e = (byMonth[`${d.getFullYear()}-${d.getMonth()}`] = byMonth[`${d.getFullYear()}-${d.getMonth()}`] || { lives: 0, watched: 0 });
    e.lives++;
    if ((s.watched || 0) >= 10) e.watched++;
  }
  const loyal = Object.values(byMonth).some((e) => e.lives >= 4 && e.watched / e.lives >= 0.5);

  const list = [];
  const tier = (group, id, icon, title, value, target, fmt, desc) =>
    list.push({ group, id, icon, title, value, target, unlocked: value >= target, progress: `${fmt(Math.min(value, target))} de ${fmt(target)}`, desc });
  const single = (group, id, icon, title, unlocked, desc) =>
    list.push({ group, id, icon, title, value: unlocked ? 1 : 0, target: 1, unlocked: !!unlocked, progress: "", desc });
  [[600, "10 horas"], [3000, "50 horas"], [6000, "100 horas"], [30000, "500 horas"]].forEach(([t, title], i) =>
    tier("tempo", `c-tempo-${i + 1}`, `canal-${i + 1}`, title, total, t, fmtHoursShort, "Tempo assistido neste canal"));
  [[240, "Maratona 4h"], [480, "Maratona 8h"], [720, "Maratona 12h"]].forEach(([t, title], i) =>
    tier("tempo", `c-maratona-${i + 1}`, `maratona-${i + 1}`, title, maxSession, t, fmtHoursShort, "Numa mesma live deste canal"));
  [[10, "10 lives seguidas"], [30, "30 lives seguidas"], [100, "100 lives seguidas"]].forEach(([t, title], i) =>
    tier("dedicacao", `c-seq-${i + 1}`, `seq-${i + 1}`, title, bestStreak, t, (v) => `${v}`, "Lives seguidas deste canal (1 falta por semana)"));
  tier("dedicacao", "c-pontual", "pontual", "Pontual", punctual, 10, (v) => `${v}`, "Entrou nos primeiros 5 min de live");
  single("dedicacao", "c-comecoaofim", "comecoaofim", "Do começo ao fim", fullLive, "Assistiu 90% de uma live inteira");
  single("dedicacao", "c-fiel", "fiel", "Fiel", loyal, "Metade das lives deste canal num mês");
  single("chat", "c-primeirapalavra", "primeirapalavra", "Primeira palavra", msgs >= 1, "Primeira mensagem no chat deste canal");
  [[100, "Tagarela"], [1000, "Tagarela II"], [10000, "Tagarela III"]].forEach(([t, title], i) =>
    tier("chat", `c-tagarela-${i + 1}`, `tagarela-${i + 1}`, title, msgs, t, (v) => v.toLocaleString("pt-BR"), "Mensagens no chat deste canal"));
  return { list, total, sessions: sessions.length, msgs };
}

const XP_PER_ACHIEVEMENT = 30;
const XP_PER_CHALLENGE = 60;
const RANKS = [
  [1, "Novato"],
  [5, "Espectador"],
  [10, "Frequente"],
  [15, "Fã"],
  [20, "Veterano"],
  [30, "Lenda"],
];

function xpForLevel(level) {
  return level <= 1 ? 0 : Math.round(60 * Math.pow(level, 1.6));
}

function computeLevel(data) {
  const total = Object.values(data.watchLog || {}).reduce(
    (a, map) => a + Object.values(map || {}).reduce((x, y) => x + (y || 0), 0),
    0
  );
  const achCount = Object.keys(data.achievements || {}).filter((k) => !k.startsWith("c-")).length;
  const challenges = Object.values((data.achState || {}).challengesDone || {}).reduce((a, list) => a + (list || []).length, 0);
  const xp = Math.floor(total + achCount * XP_PER_ACHIEVEMENT + challenges * XP_PER_CHALLENGE);
  let level = 1;
  while (xp >= xpForLevel(level + 1) && level < 200) level++;
  const cur = xpForLevel(level);
  const next = xpForLevel(level + 1);
  let rank = RANKS[0][1];
  for (const [min, name] of RANKS) if (level >= min) rank = name;
  return { xp, level, rank, cur, next, progress: (xp - cur) / Math.max(1, next - cur) };
}

const ACCENTS = [
  { id: "iris", name: "Íris", level: 1, light: "#5b4bff", dark: "#8b7fff" },
  { id: "ciano", name: "Ciano", level: 5, light: "#0a8fa8", dark: "#3ee8ff" },
  { id: "vermelho", name: "Vermelho", level: 10, light: "#d6303a", dark: "#ff5a5f" },
  { id: "magenta", name: "Magenta", level: 15, light: "#d81b60", dark: "#ff5c9d" },
  { id: "menta", name: "Menta", level: 20, light: "#0f8a64", dark: "#3fd9a8" },
  { id: "grafite", name: "Grafite", level: 30, light: "#0b0c14", dark: "#f1f2f6" },
  { id: "bronze", name: "Bronze", badge: "lendaria-bronze", badgeName: "Lendária de Bronze", light: "#a8642e", dark: "#d99459" },
  { id: "prata", name: "Prata", badge: "lendaria-prata", badgeName: "Lendária de Prata", light: "#6f7a88", dark: "#c6cdd7" },
  { id: "ouro", name: "Ouro", badge: "lendaria-ouro", badgeName: "Lendária de Ouro", light: "#b07d10", dark: "#ecb93f" },
  { id: "p0", badge: "p0", badgeName: "???", hidden: true, get name() { return (PERK && PERK.an) || "???"; }, get light() { return (PERK && PERK.light) || "#5b4bff"; }, get dark() { return (PERK && PERK.dark) || "#8b7fff"; } },
];

const THEME_REWARDS = [
  { id: "meianoite", name: "Tema Meia-noite", desc: "Preto total, ótimo pra tela OLED", badge: "coruja", badgeName: "Coruja" },
  { id: "p0", badge: "p0", badgeName: "???", hidden: true, get name() { return (PERK && PERK.tn) || ""; }, get desc() { return (PERK && PERK.td) || ""; } },
];

const FRAME_REWARDS = [
  { id: "none", name: "Sem moldura", level: 1, desc: "Cartão sem borda" },
  { id: "neon", name: "Neon", level: 8, desc: "Borda ciano" },
  { id: "tricolor", name: "Tricolor", badge: "total-3", badgeName: "500 horas", desc: "Borda ciano, íris e magenta" },
  { id: "lenda", name: "Lenda", level: 30, desc: "Borda tricolor com borda magenta por fora" },
  { id: "bronze", name: "Bronze", badge: "lendaria-bronze", badgeName: "Lendária de Bronze", desc: "Borda de bronze" },
  { id: "prata", name: "Prata", badge: "lendaria-prata", badgeName: "Lendária de Prata", desc: "Borda de prata" },
  { id: "ouro", name: "Ouro", badge: "lendaria-ouro", badgeName: "Lendária de Ouro", desc: "Borda de ouro" },
];

const METAL_COLORS = {
  bronze: { base: "#c27a3e", dark: "#8a4f22", light: "#eaa56c" },
  prata: { base: "#b4bcc8", dark: "#6f7a88", light: "#eef1f5" },
  ouro: { base: "#e3ad2f", dark: "#a5720f", light: "#ffdc7d" },
};

function currentFrame(settings, levelInfo, achievements) {
  const f = FRAME_REWARDS.find((x) => x.id === (settings || {}).frame);
  return f && rewardUnlocked(f, levelInfo, achievements) ? f.id : "none";
}

function rewardUnlocked(reward, levelInfo, achievements) {
  if (reward.badge) return !!(achievements || {})[reward.badge];
  return levelInfo.level >= (reward.level || 1);
}

function weekStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

function weekId(ts) {
  return insightDayKey(weekStart(ts));
}

const CHALLENGE_POOL = [
  { id: "horas3", title: "Assista 3h de live", target: 180, unit: "min", calc: (w) => w.minutes },
  { id: "horas6", title: "Assista 6h de live", target: 360, unit: "min", calc: (w) => w.minutes },
  { id: "canais3", title: "Assista 3 canais diferentes", target: 3, unit: "", calc: (w) => w.channels },
  { id: "dias4", title: "Assista live em 4 dias diferentes", target: 4, unit: "", calc: (w) => w.days },
  { id: "pontual2", title: "Entre nos primeiros 5 min de 2 lives", target: 2, unit: "", calc: (w) => w.punctual },
  { id: "longa", title: "Fique 2h seguidas numa live", target: 120, unit: "min", calc: (w) => w.longest },
  { id: "inteira", title: "Assista uma live do começo ao fim", target: 1, unit: "", calc: (w) => w.full },
  { id: "chat20", title: "Mande 20 mensagens no chat", target: 20, unit: "", calc: (w) => w.messages, needsChat: true },
  { id: "fds", title: "Assista live no sábado e no domingo", target: 2, unit: "", calc: (w) => w.weekendDays },
];

function seededPick(seedStr, pool, n) {
  let h = 2166136261;
  for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const arr = pool.slice();
  const out = [];
  while (out.length < n && arr.length) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    const i = h % arr.length;
    const c = arr.splice(i, 1)[0];
    if (out.some((o) => o.id.startsWith("horas") && c.id.startsWith("horas"))) continue;
    out.push(c);
  }
  return out;
}

function weekStats(data, start, end) {
  const days = {};
  const channels = new Set();
  let minutes = 0;
  for (const [k, map] of Object.entries(data.watchLog || {})) {
    for (const [d, v] of Object.entries(map || {})) {
      const t = new Date(d + "T12:00:00").getTime();
      if (t < start || t >= end || !(v > 0)) continue;
      minutes += v;
      days[d] = (days[d] || 0) + v;
      if (v >= 10 && !k.startsWith("remote:")) channels.add(k);
    }
  }
  const sessions = [
    ...(data.liveHistory || []),
    ...Object.values(data.openSessions || {}).map((s) => ({ ...s, now: true })),
  ].filter((s) => s.start >= start - 12 * 3600000 && s.start < end);
  const punctual = sessions.filter((s) => s.firstWatchAt && s.firstWatchAt >= start && s.firstWatchAt - s.start <= 5 * 60000 && (s.watched || 0) >= 10).length;
  const longest = sessions.reduce((m, s) => Math.max(m, s.watched || 0), 0);
  const full = sessions.filter((s) => {
    if (s.now) return false;
    const dur = ((s.end || s.start) - s.start) / 60000;
    return dur >= 30 && (s.watched || 0) >= dur * 0.9;
  }).length;
  let messages = 0;
  for (const [d, n] of Object.entries(((data.achState || {}).messagesByDay) || {})) {
    const t = new Date(d + "T12:00:00").getTime();
    if (t >= start && t < end) messages += n;
  }
  const activeDays = Object.entries(days).filter(([, v]) => v >= 5);
  const weekendDays = activeDays.filter(([d]) => [0, 6].includes(new Date(d + "T12:00:00").getDay())).length;
  return { minutes, channels: channels.size, days: activeDays.length, punctual, longest, full, messages, weekendDays };
}

function computeChallenges(data, now = Date.now()) {
  const start = weekStart(now);
  const end = start + 7 * DAY_MS;
  const chatOn = ((data.settings || {}).countChat) !== false;
  const pool = CHALLENGE_POOL.filter((c) => chatOn || !c.needsChat);
  const picked = seededPick(weekId(now), pool, 3);
  const w = weekStats(data, start, end);
  const done = (((data.achState || {}).challengesDone || {})[weekId(now)]) || [];
  return {
    weekId: weekId(now),
    endsAt: end,
    items: picked.map((c) => {
      const value = c.calc(w);
      const fmt = (v) => (c.unit === "min" ? fmtHoursShort(v) : `${Math.floor(v)}`);
      return {
        id: c.id,
        title: c.title,
        value,
        target: c.target,
        done: done.includes(c.id) || value >= c.target,
        progress: `${fmt(Math.min(value, c.target))} de ${fmt(c.target)}`,
      };
    }),
  };
}

function computeRetro(data, start, end) {
  const perKey = {};
  const days = {};
  for (const [k, map] of Object.entries(data.watchLog || {})) {
    for (const [d, v] of Object.entries(map || {})) {
      const t = new Date(d + "T12:00:00").getTime();
      if (t < start || t >= end || !(v > 0)) continue;
      if (!k.startsWith("remote:")) perKey[k] = (perKey[k] || 0) + v;
      days[d] = (days[d] || 0) + v;
    }
  }
  let total = 0;
  for (const v of Object.values(days)) total += v;
  const top = Object.entries(perKey).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ key: k, name: k.split(":").slice(1).join(":"), platform: k.split(":")[0], minutes: v }));
  const sessions = (data.liveHistory || []).filter((s) => s.start >= start && s.start < end);
  const longest = sessions.reduce((m, s) => ((s.watched || 0) > (m ? m.watched : 0) ? s : m), null);
  const livesWatched = sessions.filter((s) => (s.watched || 0) >= 10).length;
  const achievements = Object.entries(data.achievements || {}).filter(([id, t]) => !id.startsWith("c-") && t >= start && t < end).map(([id]) => id);
  let bestDay = null;
  for (const [d, v] of Object.entries(days)) if (!bestDay || v > bestDay.minutes) bestDay = { day: d, minutes: v };
  let streak = 0;
  let run = 0;
  for (let t = start; t < end; t += DAY_MS) {
    if ((days[insightDayKey(t)] || 0) >= 5) streak = Math.max(streak, ++run);
    else run = 0;
  }
  return { total, top, days: Object.values(days).filter((v) => v >= 5).length, longest, livesWatched, achievements, bestDay, streak };
}


// ---- extras ----
const PERK_ID = "p0";
var PERK = null;
const PK_BLOB = "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";

function perkify(a) {
  if (!a || a.id !== PERK_ID || !PERK) return a;
  return { ...a, title: PERK.t, desc: PERK.d, kicker: PERK.k, svg: PERK.svg, src: "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(PERK.svg))) };
}

function badgeSrc(a) {
  return (a && a.src) || `badges/${a.icon}.svg`;
}

function perkOn(settings, achievements) {
  return !!PERK && !!(achievements || {})[PERK_ID] && (settings || {}).fx !== false;
}

async function loadPerk() {
  try {
    const { pk } = await chrome.storage.local.get("pk");
    if (pk) PERK = pk;
  } catch (_) {}
  return PERK;
}

async function openPerk() {
  if (PERK) return PERK;
  try {
    const seed = ACHIEVEMENT_SEED.slice().sort().join("|") + "#canais";
    const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    const bytes = Uint8Array.from(atob(PK_BLOB), (ch) => ch.charCodeAt(0));
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12));
    PERK = JSON.parse(new TextDecoder().decode(plain));
    await chrome.storage.local.set({ pk: PERK });
    return PERK;
  } catch (_) {
    return null;
  }
}

const ACHIEVEMENT_SEED = ["lendaria-bronze", "lendaria-prata", "lendaria-ouro"];

try {
  loadPerk();
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === "local" && ch.pk) PERK = ch.pk.newValue || null;
  });
} catch (_) {}
