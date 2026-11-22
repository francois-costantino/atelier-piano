// synth.js — petit synthé piano (Web Audio), sans dépendance.
export class PianoSynth {
  constructor(dest = null) {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    if (dest) this.master.connect(dest); else this.master.connect(this.ctx.destination);
  }

  async resume() { if (this.ctx.state !== 'running') await this.ctx.resume(); }

  setVolume(v) { this.master.gain.value = v; }

  // Rend les nœuds pour arrêt manuel (dur infinie si dur=null)
  playNote(midi, when, dur = null, vel = 96) {
    const ctx = this.ctx;
    const t = Math.max(when, ctx.currentTime + 0.005);
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = Math.min(12000, f * 8);
    g.connect(filter);
    filter.connect(this.master);

    const o1 = ctx.createOscillator();
    o1.type = 'triangle';
    o1.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    o2.connect(g2); g2.connect(g);
    o1.connect(g);

    const peak = (vel / 127) * 0.25;
    const attack = 0.005;
    const decay = Math.min(1.6, Math.max(0.25, dur == null ? 1.5 : dur));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0005, peak * 0.18), t + decay);

    const stopAt = t + (dur == null ? decay + 0.3 : dur + 0.25);
    g.gain.setTargetAtTime(0.0001, stopAt - 0.12, 0.04);

    o1.start(t); o2.start(t);
    if (dur == null) {
      return { stop: (time) => { const s = time ?? ctx.currentTime; g.gain.setTargetAtTime(0.0001, s, 0.03); o1.stop(s + 0.4); o2.stop(s + 0.4); } };
    }
    o1.stop(stopAt + 0.3); o2.stop(stopAt + 0.3);
    return { stop: () => { try { o1.stop(); o2.stop(); } catch {} } };
  }
}
