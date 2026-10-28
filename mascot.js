const MASCOTS = [
  { id: "iris", name: "Íris", level: 1 },
  { id: "brasa", name: "Brasa", level: 10 },
  { id: "sininho", name: "Sininho", level: 25 },
];

const MASCOT_PALETTES = {
  iris: { body: "#8b7fff", dark: "#5b4bd6", wing: "#6c5ee8", membrane: "#b9b1ff", belly: "#e6e2ff", horn: "#f6f2ff", crest: "#ff5c9d", cheek: "#ff8fb8", eye: "#1b1533", collar: "#ff5c9d", bell: "#e6e8ef" },
  brasa: { body: "#34cfe0", dark: "#16889a", wing: "#1fa9bb", membrane: "#ff8fbd", belly: "#dcfbff", horn: "#ffffff", crest: "#ff5c9d", cheek: "#ff8fb8", eye: "#0e2a30", collar: "#ff5c9d", bell: "#e6e8ef" },
  sininho: { body: "#5a3f94", dark: "#2c1d4d", wing: "#3f2a6e", membrane: "#8b7fff", belly: "#d2c6ff", horn: "#efe6ff", crest: "#ff5c9d", cheek: "#ff8fb8", eye: "#120b22", collar: "#ff5c9d", bell: "#e6e8ef" },
};

function mascotUnlocked(m, levelInfo) {
  return (levelInfo ? levelInfo.level : 1) >= (m.level || 1);
}

function currentMascot(settings, levelInfo) {
  const s = settings || {};
  if (s.hideMascot) return null;
  const m = MASCOTS.find((x) => x.id === s.mascot) || MASCOTS[0];
  return mascotUnlocked(m, levelInfo) ? m.id : MASCOTS[0].id;
}

function mascotSvg(variant, mood = "normal", size = 64) {
  const k = MASCOT_PALETTES[variant] || MASCOT_PALETTES.iris;
  const party = mood === "festa";
  const wave = mood === "acenando";
  const sleep = mood === "dormindo";
  const anim = party ? "dg-party" : wave ? "dg-wave" : sleep ? "dg-sleep" : "dg-idle";
  const wing = `<g class="dg-wing"><path d="M72 116 Q46 74 26 50 Q16 72 26 84 Q18 98 34 104 Q30 118 48 120 Q54 130 70 128 Z" fill="${k.wing}"/><path d="M66 118 Q48 92 32 70 Q28 82 34 88 Q30 98 40 102 Q40 112 52 114 Q58 122 66 122 Z" fill="${k.membrane}"/><path d="M72 116 Q46 74 26 50" stroke="${k.dark}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M68 114 L30 86 M68 116 L38 104 M68 120 L50 120" stroke="${k.dark}" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M26 50 L20 42 L30 46 Z" fill="${k.dark}"/></g>`;
  const eyes = sleep
    ? `<g stroke="${k.eye}" stroke-width="4" fill="none" stroke-linecap="round"><path d="M69 80 Q78 88 87 80"/><path d="M113 80 Q122 88 131 80"/></g>`
    : party || wave
    ? `<g stroke="${k.eye}" stroke-width="4" fill="none" stroke-linecap="round"><path d="M69 84 Q78 72 87 84"/><path d="M113 84 Q122 72 131 84"/></g>`
    : `<g class="dg-eyes"><ellipse cx="78" cy="80" rx="9.5" ry="11.5" fill="${k.eye}"/><ellipse cx="122" cy="80" rx="9.5" ry="11.5" fill="${k.eye}"/><circle cx="81.5" cy="75.5" r="3.6" fill="#fff"/><circle cx="125.5" cy="75.5" r="3.6" fill="#fff"/></g>`;
  const mouth = party
    ? `<path d="M90 108 Q100 126 110 108 Z" fill="${k.eye}"/><path d="M95 114 Q100 120 105 114 Z" fill="${k.cheek}"/>`
    : `<path d="M92 110 Q100 116 108 110" stroke="${k.eye}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  const armL = party
    ? `<ellipse cx="52" cy="112" rx="9" ry="15" transform="rotate(-35 52 112)" fill="${k.dark}"/>`
    : `<ellipse cx="62" cy="142" rx="9" ry="14" fill="${k.dark}"/>`;
  const armR = party || wave
    ? `<g class="dg-arm-wave"><ellipse cx="148" cy="112" rx="9" ry="15" transform="rotate(35 148 112)" fill="${k.dark}"/></g>`
    : `<ellipse cx="138" cy="142" rx="9" ry="14" fill="${k.dark}"/>`;
  const crest = variant === "brasa" ? `<path d="M82 46 L90 22 L98 42 L106 16 L114 42 L122 26 L122 48 Z" fill="${k.crest}"/>` : "";
  const collar =
    variant === "sininho"
      ? `<path d="M74 122 Q100 132 126 122 L126 130 Q100 140 74 130 Z" fill="${k.collar}"/><circle cx="100" cy="140" r="9" fill="${k.bell}" stroke="${k.dark}" stroke-width="2.5"/><path d="M94 143 L106 143" stroke="${k.dark}" stroke-width="2" stroke-linecap="round"/><circle cx="100" cy="146" r="2" fill="${k.dark}"/>`
      : "";
  const zzz = sleep
    ? `<g fill="${k.membrane}" font-family="Segoe UI, system-ui, sans-serif" font-weight="900"><text class="dg-z1" x="140" y="50" font-size="34">z</text><text class="dg-z2" x="166" y="24" font-size="24">z</text></g>`
    : "";
  const confetti = party
    ? `<g><circle class="dg-c" cx="30" cy="40" r="5" fill="#3ee8ff"/><rect class="dg-c dg-c2" x="160" y="30" width="10" height="10" rx="2" fill="#ff5c9d"/><circle class="dg-c dg-c3" cx="178" cy="66" r="4" fill="#8b7fff"/><rect class="dg-c dg-c2" x="18" y="74" width="9" height="9" rx="2" fill="#3fd9a8"/><circle class="dg-c dg-c3" cx="44" cy="18" r="3.5" fill="#ff5c9d"/></g>`
    : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" class="dg ${anim}" width="${size}" height="${size}" viewBox="0 0 200 200" aria-hidden="true" style="overflow:visible">` +
    `<g class="dg-all">` +
    `<path d="M138 150 C172 152 186 124 174 100 C190 108 196 132 184 150 C172 166 150 170 132 162 Z" fill="${k.body}"/>` +
    `<path d="M170 98 L186 92 L180 108 Z" fill="${k.dark}"/>` +
    wing +
    `<g transform="translate(200 0) scale(-1 1)">${wing}</g>` +
    `<ellipse cx="100" cy="144" rx="46" ry="40" fill="${k.body}"/>` +
    `<ellipse cx="100" cy="152" rx="28" ry="26" fill="${k.belly}"/>` +
    `<path d="M84 140 Q100 146 116 140 M82 152 Q100 158 118 152 M86 164 Q100 169 114 164" stroke="${k.dark}" stroke-opacity=".25" stroke-width="2.5" fill="none" stroke-linecap="round"/>` +
    `<ellipse cx="78" cy="182" rx="15" ry="9" fill="${k.dark}"/><ellipse cx="122" cy="182" rx="15" ry="9" fill="${k.dark}"/>` +
    armL +
    armR +
    crest +
    `<ellipse cx="100" cy="84" rx="50" ry="44" fill="${k.body}"/>` +
    `<path d="M70 50 Q60 26 76 18 Q80 36 86 46 Z" fill="${k.horn}" stroke="${k.dark}" stroke-width="3" stroke-linejoin="round"/><path d="M130 50 Q140 26 124 18 Q120 36 114 46 Z" fill="${k.horn}" stroke="${k.dark}" stroke-width="3" stroke-linejoin="round"/>` +
    `<ellipse cx="100" cy="102" rx="24" ry="15" fill="${k.belly}"/>` +
    `<circle cx="93" cy="98" r="2.2" fill="${k.dark}"/><circle cx="107" cy="98" r="2.2" fill="${k.dark}"/>` +
    `<ellipse cx="64" cy="98" rx="8" ry="5" fill="${k.cheek}" fill-opacity=".6"/><ellipse cx="136" cy="98" rx="8" ry="5" fill="${k.cheek}" fill-opacity=".6"/>` +
    eyes +
    mouth +
    collar +
    `</g>` +
    zzz +
    confetti +
    `</svg>`
  );
}
