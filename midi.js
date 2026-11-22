// midi.js — encodeur/décodeur MIDI minimal (format 0), pur, sans DOM, testable sous Node.
// Notes: [{ m: midiNote, start: secondes, dur: secondes, vel: 0-127 }]

export const PPQ = 480;

export function parseNoteName(name) {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(name.trim());
  if (!m) throw new Error(`Note invalide: ${name}`);
  const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()];
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const oct = parseInt(m[3], 10);
  const n = (oct + 1) * 12 + base + acc;
  if (n < 0 || n > 127) throw new Error(`Note hors gamme MIDI: ${name}`);
  return n;
}

// serializeMidi({ name, bpm, notes }) -> Uint8Array (fichier .mid, format 0)
export function serializeMidi({ name = '', bpm = 120, notes = [] }) {
  const events = [];
  for (const n of notes) {
    const startTick = Math.round((n.start * bpm * PPQ) / 60);
    const endTick = Math.max(startTick + 1, Math.round(((n.start + n.dur) * bpm * PPQ) / 60));
    const vel = Math.max(1, Math.min(127, Math.round(n.vel ?? 80)));
    events.push({ tick: startTick, off: false, bytes: [0x90, n.m, vel] });
    events.push({ tick: endTick, off: true, bytes: [0x80, n.m, 0] });
  }
  events.sort((a, b) => a.tick - b.tick || (b.off ? 1 : 0) - (a.off ? 1 : 0));

  const track = [];
  pushTextMeta(track, 0x03, name);
  pushMeta(track, [0x00, 0xff, 0x51, 0x03, ...u24(Math.round(60000000 / bpm))]);
  let prev = 0;
  for (const ev of events) {
    pushMeta(track, [...vlq(ev.tick - prev), ev.bytes[0], ev.bytes[1], ev.bytes[2]]);
    prev = ev.tick;
  }
  pushMeta(track, [0x00, 0xff, 0x2f, 0x00]);

  const head = [
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (PPQ >> 8) & 0xff, PPQ & 0xff,
    0x4d, 0x54, 0x72, 0x6b, (track.length >> 24) & 0xff, (track.length >> 16) & 0xff,
    (track.length >> 8) & 0xff, track.length & 0xff,
  ];
  return new Uint8Array([...head, ...track]);
}

// parseMidi(Uint8Array) -> { name, bpm, duration, notes: [{ m, start, dur, vel }] }
export function parseMidi(data) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let p = 0;
  const str4 = () => { const s = String.fromCharCode(dv.getUint8(p), dv.getUint8(p + 1), dv.getUint8(p + 2), dv.getUint8(p + 3)); p += 4; return s; };
  if (str4() !== 'MThd') throw new Error('Fichier MIDI invalide');
  const hlen = dv.getUint32(p); p += 4;
  p += 2; // format
  const ntrks = dv.getUint16(p); p += 2;
  const ppq = dv.getUint16(p) & 0x7fff; p = 8 + hlen; // division SMPTE non supportée

  const temps = [];   // [{ tick, usPerQ }]
  const notes = [];   // { m, tickOn, tickOff, vel }
  const active = new Map();

  for (let t = 0; t < ntrks && p < data.length; t++) {
    if (str4() !== 'MTrk') throw new Error('piste MIDI manquante');
    const len = dv.getUint32(p); p += 4;
    const end = p + len;
    let tick = 0, running = 0;
    while (p < end) {
      const [delta, np] = readVlq(data, p);
      p = np;
      tick += delta;
      let status = dv.getUint8(p);
      if (status & 0x80) p++;
      else status = running;
      running = status;

      if (status === 0xff) {
        const type = dv.getUint8(p); p++;
        const [mlen, np2] = readVlq(data, p); p = np2;
        if (type === 0x51 && mlen === 3) {
          const us = (dv.getUint8(p) << 16) | (dv.getUint8(p + 1) << 8) | dv.getUint8(p + 2);
          temps.push({ tick, usPerQ: us });
        }
        p += mlen;
      } else if (status === 0xf0 || status === 0xf7) {
        const [mlen, np2] = readVlq(data, p); p = np2 + mlen;
      } else {
        const hi = status & 0xf0;
        if (hi === 0x90 || hi === 0x80 || hi === 0xa0 || hi === 0xb0 || hi === 0xe0) {
          const d1 = dv.getUint8(p++), d2 = dv.getUint8(p++);
          if (hi === 0x90 || hi === 0x80) {
            const note = d1 & 0x7f, vel = hi === 0x90 ? d2 & 0x7f : 0, ch = status & 0x0f;
            const key = ch * 128 + note;
            if (vel > 0 && hi === 0x90) {
              active.set(key, { m: note, tickOn: tick, vel });
            } else {
              const on = active.get(key);
              if (on) { on.tickOff = tick; notes.push(on); active.delete(key); }
            }
          }
        } else if (hi === 0xc0 || hi === 0xd0) p += 1;
      }
    }
  }

  temps.sort((a, b) => a.tick - b.tick);
  if (!temps.length) temps.push({ tick: 0, usPerQ: 500000 });
  const bpm = Math.round(60000000 / temps[0].usPerQ);

  const tickToSec = (tick) => {
    let sec = 0, prevTick = 0, us = temps[0].usPerQ;
    for (const t2 of temps) {
      if (t2.tick >= tick) break;
      sec += ((t2.tick - prevTick) * us) / (ppq * 1e6);
      prevTick = t2.tick; us = t2.usPerQ;
    }
    return sec + ((tick - prevTick) * us) / (ppq * 1e6);
  };

  const out = notes
    .filter((n) => n.tickOff > n.tickOn)
    .map((n) => ({ m: n.m, start: tickToSec(n.tickOn), dur: tickToSec(n.tickOff) - tickToSec(n.tickOn), vel: n.vel }))
    .sort((a, b) => a.start - b.start || a.m - b.m);

  const duration = out.reduce((d, n) => Math.max(d, n.start + n.dur), 0);
  return { bpm, duration, notes: out };
}

function pushMeta(arr, bytes) { arr.push(...bytes); }
function pushTextMeta(arr, type, text) {
  const t = [...new TextEncoder().encode(text)];
  pushMeta(arr, [0x00, 0xff, type, ...vlq(t.length), ...t]);
}
function u24(v) { return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]; }

function vlq(value) {
  const out = [value & 0x7f];
  let v = value >> 7;
  while (v > 0) { out.unshift((v & 0x7f) | 0x80); v >>= 7; }
  return out;
}
function readVlq(data, p) {
  let value = 0;
  for (let i = 0; i < 4; i++) {
    const b = data[p++];
    value = (value << 7) | (b & 0x7f);
    if (!(b & 0x80)) return [value, p];
  }
  return [value, p];
}
