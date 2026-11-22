// tests/midi.test.mjs — `node --test` depuis le dossier atelier-piano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeMidi, parseMidi, parseNoteName } from '../midi.js';
import { parseNotation, buildBuiltinPiece, BUILTIN_PIECES, buildExercise, buildRandomMelody,
  SCALE_NAMES, CHORD_NAMES, buildChordPiece, buildProgressionPiece, PROGRESSION_NAMES } from '../pieces.js';

test('parseNoteName', () => {
  assert.equal(parseNoteName('C4'), 60);
  assert.equal(parseNoteName('A4'), 69);
  assert.equal(parseNoteName('C#5'), 73);
  assert.equal(parseNoteName('Eb4'), 63);
  assert.equal(parseNoteName('C-1'), 0);
  assert.throws(() => parseNoteName('H4'));
});

test('round-trip serializeMidi -> parseMidi', () => {
  const notes = [
    { m: 60, start: 0, dur: 0.5, vel: 90 },
    { m: 64, start: 0.5, dur: 0.5, vel: 96 },
    { m: 67, start: 1.0, dur: 1.0, vel: 80 },
    { m: 72, start: 1.0, dur: 1.0, vel: 70 },
    { m: 48, start: 0, dur: 2, vel: 60 },
  ];
  const bytes = serializeMidi({ name: 'Test', bpm: 120, notes });
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'MThd');
  const parsed = parseMidi(bytes);
  assert.equal(parsed.bpm, 120);
  assert.equal(parsed.notes.length, notes.length);
  const byKey = (arr) => arr.map((n) => `${n.m}@${n.start.toFixed(3)}+${n.dur.toFixed(3)}`).sort();
  assert.deepEqual(byKey(parsed.notes), byKey(notes));
});

test('parseMidi gère tempo change et retain', () => {
  const notes = [
    { m: 60, start: 0, dur: 1, vel: 100 },
    { m: 62, start: 1, dur: 1, vel: 100 },
    { m: 64, start: 2, dur: 1, vel: 100 },
  ];
  const bytes = serializeMidi({ name: '', bpm: 90, notes });
  const parsed = parseMidi(bytes);
  assert.equal(parsed.bpm, 90);
  assert.ok(Math.abs(parsed.notes[2].start - 2) < 0.005);
  assert.ok(Math.abs(parsed.duration - 3) < 0.02);
});

test('parseNotation : token, silences, multi-voix, tempo', () => {
  const p = parseNotation('tempo=120\nC4:1 D4:.5 | r:1 E4:2\nC3:2 E3:2');
  assert.equal(p.bpm, 120);
  const tops = p.notes.filter((n) => n.m >= 60);
  assert.equal(tops.length, 3);
  const e4 = tops.find((n) => n.m === 64);
  assert.equal(e4.start, 1.25); // beat 2.5 à 120 bpm (0,5 s/temps)
  assert.equal(e4.dur, 1); // 2 temps = 1 s
  const bass = p.notes.filter((n) => n.m < 60);
  assert.equal(bass.length, 2);
  assert.equal(bass[0].m, 48);
});

test('morceaux intégrés valides', () => {
  for (const t of BUILTIN_PIECES) {
    const p = buildBuiltinPiece(t);
    assert.ok(p.notes.length > 0, t);
    assert.ok(p.duration > 1, t);
    for (const n of p.notes) assert.ok(n.m >= 21 && n.m <= 108, `${t}: ${n.m}`);
  }
});

test('exercices et mélodie aléatoire', () => {
  for (const type of ['Gammes', 'Arpèges']) {
    const p = buildExercise({ type, key: 'Sol', mode: 'majeur' });
    assert.ok(p.notes.length >= 10);
  }
  const r = buildRandomMelody();
  assert.ok(r.notes.length > 0);
});

test('gammes jazz et blues dans toutes les tonalités', () => {
  for (const mode of SCALE_NAMES) {
    for (const key of ['Do', 'Sib', 'Fa#']) {
      const g = buildExercise({ type: 'Gammes', key, mode, bpm: 90 });
      assert.ok(g.notes.length >= 10, `${mode}/${key}`);
      const a = buildExercise({ type: 'Arpèges', key, mode, bpm: 90 });
      assert.ok(a.notes.length >= 7, `arpège ${mode}/${key}`);
      for (const n of [...g.notes, ...a.notes]) assert.ok(n.m >= 21 && n.m <= 108, `${mode}/${key}: ${n.m}`);
    }
  }
});

test('accords jazz : bloc, arpège, registre', () => {
  for (const type of CHORD_NAMES) {
    const p = buildChordPiece({ root: 'Sib', type, bpm: 90 });
    const block = p.notes.filter((n) => n.start === 0);
    assert.ok(block.length >= 4, type);
    assert.equal(new Set(block.map((n) => n.start)).size, 1); // notes simultanées
    for (const n of p.notes) assert.ok(n.m >= 21 && n.m <= 108, `${type}: ${n.m}`);
  }
});

test('progressions jazz/blues', () => {
  const blues = buildProgressionPiece('Blues 12 mesures', 'Do', { bpm: 100 });
  assert.ok(blues.duration > 27 && blues.duration < 29); // 12 mesures × 4 temps × 0,6 s
  const minor = buildProgressionPiece('Blues mineur 12 mesures', 'La', { bpm: 100 });
  assert.ok(minor.notes.length >= 48);
  const iivi = buildProgressionPiece('ii-V-I (12 tonalités)', 'Do', { bpm: 120 });
  assert.ok(iivi.notes.length >= 144);
  assert.ok(iivi.duration > 30); // 72 temps à 120 bpm ≈ 36 s
  const tr = buildProgressionPiece('Turnaround I-vi-ii-V', 'Fa', { bpm: 100 });
  assert.equal(tr.notes.length, 16);
  for (const name of PROGRESSION_NAMES) {
    for (const root of ['Do', 'Sib']) {
      const p = buildProgressionPiece(name, root, { bpm: 100 });
      for (const n of p.notes) assert.ok(n.m >= 21 && n.m <= 108, `${name}/${root}: ${n.m}`);
    }
  }
});
