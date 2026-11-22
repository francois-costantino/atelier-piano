// app.js — Atelier Piano : playback MIDI + entraînement avec retour visuel + transcription audio→MIDI.

import { serializeMidi, parseMidi } from './midi.js';
import { BUILTIN_PIECES, buildBuiltinPiece, buildExercise, buildRandomMelody, parseNotation,
  SCALE_NAMES, CHORD_NAMES, PROGRESSION_NAMES, buildChordPiece, buildProgressionPiece } from './pieces.js';
import { PianoSynth } from './synth.js';
import { renderKeyboard } from './keyboard.js';
import { initMidiInput } from './midiInput.js';
import { MicRecorder, isRecordingSupported, transcribeAudio } from './recorder.js';

const KB_LOW = 36; // C2
const KB_HIGH = 96; // C7

const $ = (id) => document.getElementById(id);

// ---------- État ----------
const state = {
  piece: null, // { name, bpm, notes, duration }
  play: { playing: false, pos: 0, rate: 1, tCtx0: 0, scheduled: [] },
  score: { ok: 0, err: 0 },
  recorder: null,
  busy: false,
};

const synth = new PianoSynth();
const songKb = renderKeyboard($('kbSong'), KB_LOW, KB_HIGH);
const userKb = renderKeyboard($('kbUser'), KB_LOW, KB_HIGH);
const activeUser = new Map();

// ---------- IndexedDB ----------
function db() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('atelier-piano', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('pieces', { keyPath: 'name' });
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function idbPut(pieceRec) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction('pieces', 'readwrite');
    tx.objectStore('pieces').put(pieceRec);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
async function idbAll() {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction('pieces', 'readonly');
    const req = tx.objectStore('pieces').getAll();
    req.onsuccess = () => res(req.result ?? []); req.onerror = () => rej(req.error);
  });
}
async function idbDelete(name) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction('pieces', 'readwrite');
    tx.objectStore('pieces').delete(name);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}

// ---------- Transport ----------
function pieceEnd() { return state.piece ? state.piece.duration + 0.8 : 0; }

function currentPos() {
  if (!state.play.playing) return state.play.pos;
  return Math.max(0, Math.min(pieceEnd(),
    state.play.pos + (synth.ctx.currentTime - state.play.tCtx0) * state.play.rate));
}

function scheduleFrom(pos) {
  const ctx = synth.ctx;
  state.play.scheduled = [];
  const tCtx0 = ctx.currentTime + 0.08;
  for (const n of state.piece.notes) {
    if (n.start + n.dur < pos) continue;
    const when = tCtx0 + (Math.max(n.start, pos) - pos) / state.play.rate;
    const dur = n.dur / state.play.rate;
    const handle = synth.playNote(n.m, when, dur, n.vel);
    state.play.scheduled.push({ handle, endCtx: when + dur });
  }
  state.play.tCtx0 = tCtx0;
  state.play.pos = pos;
}

function cancelScheduled() {
  for (const s of state.play.scheduled) { try { s.handle.stop(); } catch {} }
  state.play.scheduled = [];
}

async function play() {
  if (!state.piece) return;
  state.score = { ok: 0, err: 0 };
  updateScore();
  await synth.resume();
  state.play.playing = true;
  scheduleFrom(state.play.pos >= pieceEnd() - 0.05 ? 0 : state.play.pos);
  $('btnPlay').textContent = '⏸ Pause';
}

function pause() {
  if (!state.play.playing) return;
  state.play.pos = currentPos();
  state.play.playing = false;
  cancelScheduled();
  songKb.clearAll('playing');
  $('btnPlay').textContent = '▶ Lecture';
}

function stopPlayback() {
  state.play.playing = false;
  state.play.pos = 0;
  cancelScheduled();
  songKb.clearAll('playing');
  userKb.clearAll('ok', 'err');
  $('btnPlay').textContent = '▶ Lecture';
  $('progress').value = 0;
  $('timeLabel').textContent = `0:00 / ${fmt(pieceEnd())}`;
}

function togglePlay() { state.play.playing ? pause() : play(); }

function setRate(r) {
  const wasPlaying = state.play.playing;
  const pos = currentPos();
  pause();
  state.play.rate = r;
  $('tempoVal').textContent = `${Math.round(r * 100)} %`;
  state.play.pos = pos;
  if (wasPlaying) play();
}

function seek(frac) {
  const wasPlaying = state.play.playing;
  const pos = frac * pieceEnd();
  pause();
  state.play.pos = Math.min(pos, pieceEnd());
  if (wasPlaying) play();
}

function fmt(s) {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

function loop() {
  if (state.piece && state.play.playing) {
    const pos = currentPos();
    $('progress').value = pieceEnd() ? Math.round((pos / pieceEnd()) * 1000) : 0;
    $('timeLabel').textContent = `${fmt(pos)} / ${fmt(pieceEnd())}`;
    for (const el of songKb.keyEls.values()) el.classList.remove('playing');
    for (const n of state.piece.notes) {
      if (n.start > pos) break;
      if (pos < n.start + n.dur) {
        const el = songKb.keyEls.get(n.m);
        if (el) el.classList.add('playing');
      }
    }
    if (pos >= pieceEnd()) stopPlayback();
  }
  requestAnimationFrame(loop);
}

// ---------- Pièce courante ----------
function setPiece({ name, bpm, notes, duration, source = '' }) {
  state.piece = { name, bpm, notes, duration, source };
  stopPlayback();
  $('pieceName').textContent = `${name}${source ? ` · ${source}` : ''}`;
  $('pieceActions').classList.remove('hidden');
  updateScore();
}

function updateScore() {
  $('scoreLine').textContent = state.piece
    ? `Bonnes : ${state.score.ok} — Erreurs : ${state.score.err}`
    : '—';
}

// ---------- Entrée utilisateur (MIDI) + feedback ----------
function userNoteOn(midi) {
  const key = userKb.keyEls.get(midi);
  if (!key) return;
  activeUser.set(midi, { ok: false });
  let ok = null;
  if (state.play.playing && state.piece) {
    const pos = currentPos();
    ok = state.piece.notes.some((n) => n.start - 0.12 <= pos && pos < n.start + n.dur && n.m === midi);
    if (ok) state.score.ok++; else state.score.err++;
    updateScore();
  }
  key.classList.remove('ok', 'err');
  if (ok === true) key.classList.add('ok');
  else if (ok === false) key.classList.add('err');
}

function userNoteOff(midi) {
  const key = userKb.keyEls.get(midi);
  if (key) { key.classList.remove('ok', 'err'); }
  activeUser.delete(midi);
}

async function setupMidi() {
  const banner = $('midiBanner');
  const select = $('midiDevice');
  try {
    const res = await initMidiInput({
      onDeviceChange: (inputs) => {
        select.replaceChildren(...inputs.map((i) => {
          const o = document.createElement('option');
          o.textContent = i.name || 'Appareil MIDI';
          return o;
        }));
        select.classList.toggle('hidden', !inputs.length);
        $('midiStatus').textContent = inputs.length
          ? `${inputs.length} entrée(s) MIDI connectée(s)`
          : 'Aucune entrée MIDI détectée — branchez votre piano puis rechargez la page.';
      },
      onNoteOn: userNoteOn,
      onNoteOff: userNoteOff,
    });
    if (!res.supported) {
      banner.classList.remove('hidden');
      return;
    }
    $('midiStatus').textContent = 'MIDI prêt.';
  } catch (err) {
    banner.classList.remove('hidden');
    $('midiStatus').textContent = `MIDI refusé : ${err.message ?? err}`;
  }
}

// ---------- Bibliothèque ----------
async function refreshLibrary() {
  const items = await idbAll();
  items.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  const wrap = $('library');
  wrap.replaceChildren();
  if (!items.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Aucun morceau sauvegardé pour le moment.';
    wrap.appendChild(p);
    return;
  }
  for (const rec of items) {
    const row = document.createElement('div');
    row.className = 'lib-row';

    const name = document.createElement('span');
    name.textContent = rec.name;
    row.appendChild(name);

    const bPlay = mkBtn('▶', () => {
      setPiece({ name: rec.name, bpm: rec.bpm, notes: rec.notes, duration: rec.duration, source: 'bibliothèque' });
    });
    const bDl = mkBtn('⬇', () => downloadMidi(rec));
    const bDel = mkBtn('🗑', async () => { await idbDelete(rec.name); refreshLibrary(); });
    row.append(bPlay, bDl, bDel);
    wrap.appendChild(row);
  }
}

function mkBtn(label, fn) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', fn);
  return b;
}

function downloadMidi(rec) {
  const bytes = rec.bytes ?? serializeMidi({ name: rec.name, bpm: rec.bpm, notes: rec.notes });
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/midi' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${rec.name}.mid`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function saveCurrentPiece() {
  const name = ($('saveName').value || '').trim();
  if (!state.piece) return alert('Aucun morceau chargé.');
  if (!name) return alert('Choisissez un nom pour le morceau.');
  const bytes = serializeMidi({ name, bpm: state.piece.bpm, notes: state.piece.notes });
  await idbPut({
    name,
    bytes,
    bpm: state.piece.bpm,
    notes: state.piece.notes,
    duration: state.piece.duration,
    createdAt: Date.now(),
  });
  await refreshLibrary();
  setStatus(`« ${name} » sauvegardé (${state.piece.notes.length} notes).`, 'ok');
}

// ---------- Transcription (micro / fichier) ----------
function setStatus(msg, kind = '') {
  const el = $('status');
  el.textContent = msg;
  el.className = kind;
}

async function toggleRecord() {
  if (!isRecordingSupported()) return setStatus("L'enregistrement micro n'est pas supporté ici — utilisez l'import de fichier.", 'err');
  if (!state.recording) {
    try {
      state.recorder = new MicRecorder();
      await state.recorder.start();
      state.recording = true;
      $('btnRecord').textContent = '⏹ Arrêter';
      setStatus("Enregistrement en cours… jouez le morceau puis appuyez sur Arrêter.");
    } catch (e) {
      setStatus(`Micro refusé : ${e.message ?? e}`, 'err');
    }
  } else {
    const blob = await state.recorder.stop();
    state.recording = false;
    $('rangeRow').classList.add('hidden');
    $('btnRecord').textContent = '🎙 Enregistrer';
    setStatus(`Audio capturé (${(blob.size / 1e6).toFixed(1)} Mo). Lancez la transcription.`);
    state.lastBlob = blob;
  }
}

function importFile() {
  const f = $('fileInput').files[0];
  if (!f) return setStatus("Choisissez d'abord un fichier audio.", 'err');
  state.lastBlob = f;
  probeDuration(f);
}

function probeDuration(blobOrFile) {
  const url = URL.createObjectURL(blobOrFile);
  const probe = new Audio();
  probe.preload = 'metadata';
  probe.src = url;
  probe.onloadedmetadata = () => {
    URL.revokeObjectURL(url);
    if (!isFinite(probe.duration) || !probe.duration) return;
    const d = probe.duration;
    const s = $('trStart'), e = $('trEnd');
    s.max = d; e.max = d;
    s.value = 0; e.value = d;
    $('rangeRow').classList.remove('hidden');
    updateRangeLabel(d);
  };
}

function updateRangeLabel() {
  if ($('rangeRow').classList.contains('hidden')) return;
  const d = parseFloat($('trEnd').max);
  const s = Math.min(parseFloat($('trStart').value), d);
  const e = Math.max(parseFloat($('trEnd').value), s + 0.5);
  $('trRangeLabel').textContent = s > 0.1 || e < d - 0.1
    ? `plage ${fmt(s)} → ${fmt(e)} (${fmt(e - s)})`
    : 'tout le fichier';
}

async function doTranscribe() {
  if (state.busy) return;
  if (!state.lastBlob) return setStatus("Enregistrez au micro ou importez un fichier d'abord.", 'err');
  const name = ($('saveName').value || '').trim() || 'Transcription';
  state.busy = true;
  $('btnTranscribe').disabled = true;
  try {
    setStatus('Transcription en cours (10 à 60 s selon la durée)…');
    const PRESETS = {
      sensible: { onsetThresh: 0.5, frameThresh: 0.3, minNoteLen: 11 },
      fin: { onsetThresh: 0.6, frameThresh: 0.4, minNoteLen: 14 },
      souple: { onsetThresh: 0.35, frameThresh: 0.2, minNoteLen: 7 },
    };
    const rangeVisible = !$('rangeRow').classList.contains('hidden');
    const startSec = rangeVisible ? Math.max(0, parseFloat($('trStart').value) || 0) : 0;
    const endRaw = rangeVisible ? parseFloat($('trEnd').value) : null;
    const endSec = rangeVisible && endRaw < parseFloat($('trEnd').max) - 0.1 ? endRaw : null;
    const result = await transcribeAudio(state.lastBlob, {
      ...PRESETS[$('trProfile').value],
      removeHarmonics: $('trHarmonics').checked,
      startSec, endSec,
      onProgress: (p) => {
        if (p.phase === 'model') setStatus('Chargement du modèle Basic Pitch (première fois seulement)…');
        else if (p.phase === 'backend') setStatus(`Moteur d'analyse : ${p.backend}${p.note ?? ''} — lancement…`);
        else if (p.phase === 'infer') setStatus(`Analyse audio… ${Math.round((p.pct ?? 0) * 100)} %`);
        else if (p.phase === 'notes') setStatus('Création des notes…');
      },
    });
    if (!result.notes.length) {
      setStatus(`Aucune note détectée (audio : ${(result.audioDuration ?? 0).toFixed(1)} s). Vérifiez que le son du piano a bien été capté pendant l'enregistrement.`, 'err');
      return;
    }
    setPiece({ name, bpm: result.bpm, notes: result.notes, duration: result.duration, source: 'transcription' });
    setStatus(`Transcription prête : ${result.notes.length} notes${rangeVisible && (startSec > 0.1 || endSec) ? ` (plage ${fmt(startSec)} → ${fmt(endSec ?? result.audioDuration)})` : ''}. Vérifiez, renommez, puis « Sauvegarder ».`);
  } catch (e) {
    console.error(e);
    setStatus(`Échec de la transcription : ${e.message ?? e}. (Le modèle nécessite une connexion internet au premier usage.)`, 'err');
  } finally {
    state.busy = false;
    $('btnTranscribe').disabled = false;
  }
}

// ---------- Générateurs / notation ----------
function loadBuiltin(title) {
  try {
    const p = buildBuiltinPiece(title);
    setPiece({ name: title, ...p, source: 'intégré' });
  } catch (e) { setStatus(e.message, 'err'); }
}

function generate(kind) {
  try {
    const key = $('genKey').value;
    const opts = { key, bpm: parseInt($('genBpm').value, 10) || 80 };
    const p = kind === 'Aléatoire' ? buildRandomMelody(opts) : buildExercise({ type: kind, ...opts });
    setPiece({ name: `${kind} (${key})`, ...p, source: 'généré' });
  } catch (e) { setStatus(e.message, 'err'); }
}

function importNotation() {
  try {
    const p = parseNotation($('notation').value);
    if (!p.notes.length) throw new Error('Aucune note trouvée.');
    const name = ($('saveName').value || '').trim() || 'Morceau collé';
    setPiece({ name, ...p, source: 'notation collée' });
    setStatus(`Notation importée : ${p.notes.length} notes. Utilisez « Sauvegarder ».`);
  } catch (e) {
    setStatus(`Notation invalide : ${e.message}`, 'err');
  }
}

// ---------- Câblage ----------
function wire() {
  $('btnPlay').addEventListener('click', togglePlay);
  $('btnStop').addEventListener('click', stopPlayback);
  $('tempo').addEventListener('input', (e) => setRate(parseInt(e.target.value, 10) / 100));
  $('progress').addEventListener('input', (e) => seek(parseInt(e.target.value, 10) / 1000));
  $('btnSave').addEventListener('click', () => saveCurrentPiece());
  $('btnDownload').addEventListener('click', () => {
    if (!state.piece) return alert('Aucun morceau chargé.');
    downloadMidi({
      name: state.piece.name.replace(/[^\wÀ-ÿ \-]/g, '_'),
      bytes: serializeMidi({ name: state.piece.name, bpm: state.piece.bpm, notes: state.piece.notes }),
    });
  });

  $('btnRecord').addEventListener('click', toggleRecord);
  $('fileInput').addEventListener('change', importFile);
  $('btnTranscribe').addEventListener('click', doTranscribe);

  const dropZone = $('dropZone');
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    const dt = new DataTransfer();
    dt.items.add(f);
    $('fileInput').files = dt.files;
    importFile();
  });

  const selBuiltin = $('builtinSelect');
  for (const t of BUILTIN_PIECES) selBuiltin.append(new Option(t, t));
  $('btnLoadBuiltin').addEventListener('click', () => loadBuiltin(selBuiltin.value));
  $('btnGenGammes').addEventListener('click', () => generate('Gammes'));
  $('btnGenArpeges').addEventListener('click', () => generate('Arpèges'));
  $('btnGenRandom').addEventListener('click', () => generate('Aléatoire'));
  $('btnImportNotation').addEventListener('click', importNotation);

  for (const n of SCALE_NAMES) $('jbScale').append(new Option(n, n));
  for (const n of CHORD_NAMES) $('jbChord').append(new Option(n, n));
  for (const n of PROGRESSION_NAMES) $('jbProg').append(new Option(n, n));
  $('btnJbScale').addEventListener('click', () => {
    try {
      const p = buildExercise({ type: 'Gammes', key: $('jbRoot').value, mode: $('jbScale').value, bpm: 90 });
      setPiece({ name: `Gamme ${$('jbScale').value} (${$('jbRoot').value})`, ...p, source: 'gammes & accords' });
    } catch (e) { setStatus(e.message, 'err'); }
  });
  $('btnJbChord').addEventListener('click', async () => {
    try {
      const p = buildChordPiece({ root: $('jbRoot').value, type: $('jbChord').value, bpm: 90 });
      setPiece({ name: `${$('jbRoot').value}${$('jbChord').value}`, ...p, source: 'gammes & accords' });
      await play();
    } catch (e) { setStatus(e.message, 'err'); }
  });
  $('btnJbProg').addEventListener('click', () => {
    try {
      const p = buildProgressionPiece($('jbProg').value, $('jbRoot').value, { bpm: 100 });
      setPiece({ name: `${$('jbProg').value} (${$('jbRoot').value})`, ...p, source: 'gammes & accords' });
    } catch (e) { setStatus(e.message, 'err'); }
  });
  $('trStart').addEventListener('input', updateRangeLabel);
  $('trEnd').addEventListener('input', updateRangeLabel);
  $('btnRangeAll').addEventListener('click', () => {
    const d = parseFloat($('trEnd').max);
    $('trStart').value = 0;
    $('trEnd').value = d;
    updateRangeLabel();
  });

  for (const kb of [songKb, userKb]) {
    for (const [midi, el] of kb.keyEls) {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        synth.resume().then(() => synth.playNote(midi, synth.ctx.currentTime, null, 100));
        el.classList.add('ok');
      });
      const up = () => { el.classList.remove('ok'); if (kb === userKb) userNoteOff(midi); };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('pointercancel', up);
    }
  }

  window.addEventListener('beforeunload', () => cancelScheduled());
}

async function init() {
  wire();
  await refreshLibrary();
  setupMidi();
  loadBuiltin(BUILTIN_PIECES[0]);
  $('timeLabel').textContent = `0:00 / ${fmt(pieceEnd())}`;
  requestAnimationFrame(loop);
}

init();

export { userNoteOn, userNoteOff };
