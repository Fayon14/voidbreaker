// ============================================================
// Persistent save data via localStorage.
// ============================================================
const Save = {
  data: null,

  defaults() {
    return {
      best: 0,
      bestWave: 0,
      runs: 0,
      totalKills: 0,
      credits: 0,
      meta: {},          // meta shop id -> level purchased
      seenIntro: false,
      seenHowTo: false,
      settings: {
        sfx: 0.8,
        music: 0.6,
        shake: 1.0,      // 0 disables screen shake
        reducedMotion: false,
      },
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(CFG.saveKey);
      if (raw) {
        this.data = Object.assign(this.defaults(), JSON.parse(raw));
        this.data.settings = Object.assign(
          this.defaults().settings, this.data.settings || {});
      } else {
        this.data = this.defaults();
      }
    } catch (e) {
      this.data = this.defaults();
    }
    // Apply meta shop purchases to the stat base.
    this.applyMeta();
    return this.data;
  },

  save() {
    try { localStorage.setItem(CFG.saveKey, JSON.stringify(this.data)); }
    catch (e) { /* storage full or blocked: run continues without saving */ }
  },

  metaLevel(id) { return this.data.meta[id] || 0; },

  applyMeta() {
    const base = baseStats();
    for (const item of META_SHOP) {
      const lvl = this.metaLevel(item.id);
      for (let i = 0; i < lvl; i++) item.apply(base);
    }
    Save.statBase = base;
  },

  recordRun(score, wave, kills, credits) {
    const d = this.data;
    d.runs++;
    d.totalKills += kills;
    d.credits += credits;
    if (score > d.best) d.best = score;
    if (wave > d.bestWave) d.bestWave = wave;
    this.save();
  },
};
