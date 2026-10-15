// ============================================================
// Procedural audio engine. Zero sound files: every effect and
// the music loop are synthesized with WebAudio oscillators.
// Must be initialized from a user gesture (autoplay policy).
// ============================================================
const AudioSys = {
  ctx: null,
  master: null,
  sfxBus: null,
  musicBus: null,
  noiseBuf: null,
  musicOn: false,
  musicTimer: null,
  musicStep: 0,
  musicNextTime: 0,
  intensity: 0,   // 0..1, driven by wave number and boss fights

  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = Save.data.settings.sfx;
    this.sfxBus.connect(this.master);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = Save.data.settings.music;
    this.musicBus.connect(this.master);

    // Pre-baked white noise buffer, reused by every noise-based effect.
    const len = this.ctx.sampleRate * 1.2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    this.resume();
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  applySettings() {
    if (!this.ctx) return;
    this.sfxBus.gain.value = Save.data.settings.sfx;
    this.musicBus.gain.value = Save.data.settings.music;
  },

  // One envelope-shaped oscillator voice.
  tone(freq, dur, type, vol, slideTo, delay) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + (delay || 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  },

  // One filtered noise burst.
  noise(dur, vol, filterFreq, slideTo, delay) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + (delay || 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(filterFreq || 1200, t0);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  },

  // Pitch variation on every call keeps repetition fatigue away.
  shoot() {
    const p = rand(0.92, 1.08);
    this.tone(660 * p, 0.09, 'square', 0.10, 180 * p);
    this.noise(0.05, 0.05, 3000, 800);
  },
  shotgun() {
    this.noise(0.18, 0.22, 2200, 300);
    this.tone(180, 0.14, 'square', 0.12, 60);
  },
  laser() {
    this.tone(1400, 0.22, 'sawtooth', 0.12, 220);
    this.noise(0.14, 0.06, 6000, 1200);
  },
  missile() {
    this.noise(0.3, 0.10, 900, 200);
    this.tone(300, 0.25, 'sawtooth', 0.06, 90);
  },
  hit() {
    const p = rand(0.9, 1.1);
    this.noise(0.06, 0.10, 1800 * p, 400);
  },
  crit() {
    this.tone(1100, 0.07, 'square', 0.10, 1900);
    this.noise(0.08, 0.10, 4000, 900);
  },
  explode(big) {
    const v = big ? 0.34 : 0.2;
    this.noise(big ? 0.6 : 0.34, v, big ? 900 : 1400, 60);
    this.tone(big ? 90 : 130, big ? 0.5 : 0.3, 'sine', v, 35);
  },
  hurt() {
    this.tone(140, 0.2, 'sawtooth', 0.18, 55);
    this.noise(0.15, 0.12, 800, 200);
  },
  dash() {
    this.noise(0.16, 0.10, 500, 3500);
  },
  pickup() {
    const p = rand(0.95, 1.05);
    this.tone(520 * p, 0.06, 'square', 0.07);
    this.tone(780 * p, 0.08, 'square', 0.07, undefined, 0.05);
  },
  gem() {
    const p = rand(0.94, 1.06);
    this.tone(920 * p, 0.05, 'triangle', 0.05, 1250 * p);
  },
  levelup() {
    const p = rand(0.98, 1.02);
    this.tone(440 * p, 0.12, 'triangle', 0.10);
    this.tone(554 * p, 0.12, 'triangle', 0.10, undefined, 0.09);
    this.tone(659 * p, 0.2, 'triangle', 0.12, undefined, 0.18);
  },
  buy() {
    this.tone(700, 0.07, 'square', 0.09);
    this.tone(1050, 0.1, 'square', 0.09, undefined, 0.07);
  },
  click() {
    this.tone(340, 0.04, 'square', 0.06);
  },
  waveStart() {
    this.tone(220, 0.18, 'sawtooth', 0.09, 440);
    this.tone(440, 0.22, 'sawtooth', 0.09, 880, 0.12);
  },
  bossRoar() {
    this.tone(70, 0.9, 'sawtooth', 0.26, 45);
    this.noise(0.8, 0.16, 500, 100);
    this.tone(140, 0.7, 'square', 0.12, 90);
  },
  gameOver() {
    this.tone(330, 0.4, 'sawtooth', 0.14, 110);
    this.tone(165, 0.7, 'sawtooth', 0.12, 55, 0.3);
    this.noise(0.9, 0.1, 600, 80, 0.2);
  },

  // ----------------------------------------------------------
  // Music: a seeded, generative dark-synthwave loop.
  // Bass line plus arp, layers switch on as intensity rises.
  // Scheduled ~0.2s ahead of the audio clock.
  // ----------------------------------------------------------
  startMusic(seed) {
    if (!this.ctx) return;
    this.stopMusic();
    this.rng = makeRng(seed || 1337);
    // Minor scale root progression, 8 bars.
    this.roots = [55, 55, 65.4, 49, 55, 55, 73.4, 65.4]; // A1 A1 C2 G1...
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.musicOn = true;
    this.musicTimer = setInterval(() => this.schedule(), 60);
  },

  stopMusic() {
    this.musicOn = false;
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  },

  setIntensity(v) {
    this.intensity = clamp(v, 0, 1);
  },

  schedule() {
    if (!this.ctx || !this.musicOn) return;
    const lookahead = 0.22;
    const bpm = 96 + Math.floor(this.intensity * 46);
    const stepDur = 60 / bpm / 4; // 16th notes
    while (this.nextTime < this.ctx.currentTime + lookahead) {
      this.playStep(this.step, this.nextTime, stepDur);
      this.step = (this.step + 1) % 128;
      this.nextTime += stepDur;
    }
  },

  playStep(s, t, dur) {
    const ctx = this.ctx;
    const bar = Math.floor(s / 16);
    const beat = s % 16;
    const root = this.roots[bar];
    const I = this.intensity;
    const mus = this.musicBus;

    // Kick on quarters once intensity passes 0.15
    if (beat % 4 === 0 && I > 0.12) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(0.30 * (0.4 + I), t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(g).connect(mus);
      o.start(t); o.stop(t + 0.2);
    }
    // Hi-hat noise on off-beats at higher intensity
    if (beat % 4 === 2 && I > 0.35) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05 + I * 0.05, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      src.connect(f).connect(g).connect(mus);
      src.start(t); src.stop(t + 0.08);
    }
    // Bass: pulsing root on 8ths
    if (beat % 2 === 0) {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'sawtooth';
      o.frequency.value = root;
      f.type = 'lowpass';
      f.frequency.setValueAtTime(300 + I * 700, t);
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur * 1.8);
      o.connect(f).connect(g).connect(mus);
      o.start(t); o.stop(t + dur * 2);
    }
    // Arp: minor triad pattern on 16ths, density scales with intensity
    const arpPattern = [0, 3, 7, 12, 7, 3];
    if (beat % 2 === 1 && (I > 0.25 || this.rng() < 0.5)) {
      const idx = Math.floor(beat / 2) % arpPattern.length;
      const semi = arpPattern[idx];
      const freq = root * 4 * Math.pow(2, semi / 12);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.05 + I * 0.04, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur * 1.4);
      o.connect(g).connect(mus);
      o.start(t); o.stop(t + dur * 1.6);
    }
    // Pad: sustained fifth at bar starts
    if (beat === 0) {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'triangle';
      o.frequency.value = root * 2;
      f.type = 'lowpass'; f.frequency.value = 900;
      const barDur = dur * 16;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + barDur * 0.3);
      g.gain.linearRampToValueAtTime(0.0001, t + barDur);
      o.connect(f).connect(g).connect(mus);
      o.start(t); o.stop(t + barDur + 0.1);
    }
  },
};
