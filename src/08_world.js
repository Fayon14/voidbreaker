// ============================================================
// World: arena, obstacles, background, camera + wave director.
// ============================================================
const World = {
  obstacles: [],
  bgCanvas: null,
  seed: 1,

  generate(seed) {
    this.seed = seed >>> 0;
    const rng = makeRng(this.seed);
    this.obstacles = [];
    const count = 7 + Math.floor(rng() * 4);
    for (let i = 0; i < count; i++) {
      const w = 60 + rng() * 180;
      const h = 60 + rng() * 180;
      const x = 160 + rng() * (CFG.arenaW - 320 - w);
      const y = 160 + rng() * (CFG.arenaH - 320 - h);
      const cx = CFG.arenaW / 2, cy = CFG.arenaH / 2;
      if (x < cx + 160 && x + w > cx - 160 && y < cy + 160 && y + h > cy - 160) continue;
      this.obstacles.push({ x, y, w, h, cx: x + w / 2, cy: y + h / 2, br: Math.max(w, h) / 2 });
    }
    this.renderBackground();
  },

  collideCircle(ent) {
    for (const o of this.obstacles) {
      const nx = clamp(ent.x, o.x, o.x + o.w);
      const ny = clamp(ent.y, o.y, o.y + o.h);
      const dx = ent.x - nx, dy = ent.y - ny;
      const d2 = dx * dx + dy * dy;
      const r = ent.r;
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 0.001;
        const push = r - d;
        ent.x += (dx / d) * push;
        ent.y += (dy / d) * push;
        const dot = ent.vx * (dx / d) + ent.vy * (dy / d);
        if (dot < 0) {
          ent.vx -= (dx / d) * dot;
          ent.vy -= (dy / d) * dot;
        }
      }
    }
  },

  circleHitsObstacle(x, y, r) {
    for (const o of this.obstacles) {
      if (circleRectHit(x, y, r, o.x, o.y, o.w, o.h)) return true;
    }
    return false;
  },

  renderBackground() {
    const c = document.createElement('canvas');
    c.width = CFG.arenaW;
    c.height = CFG.arenaH;
    const g = c.getContext('2d');
    const rng = makeRng(this.seed ^ 0x9e3779b9);

    g.fillStyle = CFG.colors.bg;
    g.fillRect(0, 0, CFG.arenaW, CFG.arenaH);

    for (let i = 0; i < 14; i++) {
      const x = rng() * CFG.arenaW, y = rng() * CFG.arenaH;
      const r = 180 + rng() * 420;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const hue = 200 + Math.floor(rng() * 90);
      grad.addColorStop(0, 'hsla(' + hue + ',70%,50%,0.05)');
      grad.addColorStop(1, 'hsla(' + hue + ',70%,50%,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }

    g.strokeStyle = CFG.colors.bgGrid;
    g.lineWidth = 1;
    for (let x = 0; x <= CFG.arenaW; x += 100) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, CFG.arenaH); g.stroke();
    }
    for (let y = 0; y <= CFG.arenaH; y += 100) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(CFG.arenaW, y); g.stroke();
    }

    for (let i = 0; i < 220; i++) {
      const x = rng() * CFG.arenaW, y = rng() * CFG.arenaH;
      const a = 0.1 + rng() * 0.5;
      g.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')';
      const s = rng() < 0.85 ? 1 : 2;
      g.fillRect(x, y, s, s);
    }

    g.strokeStyle = 'rgba(78,241,255,0.35)';
    g.lineWidth = 4;
    g.strokeRect(2, 2, CFG.arenaW - 4, CFG.arenaH - 4);
    g.strokeStyle = 'rgba(78,241,255,0.10)';
    g.lineWidth = 16;
    g.strokeRect(8, 8, CFG.arenaW - 16, CFG.arenaH - 16);

    this.bgCanvas = c;
  },

  drawObstacles(ctx) {
    for (const o of this.obstacles) {
      ctx.fillStyle = 'rgba(30,40,70,0.9)';
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = 'rgba(120,160,255,0.45)';
      ctx.lineWidth = 2;
      ctx.strokeRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = 'rgba(78,241,255,0.8)';
      ctx.lineWidth = 3;
      const cl = 14;
      ctx.beginPath();
      ctx.moveTo(o.x, o.y + cl); ctx.lineTo(o.x, o.y); ctx.lineTo(o.x + cl, o.y);
      ctx.moveTo(o.x + o.w - cl, o.y); ctx.lineTo(o.x + o.w, o.y); ctx.lineTo(o.x + o.w, o.y + cl);
      ctx.moveTo(o.x + o.w, o.y + o.h - cl); ctx.lineTo(o.x + o.w, o.y + o.h); ctx.lineTo(o.x + o.w - cl, o.y + o.h);
      ctx.moveTo(o.x + cl, o.y + o.h); ctx.lineTo(o.x, o.y + o.h); ctx.lineTo(o.x, o.y + o.h - cl);
      ctx.stroke();
    }
  },
};

// ------------------------------------------------------------
// Wave director: schedules spawns, banners, and bosses.
// ------------------------------------------------------------
const Waves = {
  wave: 0,
  queue: [],
  timer: 0,
  betweenT: 0,
  inIntro: false,
  bossWave: false,
  killsThisWave: 0,
  totalThisWave: 0,

  startWave(n) {
    this.wave = n;
    this.queue = [];
    this.killsThisWave = 0;
    this.inIntro = true;
    this.betweenT = CFG.waveIntroTime;
    AudioSys.waveStart();
    Game.waveScale = waveScale(n);

    if (n % CFG.bossEvery === 0) {
      this.bossWave = true;
      this.totalThisWave = 1;
      return;
    }
    this.bossWave = false;
    const comp = waveComposition(n);
    let budget = comp.budget;
    let t = 0;
    while (budget > 0) {
      // Spend the budget on affordable types; grunts are the filler.
      const options = comp.pool.filter(tn => (comp.cost[tn] || 2) <= budget);
      const tn = options.length > 0 ? pick(options) : 'grunt';
      const c = Math.min(comp.cost[tn] || 2, budget);
      budget -= c;
      const eliteChance = clamp((n - 4) * 0.02, 0, 0.22);
      const elite = chance(eliteChance) ? this.rollElite(n) : null;
      this.queue.push({ type: tn, t, elite });
      t += rand(0.25, 0.9) * Math.max(0.5, 1.6 - n * 0.05);
    }
    this.totalThisWave = this.queue.length;
  },

  rollElite(n) {
    const mod = pick(ELITE_MODS);
    return { name: mod.name, mods: Object.assign({}, mod.mult), tint: mod.tint };
  },

  update(dt) {
    if (this.inIntro) {
      this.betweenT -= dt;
      if (this.betweenT <= 0) this.inIntro = false;
      return;
    }
    if (this.bossWave) {
      if (!Boss.active && this.killsThisWave >= 1) {
        Game.onWaveClear();
      }
      return;
    }
    if (this.queue.length > 0) {
      this.timer -= dt;
      if (this.timer <= 0 && Enemies.aliveCount() < CFG.maxAliveEnemies) {
        const job = this.queue.shift();
        this.timer = Math.max(0.08, job.t);
        let x = 0, y = 0, tries = 0;
        do {
          const side = irand(0, 3);
          if (side === 0) { x = rand(60, CFG.arenaW - 60); y = 60; }
          else if (side === 1) { x = CFG.arenaW - 60; y = rand(60, CFG.arenaH - 60); }
          else if (side === 2) { x = rand(60, CFG.arenaW - 60); y = CFG.arenaH - 60; }
          else { x = 60; y = rand(60, CFG.arenaH - 60); }
          tries++;
        } while (dist2(x, y, Player.x, Player.y) < 380 * 380 && tries < 8);
        Enemies.spawn(job.type, x, y, Game.waveScale, job.elite);
        FX.ring(x, y, '#ff5c7a', 34, 0.4, 2);
      }
    } else if (Enemies.aliveCount() === 0) {
      Game.onWaveClear();
    }
  },
};
