// pieces.js — mélodies intégrées, générateur d'exercices et parser de notation.
// Notation collable : une ligne = une voix ; "tempo=90" fixe le tempo ;
// token = "Do4:2" en soit 1 temps ; "barre |" ignorée ; "r:1" = silence.

import { parseNoteName } from './midi.js';

const SONGS = {
  'Au clair de la lune': { bpm: 80, voices: ['C4:1 C4:1 C4:1 D4:1 E4:2 D4:2 C4:1 E4:1 D4:1 D4:1 C4:2'] },
  'Ah ! vous dirai-je, maman': {
    bpm: 100,
    voices: [
      'C4:1 C4:1 G4:1 G4:1 A4:1 A4:1 G4:2 F4:1 F4:1 E4:1 E4:1 D4:1 D4:1 C4:2',
      'C3:2 G2:2 C3:2 G2:2 F2:2 C3:2 G2:2 C3:2 F2:2 C3:2 C3:2 F2:2 G2:2 C3:2',
    ],
  },
  'Ode à la joie (Beethoven)': {
    bpm: 96,
    voices: [
      'E4:1 E4:1 F4:1 G4:1 G4:1 F4:1 E4:1 D4:1 C4:1 C4:1 D4:1 E4:1 E4:1.5 D4:0.5 D4:2',
      'C3:2 C3:2 G2:2 C3:2 F2:2 C3:2 G2:2 G2:2',
    ],
  },
  'Lettre à Élise (ouverture)': {
    bpm: 90,
    voices: [
      'E5:.5 D#5:.5 E5:.5 D#5:.5 E5:.5 B4:.5 D5:.5 C5:.5 A4:.75 | r:.25 C4:.5 E4:.5 A4:.5 B4:.75 r:.25 E4:.5 G#4:.5 B4:.5 C5:.75 r:.25 E4:.5 E5:.5 D#5:.5 E5:.5 D#5:.5 E5:.5 B4:.5 D5:.5 C5:.5 A4:.75 | r:.25 C4:.5 E4:.5 A4:.5 B4:.75 r:.25 E4:.5 C5:.5 B4:.5 A4:1',
      'A2:.5 E3:.5 A3:.5 | E2:.5 E3:.5 G#3:.5 | A2:.5 E3:.5 A3:.5 | E2:.5 E3:.5 G#3:.5',
    ],
  },
};

export const BUILTIN_PIECES = Object.keys(SONGS);

export function buildBuiltinPiece(title) {
  const song = SONGS[title];
  if (!song) throw new Error(`Morceau inconnu: ${title}`);
  return parseNotation(`tempo=${song.bpm}\n${song.voices.join('\n')}`);
}

export const SCALES = {
  majeur: [0, 2, 4, 5, 7, 9, 11, 12],
  mineur: [0, 2, 3, 5, 7, 8, 10, 12],
  pentatonique: [0, 2, 4, 7, 9, 12],
  blues: [0, 3, 5, 6, 7, 10, 12],
  'blues majeur': [0, 2, 3, 5, 6, 9, 12],
  dorien: [0, 2, 3, 5, 7, 9, 10, 12],
  mixolydien: [0, 2, 4, 5, 7, 9, 10, 12],
  'bebop dominant': [0, 2, 4, 5, 7, 9, 10, 11, 12],
  'altérée (superlocrien)': [0, 1, 3, 4, 6, 8, 10, 12],
  'lydien dominant': [0, 2, 4, 6, 7, 9, 10, 12],
  'ton entier': [0, 2, 4, 6, 8, 10, 12],
  'diminuée (h-ton)': [0, 1, 3, 4, 6, 7, 9, 10, 12],
};

export const SCALE_NAMES = Object.keys(SCALES);

export const CHORD_TYPES = {
  'maj7': [0, 4, 7, 11],
  '7': [0, 4, 7, 10],
  'm7': [0, 3, 7, 10],
  'm7b5': [0, 3, 6, 10],
  'dim7': [0, 3, 6, 9],
  '6': [0, 4, 7, 9],
  'm6': [0, 3, 7, 9],
  '9': [0, 4, 7, 10, 14],
  'maj9': [0, 4, 7, 11, 14],
  'm9': [0, 3, 7, 10, 14],
  '13': [0, 4, 7, 10, 21],
  '7sus4': [0, 5, 7, 10],
  '7#9': [0, 4, 7, 10, 15],
  '7b9': [0, 4, 7, 10, 13],
  'aug7': [0, 4, 8, 10],
};
export const CHORD_NAMES = Object.keys(CHORD_TYPES).filter((k) => CHORD_TYPES[k]);

export const PROGRESSION_NAMES = [
  'Blues 12 mesures',
  'Blues rapide (changement immédiat)',
  'Blues 8 mesures',
  'Blues mineur 12 mesures',
  'ii-V-I (12 tonalités)',
  'ii-V-I (montée chromatique)',
  'ii-V-i mineur (12 tonalités)',
  'Turnaround I-vi-ii-V',
  'Turnaround (dominantes) I-VI7-ii7-V7',
  'Rhythm changes (section A)',
  'Pont rhythm changes (dominantes en cycle)',
  'Chaîne de ii-V (Satin Doll)',
  'Backdoor ii-V (bVII7 → I)',
  'Vamp dorien (So What)',
  'Cycle chromatique (Giant Steps)',
  'Blue Bossa (grille)',
];

const DEGREES = {
  'Do': 0, 'Do#': 1, 'Réb': 1, 'Ré': 2, 'Mib': 3, 'Mi': 4, 'Fa': 5,
  'Fa#': 6, 'Solb': 6, 'Sol': 7, 'Lab': 8, 'La': 9, 'Sib': 10, 'Si': 11,
};

function nami(m) {
  const N = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${N[m % 12]}${Math.floor(m / 12) - 1}`;
}

export function buildExercise({ type, key = 'Do', mode = 'majeur', bpm = 80 }) {
  if (!(mode in SCALES)) throw new Error(`Gamme inconnue: ${mode}`);
  if (!(key in DEGREES)) throw new Error(`Tonalité inconnue: ${key}`);
  const base = 12 * 4 + DEGREES[key]; // octave 4
  const ivals = SCALES[mode];
  const tokens = [];
  if (type === 'Gammes') {
    for (const i of ivals) tokens.push(`${nami(base + i)}:1`);
    for (let j = ivals.length - 2; j >= 0; j--) tokens.push(`${nami(base + ivals[j])}:1`);
  } else if (type === 'Arpèges') {
    const d = ivals.filter((x) => x < 12);
    let seq;
    if (d.length >= 7) {
      seq = [d[0], d[2], d[4], d[6], d[0] + 12, d[2] + 12, d[4] + 12, d[6] + 12, d[4] + 12, d[2] + 12, d[0] + 12, d[6], d[4], d[2], d[0]];
    } else {
      const fifth = d[4] ?? d[0] + 12;
      seq = [d[0], d[2], fifth, d[0] + 12, d[2] + 12, fifth + 12, fifth, d[2], d[0]];
    }
    for (const i of seq) tokens.push(`${nami(base + i)}:1`);
  } else {
    throw new Error(`Exercice inconnu: ${type}`);
  }
  return parseNotation(`tempo=${bpm}\n${tokens.join(' ')}`);
}

export function buildChordPiece({ root = 'Do', type = '7', bpm = 90 } = {}) {
  if (!(type in CHORD_TYPES)) throw new Error(`Accord inconnu: ${type}`);
  if (!(root in DEGREES)) throw new Error(`Tonalité inconnue: ${root}`);
  const base = 48 + DEGREES[root]; // octave 3
  const ivs = CHORD_TYPES[type];
  const spb = 60 / bpm;
  const notes = [];
  const push = (m, beat, dur, vel = 82) => {
    if (m >= 21 && m <= 108) notes.push({ m, start: beat * spb, dur: dur * spb, vel });
  };
  for (const iv of ivs) push(base + iv, 0, 2);
  let t = 2.2;
  for (const iv of ivs) { push(base + iv, t, 0.7); t += 0.75; }
  for (let j = ivs.length - 2; j >= 0; j--) { push(base + ivs[j], t, 0.7); t += 0.75; }
  const end = t + 0.4;
  for (const iv of ivs) push(base + iv, end, 2);
  const duration = notes.reduce((d, n) => Math.max(d, n.start + n.dur), 0);
  notes.sort((a, b) => a.start - b.start || a.m - b.m);
  return { bpm, duration, notes };
}

export function buildProgressionPiece(progression, rootName = 'Do', { bpm = 100 } = {}) {
  if (!PROGRESSION_NAMES.includes(progression)) throw new Error(`Progression inconnue: ${progression}`);
  if (!(rootName in DEGREES)) throw new Error(`Tonalité inconnue: ${rootName}`);
  const base = 48 + DEGREES[rootName];
  let specs; // [offset, type, beats]
  if (progression === 'Blues 12 mesures') {
    specs = [[0,'7',4],[0,'7',4],[0,'7',4],[0,'7',4],[5,'7',4],[5,'7',4],[0,'7',4],[0,'7',4],[7,'7',4],[5,'7',4],[0,'7',4],[7,'7',4]];
  } else if (progression === 'Blues mineur 12 mesures') {
    specs = [[0,'m7',4],[0,'m7',4],[0,'m7',4],[0,'m7',4],[5,'m7',4],[5,'m7',4],[0,'m7',4],[0,'m7',4],[8,'7#9',4],[7,'7',4],[0,'m7',4],[7,'7',4]];
  } else if (progression === 'ii-V-I (12 tonalités)') {
    specs = [];
    for (const t of [0, 5, 10, 3, 8, 1, 6, 11, 4, 9, 2, 7]) {
      specs.push([t + 2, 'm7', 2], [t + 7, '7', 2], [t, 'maj7', 2]);
    }
  } else if (progression === 'Blues rapide (changement immédiat)') {
    specs = [[0,'7',2],[5,'7',2],[0,'7',2],[0,'7',2],[5,'7',2],[5,'7',2],[0,'7',2],[0,'7',2],[7,'7',2],[5,'7',2],[0,'7',2],[7,'7',2]];
  } else if (progression === 'Blues 8 mesures') {
    specs = [[0,'7',4],[7,'7',4],[5,'7',4],[5,'7',4],[0,'7',4],[7,'7',4],[0,'7',4],[7,'7',4]];
  } else if (progression === 'ii-V-I (montée chromatique)') {
    specs = [];
    for (let t = 0; t < 12; t++) specs.push([t + 2, 'm7', 2], [t + 7, '7', 2], [t, 'maj7', 2]);
  } else if (progression === 'ii-V-i mineur (12 tonalités)') {
    specs = [];
    for (const t of [0, 5, 10, 3, 8, 1, 6, 11, 4, 9, 2, 7]) {
      specs.push([t + 2, 'm7b5', 2], [t + 7, '7', 2], [t, 'm7', 2]);
    }
  } else if (progression === 'Turnaround (dominantes) I-VI7-ii7-V7') {
    specs = [[0,'7',2],[9,'7',2],[2,'m7',2],[7,'7',2],[0,'7',2],[9,'7',2],[2,'m7',2],[7,'7',2]];
  } else if (progression === 'Rhythm changes (section A)') {
    specs = [[0,'maj7',2],[9,'m6',2],[2,'m7',2],[7,'7',2],[0,'maj7',2],[9,'m6',2],[2,'m7',2],[7,'7',2]];
  } else if (progression === 'Pont rhythm changes (dominantes en cycle)') {
    specs = [[4,'7',4],[9,'7',4],[2,'7',4],[7,'7',4],[4,'7',4],[9,'7',4],[2,'7',4],[7,'7',4]];
  } else if (progression === 'Chaîne de ii-V (Satin Doll)') {
    specs = [[2,'m7',2],[7,'7',2],[4,'m7',2],[9,'7',2],[2,'m7',2],[7,'7',2],[0,'maj7',4]];
  } else if (progression === 'Backdoor ii-V (bVII7 → I)') {
    specs = [[5,'m7',2],[10,'7',2],[0,'maj7',2],[5,'m7',2],[10,'7',2],[0,'maj7',2]];
  } else if (progression === 'Vamp dorien (So What)') {
    specs = [[0,'m7',8],[1,'m7',8],[0,'m7',8],[1,'m7',8]];
  } else if (progression === 'Cycle chromatique (Giant Steps)') {
    specs = [[0,'maj7',4],[3,'7',2],[8,'maj7',2],[10,'7',4],[3,'maj7',4],[7,'m7',2],[0,'7',2],[8,'maj7',4]];
  } else if (progression === 'Blue Bossa (grille)') {
    specs = [[0,'m7',8],[5,'m7',8],[2,'m7b5',2],[7,'7',2],[0,'m7',8],[3,'m7',4],[8,'7',4],[1,'maj7',8],[2,'m7b5',2],[7,'7',2],[0,'m7',8]];
  } else {
    specs = [[0, 'maj7', 2], [9, 'm7', 2], [2, 'm7', 2], [7, '7', 2]];
  }
  const spb = 60 / bpm;
  const notes = [];
  let beat = 0;
  for (const [d, type, beats] of specs) {
    for (const iv of CHORD_TYPES[type]) {
      const m = base + d + iv;
      if (m >= 21 && m <= 108) notes.push({ m, start: beat * spb, dur: beats * spb * 0.96, vel: 80 });
    }
    beat += beats;
  }
  notes.sort((a, b) => a.start - b.start || a.m - b.m);
  const duration = notes.reduce((d2, n) => Math.max(d2, n.start + n.dur), 0);
  return { bpm, duration, notes };
}

let rngState = 1;
export function buildRandomMelody({ bpm = 88, relative = -1 } = {}) {
  rngState = (Date.now() % 2147483647) || 1;
  const rnd = () => (rngState = (rngState * 16807) % 2147483647) / 2147483647;
  const pool = [0, 2, 4, 7, 9, 12, 11, 5];
  const notes = [];
  let deg = 0, beat = 0;
  const measures = 4 + ((Date.now() >> 3) % 3);
  for (let b = 0; b < measures * 4; b++) {
    if (rnd() < 0.55) {
      deg = Math.min(pool.length - 1, Math.max(0, deg + Math.round(rnd() * 4 - 2)));
      const m = 12 * 5 + pool[deg] + relative;
      const dur = rnd() < 0.7 ? 1 : 2;
      notes.push(`${nami(Math.max(36, Math.min(96, m)))}:${dur}`);
      b += dur - 1;
    }
  }
  return parseNotation(`tempo=${bpm}\n${notes.join(' ')}`);
}

// parseNotation(text) -> { bpm, notes: [{m,start,dur,vel}] }  (durées en temps, 1 temps = 60/bpm s)
export function parseNotation(text) {
  let bpm = 100;
  const voices = [];
  let voice = [];
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    for (const tok0 of l.split(/[\s|]+/)) {
      const tok = tok0.trim();
      if (!tok) continue;
      const tempoM = /^tempo=(\d+(?:\.\d+)?)$/.exec(tok);
      if (tempoM) { bpm = Math.max(20, Math.min(300, parseFloat(tempoM[1]))); continue; }
      const m = /^([A-Ga-g][#b]?-?\d+|r)(?::(\d*\.?\d+))?$/.exec(tok);
      if (!m) throw new Error(`Notation invalide: «${tok}»`);
      const durBeats = m[2] ? parseFloat(m[2]) : 1;
      voice.push({ token: m[1], durBeats });
    }
    if (voice.length) { voices.push(voice); voice = []; }
  }

  const secPerBeat = 60 / bpm;
  const notes = [];
  voices.forEach((v, vi) => {
    let beat = 0;
    for (const { token, durBeats } of v) {
      const start = beat * secPerBeat;
      const dur = durBeats * secPerBeat;
      if (token === 'r') { beat += durBeats; continue; }
      notes.push({ m: parseNoteName(token), start: vi === 0 ? start : start, dur, vel: 84 });
      beat += durBeats;
    }
  });
  notes.sort((a, b) => a.start - b.start || a.m - b.m);
  const duration = notes.reduce((d, n) => Math.max(d, n.start + n.dur), 0);
  return { bpm, duration, notes };
}
