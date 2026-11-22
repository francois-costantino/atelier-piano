// tests/midi.test.mjs — `node --test` depuis le dossier atelier-piano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeMidi, parseMidi, parseNoteName } from '../midi.js';
import { parseNotation, buildBuiltinPiece, BUILTIN_PIECES, buildExercise, buildRandomMelody } from '../pieces.js';

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
