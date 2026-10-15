// ============================================================
// FX: pooled particles, floating damage text, screen shake,
// hit stop, flashes. The juice layer.
// ============================================================
const FX = {
  parts: null,
  texts: null,
  shakeMag: 0,
  shakeX: 0,
  shakeY: 0,
  hitStopT: 0,
  flashT: 0,
  flashColor: '#fff',
  vignette: 0,

  init() {
    this.parts = new Pool(() => ({
      active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0,
      size: 2, color: '#fff', type: 0, drag: 0.9, grav: 0, rot: 0, spin: 0, w: 0,
    }), CFG.particleMax);
    this.texts = new Pool(() => ({
      active: false, x: 0, y: 0, vy: 0, life: 0, maxLife: 0,
      text: '', size: 14, color: '#fff',
    }), CFG.floatTextMax);
  },

  reset() {
    this.parts.clear();
    this.texts.clear();
    this.shakeMag = 0;
    this.hitStopT = 0;
    this.flashT = 0;
    this.vignette = 0;
  },

  // --- screen-level effects -----------------------------------
  shake(mag) {
    if (Save.data.settings.reducedMotion) return;
    this.shakeMag = Math.min(28, Math.max(this.shakeMag, mag * (Save.data.settings.shake || 1)));
  },
  hitStop(seconds) {
    if (Save.data.settings.reducedMotion) return;
    this.hitStopT = Math.max(this.hitStopT, seconds);
  },
  flash(color, strength) {
    if (Save.data.settings.reducedMotion) return;
    this.flashColor = color;
    this.flashT = Math.max(this.flashT, strength || 0.18);
  },
  pulseVignette(amount) {
    this.vignette = Math.min(1, this.vignette + amount);
  },

  // --- particles ----------------------------------------------
  spawn(x, y, opts) {
    const p = this.parts.get();
    p.active = true;
    p.x = x; p.y = y;
    p.vx = opts.vx || 0; p.vy = opts.vy || 0;
    p.maxLife = opts.life || 0.5; p.life = p.maxLife;
    p.size = opts.size || 3;
    p.color = opts.color || '#fff';
    p.type = opts.type || 0;      // 0 dot, 1 spark(line), 2 ring, 3 shard
    p.drag = opts.drag !== undefined ? opts.drag : 3;
    p.rot = opts.rot || 0;
    p.spin = opts.spin || 0;
    return p;
  },

  burst(x, y, color, count, speed, size, life) {
    count = Math.min(count, 60);
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const s = rand(speed * 0.3, speed);
      this.spawn(x, y, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        color, size: rand(size * 0.6, size * 1.4),
        life: rand(life * 0.6, life * 1.3),
        type: chance(0.5) ? 1 : 0,
        drag: 4, spin: rand(-8, 8),
      });
    }
  },

  ring(x, y, color, maxR, life, width) {
    const p = this.spawn(x, y, { color, life: life || 0.35, type: 2, size: maxR || 60 });
    p.w = width || 3;
  },

  smoke(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      this.spawn(x + rand(-6, 6), y + rand(-6, 6), {
        vx: rand(-30, 30), vy: rand(-40, -10),
        color, size: rand(4, 9), life: rand(0.5, 1.1), drag: 1.5, type: 0,
      });
    }
  },

  trail(x, y, color, size) {
    this.spawn(x, y, {
      color, size: size || 3, life: 0.3, drag: 5, type: 0,
      vx: rand(-15, 15), vy: rand(-15, 15),
    });
  },

  // --- floating text ------------------------------------------
  text(x, y, str, color, size) {
    const t = this.texts.get();
    t.active = true;
    t.x = x + rand(-6, 6); t.y = y;
    t.vy = -55;
    t.maxLife = 0.75; t.life = t.maxLife;
    t.text = str; t.color = color || '#fff';
    t.size = size || 14;
  },

  // --- update / draw ------------------------------------------
  update(dt) {
    this.parts.forEach((p, i) => {
      p.life -= dt;
      if (p.life <= 0) { this.parts.release(i); return; }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    });
    this.texts.forEach((t, i) => {
      t.life -= dt;
      if (t.life <= 0) { this.texts.release(i); return; }
      t.y += t.vy * dt;
      t.vy *= Math.exp(-2 * dt);
    });
    this.shakeMag = Math.max(0, this.shakeMag - 60 * dt * (this.shakeMag * 0.12 + 1));
    this.hitStopT = Math.max(0, this.hitStopT - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.vignette = Math.max(0, this.vignette - 1.6 * dt);
  },

  updateShake() {
    if (this.shakeMag > 0.1) {
      this.shakeX = rand(-1, 1) * this.shakeMag;
      this.shakeY = rand(-1, 1) * this.shakeMag;
    } else {
      this.shakeX = 0; this.shakeY = 0;
      this.shakeMag = 0;
    }
  },

  draw(ctx) {
    this.parts.forEach(p => {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      if (p.type === 0) {
        const s = p.size * (0.4 + t * 0.6);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      } else if (p.type === 1) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, p.size * t);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else if (p.type === 2) {
        const r = p.size * (1 - t);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.w || 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, r), 0, TAU);
        ctx.stroke();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8);
        ctx.restore();
      }
    });
    ctx.globalAlpha = 1;

    this.texts.forEach(t => {
      const k = t.life / t.maxLife;
      ctx.globalAlpha = Math.min(1, k * 1.6);
      drawText(ctx, t.text, t.x, t.y, t.size, t.color, 'center', true);
    });
    ctx.globalAlpha = 1;
  },
};
