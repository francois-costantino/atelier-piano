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

const SCALES = {
  majeur: [0, 2, 4, 5, 7, 9, 11, 12],
  mineur: [0, 2, 3, 5, 7, 8, 10, 12],
  pentatonique: [0, 2, 4, 7, 9, 12],
};

const DEGREES = { 'Do': 0, 'Ré': 2, 'Mi': 4, 'Fa': 5, 'Sol': 7, 'La': 9, 'Si': 11 };

export function buildExercise({ type, key = 'Do', mode = 'majeur', bpm = 80 }) {
  const names = Object.keys(DEGREES);
  const k = names.indexOf(key);
  if (k < 0) throw new Error(`Tonalité inconnue: ${key}`);
  const base = 12 * 4 + DEGREES[key]; // octave 4
  const ivals = SCALES[mode];
  const tokens = [];
  if (type === 'Gammes') {
    for (const i of ivals) tokens.push(`${nami(base + i)}:1`);
    for (let j = ivals.length - 2; j >= 0; j--) tokens.push(`${nami(base + ivals[j])}:1`);
  } else if (type === 'Arpèges') {
    const triad = mode === 'pentatonique' ? [0, 4, 9, 12, 16, 21] : [0, 4, 7, 12, 16, 19];
    for (const i of triad) tokens.push(`${nami(base + i)}:1`);
    for (let j = triad.length - 2; j >= 0; j--) tokens.push(`${nami(base + triad[j])}:1`);
  } else {
    throw new Error(`Exercice inconnu: ${type}`);
  }
  return parseNotation(`tempo=${bpm}\n${tokens.join(' ')}`);
}

function nami(m) {
  const N = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${N[m % 12]}${Math.floor(m / 12) - 1}`;
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
