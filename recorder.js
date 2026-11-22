// recorder.js — enregistrement micro / import fichier puis transcription Basic Pitch (100% navigateur).
// Modèle https://github.com/spotify/basic-pitch (Apache 2.0), chargé depuis le CDN jsDelivr au premier usage.

const BP_VERSION = '1.0.1';
const MODULE_URL = `https://cdn.jsdelivr.net/npm/@spotify/basic-pitch@${BP_VERSION}/+esm`;
const MODEL_URL = `https://cdn.jsdelivr.net/npm/@spotify/basic-pitch@${BP_VERSION}/model/model.json`;

let bpModule = null;

async function loadBasicPitch() {
  if (!bpModule) {
    const mod = await import(MODULE_URL);
    bpModule = {
      BasicPitch: mod.BasicPitch,
      outputToNotesPoly: mod.outputToNotesPoly,
      noteFramesToTime: mod.noteFramesToTime,
      addPitchBendsToNoteEvents: mod.addPitchBendsToNoteEvents,
      model: new mod.BasicPitch(MODEL_URL),
    };
  }
  return bpModule;
}

export class MicRecorder {
  constructor() {
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
  }
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const mime = ['audio/mp4', 'audio/webm'].find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.recorder.start();
  }
  async stop() {
    if (!this.recorder) throw new Error('Non en cours');
    const done = new Promise((res) => (this.recorder.onstop = res));
    this.recorder.stop();
    await done;
    for (const t of this.stream.getTracks()) t.stop();
    return new Blob(this.chunks, { type: this.recorder.mimeType || 'audio/webm' });
  }
}

export function isRecordingSupported() {
  return !!(navigator.mediaDevices && window.MediaRecorder);
}

export async function transcribeAudio(blob, { onProgress } = {}) {
  const arrayBuffer = await blob.arrayBuffer();
  const decodeCtx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
  await decodeCtx.close();

  const mono22050 = await renderMono(decoded, 22050);

  onProgress?.({ phase: 'model' });
  const bp = await loadBasicPitch();
  const frames = [], onsets = [], contours = [];
  await bp.model.evaluateModel(
    mono22050,
    (f, o, c) => { frames.push(...f); onsets.push(...o); contours.push(...c); },
    (p) => onProgress?.({ phase: 'infer', pct: p }),
  );

  onProgress?.({ phase: 'notes' });
  const noteEvents = bp.noteFramesToTime(bp.outputToNotesPoly(frames, onsets, 0.25, 0.25, 5));

  const notes = noteEvents
    .filter((ev) => ev.pitch >= 21 && ev.pitch <= 108 && ev.endSeconds > ev.startSeconds)
    .map((ev) => ({
      m: ev.pitch,
      start: ev.startSeconds,
      dur: Math.max(0.08, (ev.endSeconds ?? ev.startSeconds + 0.3) - ev.startSeconds - 0.02),
      vel: Math.max(30, Math.min(112, Math.round(40 + 80 * (ev.amplitude ?? 0.6)))),
    }))
    .sort((a, b) => a.start - b.start);

  const duration = notes.reduce((d, n) => Math.max(d, n.start + n.dur), 0);
  return { bpm: bpModule?.bpmGuess ?? guessBpm(notes), notes, duration };
}

function guessBpm(notes) {
  if (notes.length < 4) return 100;
  const gaps = [];
  for (let i = 1; i < Math.min(notes.length, 40); i++) {
    const g = notes[i].start - notes[i - 1].start;
    if (g > 0.1 && g < 1.2) gaps.push(g);
  }
  if (!gaps.length) return 100;
  gaps.sort((a, b) => a - b);
  const med = gaps[Math.floor(gaps.length / 2)];
  const bpm = Math.round(med > 0.35 ? 60 / med : 120 / med);
  return Math.max(60, Math.min(180, bpm));
}

async function renderMono(buffer, sampleRate) {
  if (buffer.sampleRate === sampleRate && buffer.numberOfChannels === 1) return buffer;
  const len = Math.ceil(buffer.duration * sampleRate);
  const off = new OfflineAudioContext(1, len, sampleRate);
  const src = off.createBufferSource();
  src.buffer = buffer;
  src.connect(off.destination);
  src.start();
  return off.startRendering();
}
