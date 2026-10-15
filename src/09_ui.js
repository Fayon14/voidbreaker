// ============================================================
// UI v1.1: HUD, cinematic intro, menus with entrance animations,
// level-up cards, minimap, scrollable shop, dev log.
// Everything renders on the game canvas.
// ============================================================

// Screen transition driver. Out-phase darkens the old screen, then the
// state switches, then the in-phase reveals the new one.
const Trans = {
  active: false, mode: 'out', t: 0, next: null,

  dur() { return Save.data && Save.data.settings.reducedMotion ? 0.12 : 0.26; },

  go(state) {
    if (this.active) return;
    if (Game.state === state) return;
    this.next = state;
    this.active = true;
    this.mode = 'out';
    this.t = 0;
  },

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    if (this.t >= this.dur()) {
      if (this.mode === 'out') {
        this.mode = 'in';
        this.t = 0;
        Game.setState(this.next);
        this.next = null;
      } else {
        this.active = false;
      }
    }
  },

  // Blocking: the old screen is still showing, input should wait.
  closing() { return this.active && this.mode === 'out'; },

  draw() {
    if (!this.active) return;
    const p = clamp(this.t / this.dur(), 0, 1);
    const e = p * p * (3 - 2 * p);
    const a = this.mode === 'out' ? e : 1 - e;
    ctx.fillStyle = 'rgba(3,3,12,' + (a * 0.99).toFixed(3) + ')';
    ctx.fillRect(0, 0, UI.vw(), UI.vh());
  },
};

const UI = {
  // Layout helpers ------------------------------------------------
  vw() { return canvas.width / DPR; },
  vh() { return canvas.height / DPR; },
  motion() { return !Save.data.settings.reducedMotion; },

  // Entrance animation time, reset whenever a screen is entered.
  enterT: 0,

  // Staggered entrance progress for element i of a screen.
  // Returns eased progress p, a y-offset and an alpha.
  st(i, dur, delay) {
    if (!this.motion()) return { p: 1, oy: 0, a: 1 };
    const t = this.enterT - (delay || 0) - i * 0.055;
    const p = clamp(t / (dur || 0.4), 0, 1);
    const e = 1 - Math.pow(1 - p, 3);
    return { p: e, oy: (1 - e) * 26, a: e };
  },

  panel(x, y, w, h, alpha) {
    ctx.fillStyle = 'rgba(10,14,30,' + (alpha || 0.88) + ')';
    ctx.strokeStyle = 'rgba(78,241,255,0.35)';
    ctx.lineWidth = 2;
    const r = 10;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  },

  bar(x, y, w, h, frac, color, bgAlpha) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  },

  // In-game HUD ----------------------------------------------------
  drawHUD() {
    const w = this.vw(), h = this.vh();
    const pad = 16;

    // Health bar, top left.
    const hpFrac = Player.hp / Player.maxHp;
    const hpColor = hpFrac > 0.35 ? CFG.colors.hp : CFG.colors.hpLow;
    this.bar(pad, pad, 220, 14, hpFrac, hpColor);
    drawText(ctx, 'HP ' + Math.ceil(Player.hp) + '/' + Math.round(Player.maxHp),
      pad + 108, pad + 7, 11, '#031', 'center', true);
    drawText(ctx, 'HP', pad - 4, pad + 7, 12, CFG.colors.ui, 'right', true);

    // Shield pips.
    for (let i = 0; i < Player.stats.shieldMax; i++) {
      ctx.fillStyle = i < Player.shield ? CFG.colors.player : 'rgba(78,241,255,0.2)';
      ctx.beginPath();
      ctx.arc(pad + 8 + i * 16, pad + 26, 5, 0, TAU);
      ctx.fill();
    }

    // XP bar spans the bottom.
    const xpFrac = Player.xp / Player.xpNext;
    this.bar(0, h - 6, w, 6, xpFrac, CFG.colors.xp);

    // Bottom-left cluster: three stacked rows, each its own slot.
    const wp = WEAPONS[Player.weapon];
    drawText(ctx, wp.name, pad, h - 62, 12, CFG.colors[wp.color], 'left', true);

    const dashFrac = clamp(1 - Player.dashCd / (CFG.dashCooldown * Player.stats.dashCdMult), 0, 1);
    ctx.fillStyle = dashFrac >= 1 ? CFG.colors.dash : 'rgba(167,255,94,0.35)';
    ctx.beginPath();
    ctx.arc(pad + 12, h - 38, 8, -Math.PI / 2, -Math.PI / 2 + dashFrac * TAU);
    ctx.lineTo(pad + 12, h - 38);
    ctx.fill();
    drawText(ctx, 'DASH', pad + 28, h - 38, 10, CFG.colors.uiDim, 'left', true);

    // Level chip: centered above the XP bar, own clear slot.
    drawText(ctx, 'LVL ' + Player.level, w / 2, h - 17, 13, CFG.colors.xp, 'center', true);

    // Score / wave top right.
    drawText(ctx, 'SCORE ' + Player.score, w - pad, pad + 2, 15, CFG.colors.ui, 'right', true);
    drawText(ctx, 'WAVE ' + Waves.wave, w - pad, pad + 22, 12, CFG.colors.uiDim, 'right', true);
    drawText(ctx, 'CREDITS ' + Player.credits, w - pad, pad + 40, 11, CFG.colors.gold, 'right', true);

    // Combo meter center top (sits below the boss bar when a boss is out).
    if (Player.combo > 1) {
      const mult = (1 + Math.min(CFG.comboMaxMult - 1, Player.combo * 0.05)).toFixed(1);
      const pulse = 1 + Math.sin(performance.now() / 60) * 0.05;
      ctx.save();
      ctx.translate(w / 2, Boss.active ? pad + 86 : pad + 14);
      ctx.scale(pulse, pulse);
      drawText(ctx, 'x' + mult + '  ' + Player.combo + ' COMBO', 0, 0, 16,
        mult >= 2 ? CFG.colors.gold : CFG.colors.ui, 'center', true);
      ctx.restore();
    }

    // Boss bar.
    if (Boss.active) {
      const bw = Math.min(520, w - 200);
      const bx = (w - bw) / 2;
      this.bar(bx, pad + 44, bw, 12, Boss.hp / Boss.maxHp, CFG.colors.boss);
      drawText(ctx, Boss.name, w / 2, pad + 36, 13, CFG.colors.boss, 'center', true);
      drawText(ctx, 'PHASE ' + Boss.phase + '/' + Boss.def.phases, w / 2, pad + 66, 10, CFG.colors.uiDim, 'center', true);
    }

    // Wave banner during intro.
    if (Waves.inIntro && Waves.betweenT > 0.6) {
      const t = Waves.betweenT / CFG.waveIntroTime;
      ctx.globalAlpha = Math.min(1, t * 2.2);
      if (Waves.bossWave) {
        drawText(ctx, 'WAVE ' + Waves.wave, w / 2, h * 0.3, 42, CFG.colors.boss, 'center', true);
        drawText(ctx, Boss.name + ' APPROACHES', w / 2, h * 0.3 + 42, 18, CFG.colors.ui, 'center', true);
      } else {
        drawText(ctx, 'WAVE ' + Waves.wave, w / 2, h * 0.3, 42, CFG.colors.ui, 'center', true);
        drawText(ctx, (Waves.totalThisWave) + ' HOSTILES', w / 2, h * 0.3 + 42, 15, CFG.colors.uiDim, 'center', true);
      }
      ctx.globalAlpha = 1;
    }

    // Minimap bottom right.
    this.drawMinimap(w - pad - 130, h - pad - 104, 130, 100);
  },

  drawMinimap(x, y, w, h) {
    ctx.fillStyle = 'rgba(4,4,12,0.7)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(78,241,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    const sx = w / CFG.arenaW, sy = h / CFG.arenaH;
    for (const o of World.obstacles) {
      ctx.fillStyle = 'rgba(120,160,255,0.25)';
      ctx.fillRect(x + o.x * sx, y + o.y * sy, o.w * sx, o.h * sy);
    }
    for (let i = 0; i < Enemies.list.count; i++) {
      const e = Enemies.list.items[i];
      if (!e.alive) continue;
      ctx.fillStyle = e.elite ? '#fff' : '#ff5c7a';
      ctx.fillRect(x + e.x * sx - 1, y + e.y * sy - 1, 2.5, 2.5);
    }
    if (Boss.active) {
      ctx.fillStyle = CFG.colors.boss;
      ctx.fillRect(x + Boss.x * sx - 3, y + Boss.y * sy - 3, 6, 6);
    }
    for (const it of Pickups.items) {
      ctx.fillStyle = it.kind === 'health' ? CFG.colors.hp : CFG.colors.gold;
      ctx.fillRect(x + it.x * sx - 1, y + it.y * sy - 1, 3, 3);
    }
    ctx.fillStyle = CFG.colors.player;
    ctx.fillRect(x + Player.x * sx - 2, y + Player.y * sy - 2, 4, 4);
  },

  // Cinematic intro v2: warp starfield, the void core, letter-by-letter
  // title assembly. Plays on every launch, skippable any time.
  intro: { t: 0, active: false, stars: null, seeds: null },

  startIntro() {
    this.intro.active = true;
    this.intro.t = 0;
    this.enterT = 0;
    this.intro.stars = [];
    for (let i = 0; i < 150; i++) {
      this.intro.stars.push({ a: rand(0, TAU), d: rand(10, 700), s: rand(0.5, 1.8), w: rand(0.4, 1) });
    }
    this.intro.seeds = [];
    for (let i = 0; i < 16; i++) this.intro.seeds.push(rand(0, 1000));
  },

  drawIntro(dt) {
    const it = this.intro;
    it.t += dt;
    const T = it.t;
    const w = this.vw(), h = this.vh();
    const cx = w / 2, cy = h / 2;
    const ty = cy + 8;
    const motion = this.motion();
    const seg = (a, b) => clamp((T - a) / (b - a), 0, 1);

    ctx.fillStyle = '#030309';
    ctx.fillRect(0, 0, w, h);

    // Drifting nebula wash.
    let g = ctx.createRadialGradient(
      cx + Math.sin(T * 0.21) * w * 0.18, cy + Math.cos(T * 0.17) * h * 0.14, 0,
      cx + Math.sin(T * 0.21) * w * 0.18, cy + Math.cos(T * 0.17) * h * 0.14, Math.max(w, h) * 0.55);
    g.addColorStop(0, 'rgba(64,40,160,0.16)');
    g.addColorStop(1, 'rgba(64,40,160,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    g = ctx.createRadialGradient(
      cx + Math.cos(T * 0.13 + 2) * w * 0.25, cy + Math.sin(T * 0.19 + 1) * h * 0.2, 0,
      cx + Math.cos(T * 0.13 + 2) * w * 0.25, cy + Math.sin(T * 0.19 + 1) * h * 0.2, Math.max(w, h) * 0.5);
    g.addColorStop(0, 'rgba(20,120,170,0.10)');
    g.addColorStop(1, 'rgba(20,120,170,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Warp starfield, streaks accelerating outward.
    const maxR = Math.hypot(w, h) * 0.6;
    const warp = motion ? 1 : 0.15;
    for (const s of it.stars) {
      s.d += (30 + 90 * s.w) * warp * dt * (1 + T * 0.06);
      if (s.d > maxR) { s.d = rand(4, 40); s.a = rand(0, TAU); }
      const px = cx + Math.cos(s.a) * s.d;
      const py = cy + Math.sin(s.a) * s.d;
      const streak = clamp(s.d / maxR, 0, 1) * 26 * warp * s.w;
      const qx = cx + Math.cos(s.a) * (s.d - streak);
      const qy = cy + Math.sin(s.a) * (s.d - streak);
      ctx.globalAlpha = 0.25 + 0.55 * clamp(s.d / maxR, 0, 1);
      ctx.strokeStyle = s.w > 0.85 ? CFG.colors.player : '#cfe6ff';
      ctx.lineWidth = s.s;
      ctx.beginPath();
      ctx.moveTo(qx, qy);
      ctx.lineTo(px, py);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Letterbox bars slide in.
    const barH = h * 0.13 * (motion ? Math.min(1, T / 0.9) : 1);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, barH);
    ctx.fillRect(0, h - barH, w, barH);

    if (!motion) {
      // Reduced motion: quiet version.
      const p = seg(0.3, 1.0);
      ctx.globalAlpha = p;
      drawText(ctx, 'VOIDBREAKER', cx, ty, Math.min(64, w / 12), '#e9ffff', 'center', true);
      if (T > 1.2) drawText(ctx, 'THE VOID SENDS ITS WAVES. SEND THEM BACK.', cx, cy + 66, 14, CFG.colors.uiDim, 'center', false);
      if (T > 2.2 && Math.sin(T * 4) > -0.2) {
        drawText(ctx, 'PRESS ANY KEY OR TAP TO ENTER', cx, h * 0.74, 14, CFG.colors.player, 'center', true);
      }
      ctx.globalAlpha = 1;
      if (T > 5.5) Game.goMenu();
      return;
    }

    // Stage 1: lore lines type in, hold, fade.
    const lore = [
      'THE SIGNAL CAME FROM OUTSIDE THE CHART.',
      'IT DID NOT ASK PERMISSION.',
      'NOW THE VOID SENDS EVERYTHING IT HAS.',
    ];
    for (let i = 0; i < lore.length; i++) {
      const t0 = 1.6 + i * 1.15;
      const p = seg(t0, t0 + 0.5);
      const out = 1 - seg(t0 + 1.15, t0 + 1.5);
      if (p <= 0 || out <= 0) continue;
      const typed = Math.floor(clamp(p * 1.4, 0, 1) * lore[i].length);
      ctx.globalAlpha = Math.min(p * 2, out);
      drawText(ctx, lore[i].slice(0, typed), cx, cy - 60 + i * 24, 14, CFG.colors.uiDim, 'center', false);
    }
    ctx.globalAlpha = 1;

    // Stage 2: the void core forms, strains, cracks.
    const cp = seg(4.9, 8.4);
    if (cp > 0) {
      const shake = cp > 0.86 ? (cp - 0.86) * 10 : 0;
      ctx.save();
      ctx.translate(cx + rand(-shake, shake), cy + rand(-shake, shake));
      const R = 6 + 40 * cp * cp;
      const rot = T * 1.4;
      for (let k = 0; k < 3; k++) {
        ctx.globalAlpha = 0.5 * cp;
        ctx.strokeStyle = k === 1 ? CFG.colors.player : '#8fb8ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, R * (1.2 + k * 0.35), R * (0.45 + k * 0.2), rot * (k % 2 ? -1 : 1), 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = cp;
      ctx.strokeStyle = '#e9ffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const sides = 6;
      for (let i = 0; i <= sides; i++) {
        const a2 = (i / sides) * TAU + rot * 0.6;
        const rr = R * (0.8 + Math.sin(T * 7 + i * 2) * 0.06);
        const px = Math.cos(a2) * rr, py = Math.sin(a2) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      if (cp > 0.5) {
        ctx.globalAlpha = (cp - 0.5) * 0.8;
        ctx.fillStyle = 'rgba(78,241,255,0.25)';
        ctx.fill();
      }
      // Particles converging into the core.
      const pp = seg(5.2, 8.35);
      if (pp > 0 && pp < 1) {
        ctx.fillStyle = '#bfe3ff';
        for (let i = 0; i < 46; i++) {
          const sd = it.seeds[i % it.seeds.length];
          const d = (90 + (sd % 320)) * (1 - pp * pp);
          const a3 = sd * 0.017 + i;
          ctx.globalAlpha = 0.2 + 0.6 * pp;
          ctx.fillRect(cx + Math.cos(a3) * d - 1, cy + Math.sin(a3) * d - 1, 2, 2);
        }
      }
      // Cracks near the end.
      if (cp > 0.86) {
        const ck = (cp - 0.86) / 0.14;
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.3 + ck * 0.6).toFixed(2) + ')';
        ctx.lineWidth = 1;
        for (let i = 0; i < 7; i++) {
          const a3 = it.seeds[i] * 0.017;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          let lx = 0, ly = 0;
          for (let k = 1; k <= 3; k++) {
            lx += Math.cos(a3 + (it.seeds[(i + k) % 16] - 8) * 0.2) * R * 0.5;
            ly += Math.sin(a3 + (it.seeds[(i + k) % 16] - 8) * 0.2) * R * 0.5;
            ctx.lineTo(lx, ly);
          }
          ctx.stroke();
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // Stage 3: shatter. Flash, shockwave, debris.
    const fp = seg(8.4, 8.8);
    if (fp > 0) {
      ctx.globalAlpha = 1 - fp;
      ctx.strokeStyle = CFG.colors.player;
      ctx.lineWidth = 6 * (1 - fp) + 1;
      ctx.beginPath();
      ctx.arc(cx, cy, fp * maxR * 0.8, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = Math.max(0, 0.85 - fp * 1.8);
      ctx.fillStyle = '#dff6ff';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      if (fp < 1) {
        ctx.fillStyle = '#e9ffff';
        for (let i = 0; i < 60; i++) {
          const a3 = it.seeds[i % 16] * 0.41 + i * 0.37;
          const d = fp * (140 + (i * 37) % 260);
          ctx.globalAlpha = 1 - fp;
          ctx.fillRect(cx + Math.cos(a3) * d, cy + Math.sin(a3) * d, 2.5, 2.5);
        }
        ctx.globalAlpha = 1;
      }
    }

    // Stage 4: the title assembles letter by letter.
    const word = 'VOIDBREAKER';
    const size = Math.min(64, w / 11);
    const lw = size * 0.66;
    const totalW = lw * word.length;
    for (let i = 0; i < word.length; i++) {
      const t0 = 8.85 + i * 0.085;
      const p = seg(t0, t0 + 0.5);
      if (p <= 0) continue;
      const sd = it.seeds[i % 16];
      const ease = 1 - Math.pow(1 - p, 3);
      const lx = cx - totalW / 2 + lw * (i + 0.5);
      const dx = (1 - ease) * (sd % 2 ? 1 : -1) * 90;
      const dy = (1 - ease) * ((Math.floor(sd) % 5) - 2) * 30;
      ctx.save();
      ctx.translate(lx + dx, ty + dy);
      ctx.scale(1 + (1 - ease) * 0.7, 1 + (1 - ease) * 0.7);
      ctx.globalAlpha = ease;
      if (p < 1) {
        drawText(ctx, word[i], 2.5, 0, size, 'rgba(255,77,109,0.5)', 'center', true);
        drawText(ctx, word[i], -2.5, 0, size, 'rgba(78,241,255,0.5)', 'center', true);
      }
      drawText(ctx, word[i], 0, 0, size, '#e9ffff', 'center', true);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // Neon underglow + a rare horizontal glitch slice once assembled.
    const full = seg(9.7, 10.1);
    if (full > 0) {
      ctx.globalAlpha = full * (0.5 + Math.sin(T * 3) * 0.2);
      drawText(ctx, word, cx, ty + 3, size, 'rgba(78,241,255,0.22)', 'center', true);
      ctx.globalAlpha = 1;
      if (Math.sin(T * 9.7) > 0.986) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx - totalW / 2, ty - size * 0.4, totalW, size * 0.35);
        ctx.clip();
        ctx.translate(5, 0);
        drawText(ctx, word, cx, ty, size, 'rgba(255,92,122,0.8)', 'center', true);
        ctx.restore();
      }
    }

    // Stage 5: tagline, credit, prompt.
    const tp = seg(11.3, 13.1);
    if (tp > 0) {
      const msg = 'THE VOID SENDS ITS WAVES. SEND THEM BACK.';
      const chars = Math.floor(clamp((T - 11.3) / 1.3, 0, 1) * msg.length);
      drawText(ctx, msg.slice(0, chars), cx, cy + 66, 14, CFG.colors.uiDim, 'center', false);
    }
    const cr = seg(12.5, 13.1);
    if (cr > 0) {
      ctx.globalAlpha = cr;
      drawText(ctx, 'BUILT WITH FO', cx, h - barH - 30, 11, 'rgba(207,230,255,0.45)', 'center', false);
      ctx.globalAlpha = 1;
    }
    if (T > 13.4 && Math.sin(T * 4) > -0.2) {
      drawText(ctx, 'PRESS ANY KEY OR TAP TO ENTER', cx, h * 0.74, 14, CFG.colors.player, 'center', true);
    }
    // Skip hint.
    if (T > 2 && T < 13.2) {
      ctx.globalAlpha = 0.4 + 0.2 * Math.sin(T * 2);
      drawText(ctx, 'PRESS ANY KEY TO SKIP', w - 20, h - barH - 18, 10, 'rgba(207,230,255,0.5)', 'right', false);
      ctx.globalAlpha = 1;
    }
    // Hand off to the menu once the show ends.
    if (T > 15.2) Game.goMenu();
  },

  // Main menu ------------------------------------------------------
  menuT: 0,
  menuItems: [],
  hoverIndex: -1,

  drawMenu(dt) {
    this.menuT += dt;
    this.enterT += dt;
    const w = this.vw(), h = this.vh();
    ctx.fillStyle = '#04040c';
    ctx.fillRect(0, 0, w, h);
    const drift = this.menuT * 8;
    for (let i = 0; i < 130; i++) {
      const sx = ((i * 211 + 89) % w + drift * (0.2 + (i % 4) * 0.1)) % w;
      const sy = (i * 149 + 53) % h;
      ctx.globalAlpha = 0.1 + ((i * 53) % 10) / 25;
      ctx.fillStyle = i % 11 === 0 ? CFG.colors.player : '#fff';
      ctx.fillRect(sx, sy, i % 9 === 0 ? 2 : 1, i % 9 === 0 ? 2 : 1);
    }
    ctx.globalAlpha = 1;

    const t1 = this.st(0, 0.5);
    ctx.save();
    ctx.translate(w / 2, h * 0.18 + t1.oy);
    ctx.globalAlpha = t1.a;
    const ts = Math.min(56, w / 13);
    const sc = 1 + (1 - t1.p) * 0.12;
    ctx.scale(sc, sc);
    drawText(ctx, 'VOIDBREAKER', 0, 0, ts, '#e9ffff', 'center', true);
    drawText(ctx, 'WAVE SURVIVAL ROGUELITE', 0, 40, 13, CFG.colors.uiDim, 'center', false);
    ctx.restore();
    ctx.globalAlpha = 1;

    const d = Save.data;
    const t2 = this.st(1, 0.4, 0.1);
    ctx.globalAlpha = t2.a;
    drawText(ctx,
      'BEST ' + d.best + '   WAVE ' + d.bestWave + '   RUNS ' + d.runs + '   KILLS ' + d.totalKills,
      w / 2, h * 0.30 + t2.oy, 12, CFG.colors.uiDim, 'center', false);
    ctx.globalAlpha = 1;

    const items = [
      { id: 'play', label: 'PLAY', sub: '' },
      { id: 'shop', label: 'UPGRADES', sub: d.credits + ' CR' },
      { id: 'howto', label: 'HOW TO PLAY', sub: '' },
      { id: 'devlog', label: 'DEV LOG', sub: 'v' + CFG.version },
      { id: 'settings', label: 'SETTINGS', sub: '' },
    ];
    this.menuItems = items;
    this.hoverIndex = -1;
    const my = h * 0.40;
    if (Game.mouseX !== undefined) {
      for (let i = 0; i < items.length; i++) {
        if (Game.inRect(Game.mouseX, Game.mouseY, w / 2 - 170, my + i * 50 - 18, 340, 34)) {
          this.hoverIndex = i;
        }
      }
    }
    for (let i = 0; i < items.length; i++) {
      const s = this.st(i + 2, 0.45);
      if (s.a <= 0.01) continue;
      const iy = my + i * 50 + s.oy;
      const hovered = this.hoverIndex === i;
      const label = items[i].label + (items[i].sub ? '   ' + items[i].sub : '');
      if (hovered) {
        ctx.globalAlpha = s.a * 0.12;
        ctx.fillStyle = 'rgba(78,241,255,0.9)';
        ctx.fillRect(w / 2 - 170, iy - 18, 340, 34);
        ctx.globalAlpha = s.a * 0.5;
        ctx.strokeStyle = 'rgba(78,241,255,0.9)';
        ctx.lineWidth = 1;
        ctx.strokeRect(w / 2 - 170, iy - 18, 340, 34);
      }
      ctx.globalAlpha = s.a;
      drawText(ctx, (hovered ? '> ' : '') + label, w / 2, iy, 17,
        hovered ? CFG.colors.player : CFG.colors.ui, 'center', true);
      ctx.globalAlpha = 1;
    }
    const t3 = this.st(7, 0.4, 0.2);
    ctx.globalAlpha = t3.a * 0.35;
    drawText(ctx, 'v' + CFG.version + '  WASD move  mouse aim  click fire  space dash  P pause',
      w / 2, h - 24, 11, 'rgba(207,230,255,1)', 'center', false);
    ctx.globalAlpha = 1;
  },

  // Level-up card picker -------------------------------------------
  levelChoices: [],

  drawLevelUp(dt) {
    this.enterT += dt;
    const w = this.vw(), h = this.vh();

    ctx.fillStyle = 'rgba(2,2,8,0.72)';
    ctx.fillRect(0, 0, w, h);
    const t0 = this.st(0, 0.35);
    ctx.globalAlpha = t0.a;
    drawText(ctx, 'LEVEL ' + Player.level, w / 2, h * 0.16 + t0.oy, 34, CFG.colors.xp, 'center', true);
    drawText(ctx, 'CHOOSE AN UPGRADE', w / 2, h * 0.16 + 34 + t0.oy, 13, CFG.colors.uiDim, 'center', false);
    ctx.globalAlpha = 1;

    const cw = Math.min(230, (w - 80) / 3), ch = 210;
    const gap = 24;
    const totalW = cw * 3 + gap * 2;
    const x0 = (w - totalW) / 2;
    const y0 = h * 0.34;
    for (let i = 0; i < this.levelChoices.length; i++) {
      const u = this.levelChoices[i];
      const cx = x0 + i * (cw + gap);
      const hover = this.hoverIndex === i;
      const pop = clamp((this.enterT - 0.15 - i * 0.08) / 0.3, 0, 1);
      const pe = 1 - Math.pow(1 - pop, 3);
      const oy = (1 - pe) * 24;
      ctx.globalAlpha = pe;
      this.panel(cx, y0 + oy, cw, ch, hover ? 0.94 : 0.85);
      if (hover) {
        ctx.strokeStyle = CFG.colors.player;
        ctx.lineWidth = 2;
        ctx.strokeRect(cx, y0 + oy, cw, ch);
      }
      drawText(ctx, u.name, cx + cw / 2, y0 + oy + 38, 15, CFG.colors.player, 'center', true);
      const owned = (Player._upgradeCounts && Player._upgradeCounts[u.id]) || 0;
      drawText(ctx, 'LV ' + owned + '/' + u.max, cx + cw / 2, y0 + oy + 60, 10, CFG.colors.uiDim, 'center', false);
      const words = u.desc.split(' ');
      let line1 = '', line2 = '';
      for (const wd of words) {
        if ((line1 + ' ' + wd).length < 24 && !line2) line1 += (line1 ? ' ' : '') + wd;
        else line2 += (line2 ? ' ' : '') + wd;
      }
      drawText(ctx, line1, cx + cw / 2, y0 + oy + 105, 13, CFG.colors.ui, 'center', false);
      drawText(ctx, line2, cx + cw / 2, y0 + oy + 126, 13, CFG.colors.ui, 'center', false);
      drawText(ctx, '[' + (i + 1) + ']', cx + cw / 2, y0 + oy + ch - 24, 12, CFG.colors.uiDim, 'center', false);
      ctx.globalAlpha = 1;
    }
  },

  // Pause ----------------------------------------------------------
  pauseItems: [],

  drawPause(dt) {
    this.enterT += dt;
    const w = this.vw(), h = this.vh();
    ctx.fillStyle = 'rgba(2,2,8,0.6)';
    ctx.fillRect(0, 0, w, h);
    const s0 = this.st(0, 0.35);
    const px = w / 2 - 180, py = h * 0.28 + s0.oy, pw = 360, ph = 250;
    ctx.globalAlpha = s0.a;
    this.panel(px, py, pw, ph, 0.92);
    drawText(ctx, 'PAUSED', w / 2, py + 44, 32, CFG.colors.ui, 'center', true);
    const items = ['RESUME', 'SETTINGS', 'ABANDON RUN'];
    this.hoverIndex = -1;
    if (Game.mouseX !== undefined) {
      for (let i = 0; i < items.length; i++) {
        if (Game.inRect(Game.mouseX, Game.mouseY, w / 2 - 150, py + 96 + i * 46 - 16, 300, 32)) {
          this.hoverIndex = i;
        }
      }
    }
    for (let i = 0; i < items.length; i++) {
      const s = this.st(i + 1, 0.35, 0.08);
      const iy = py + 96 + i * 46;
      const hovered = this.hoverIndex === i;
      drawText(ctx, (hovered ? '> ' : '') + items[i], w / 2, iy, 16,
        hovered ? CFG.colors.player : CFG.colors.ui, 'center', true);
    }
    ctx.globalAlpha = 1;
    this.pauseItems = items;
    this.pauseRect = { x: w / 2 - 150, y: py + 96, w: 300, rowH: 46 };
  },

  // Game over ------------------------------------------------------
  gameoverItems: [],

  drawGameOver(dt) {
    this.enterT += dt;
    const w = this.vw(), h = this.vh();
    const pulse = 0.72 + Math.sin(this.enterT * 2) * 0.04;
    ctx.fillStyle = 'rgba(2,2,8,' + pulse + ')';
    ctx.fillRect(0, 0, w, h);
    const t0 = this.st(0, 0.55);
    ctx.globalAlpha = t0.a;
    const sc = 1 + (1 - t0.p) * 0.25;
    ctx.save();
    ctx.translate(w / 2, h * 0.18 + t0.oy);
    ctx.scale(sc, sc);
    drawText(ctx, 'RUN TERMINATED', 0, 0, 36, CFG.colors.hpLow, 'center', true);
    ctx.restore();
    ctx.globalAlpha = 1;

    const s = Game.lastRun;
    if (s) {
      const lines = [
        'SCORE ' + s.score + (s.newBest ? '   NEW BEST!' : ''),
        'WAVE ' + s.wave + '   KILLS ' + s.kills + '   LEVEL ' + s.level,
        'CREDITS EARNED ' + s.credits + '   TOTAL ' + Save.data.credits,
      ];
      for (let i = 0; i < lines.length; i++) {
        const st = this.st(i + 1, 0.4, 0.15);
        ctx.globalAlpha = st.a;
        drawText(ctx, lines[i], w / 2, h * 0.32 + i * 30 + st.oy, 15, CFG.colors.ui, 'center', false);
      }
      ctx.globalAlpha = 1;
    }
    const items = ['PLAY AGAIN', 'UPGRADES', 'MENU'];
    this.hoverIndex = -1;
    if (Game.mouseX !== undefined) {
      for (let i = 0; i < items.length; i++) {
        if (Game.inRect(Game.mouseX, Game.mouseY, w / 2 - 120, h * 0.6 + i * 46 - 16, 240, 32)) {
          this.hoverIndex = i;
        }
      }
    }
    for (let i = 0; i < items.length; i++) {
      const st = this.st(i + 4, 0.4, 0.2);
      const iy = h * 0.6 + i * 46 + st.oy;
      if (st.a <= 0.01) continue;
      const hovered = this.hoverIndex === i;
      ctx.globalAlpha = st.a;
      drawText(ctx, (hovered ? '> ' : '') + items[i], w / 2, iy, 16,
        hovered ? CFG.colors.player : CFG.colors.ui, 'center', true);
      ctx.globalAlpha = 1;
    }
    this.gameoverItems = items;
  },

  // Shop: responsive rows, scrolls when the screen is short. -------
  shopScroll: 0,
  shopRect: null,

  drawShop(dt) {
    this.enterT += dt;
    const w = this.vw(), h = this.vh();
    ctx.fillStyle = '#04040c';
    ctx.fillRect(0, 0, w, h);
    const t0 = this.st(0, 0.4);
    ctx.globalAlpha = t0.a;
    drawText(ctx, 'PERMANENT UPGRADES', w / 2, 36 + t0.oy, 24, CFG.colors.gold, 'center', true);
    drawText(ctx, 'CREDITS: ' + Save.data.credits, w / 2, 64 + t0.oy, 14, CFG.colors.uiDim, 'center', false);
    ctx.globalAlpha = 1;

    const pw = Math.min(620, w - 24);
    const x0 = (w - pw) / 2;
    const top = 92;
    const bottom = h - 56;
    const rowH = 62;
    const viewH = Math.max(120, bottom - top);
    const contentH = META_SHOP.length * rowH;
    this.shopScroll = clamp(this.shopScroll, 0, Math.max(0, contentH - viewH));
    this.shopRect = { x0, pw, top, bottom, rowH };

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top - 4, w, viewH + 8);
    ctx.clip();
    for (let i = 0; i < META_SHOP.length; i++) {
      const it = META_SHOP[i];
      const lvl = Save.metaLevel(it.id);
      const cost = Math.round(it.cost * Math.pow(it.scale, lvl));
      const iy = top + i * rowH - this.shopScroll;
      if (iy + rowH < top - 12 || iy > bottom + 12) continue;
      const s = this.st(i + 1, 0.4, 0.05);
      if (s.a <= 0.01) continue;
      const ry = iy + s.oy;
      ctx.globalAlpha = s.a;
      this.panel(x0, ry, pw, rowH - 8, 0.85);
      drawText(ctx, it.name, x0 + 20, ry + 24, 15, CFG.colors.ui, 'left', true);
      drawText(ctx, it.desc, x0 + 20, ry + 45, 12, CFG.colors.uiDim, 'left', false);
      drawText(ctx, 'LV ' + lvl + '/' + it.max, x0 + pw * 0.56, ry + 24, 12, CFG.colors.xp, 'left', true);
      if (lvl >= it.max) {
        drawText(ctx, 'MAXED', x0 + pw - 90, ry + 28, 14, CFG.colors.hp, 'center', true);
      } else {
        const afford = Save.data.credits >= cost;
        drawText(ctx, cost + ' CR', x0 + pw - 90, ry + 28, 15,
          afford ? CFG.colors.gold : 'rgba(255,210,87,0.4)', 'center', true);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Scrollbar when the list outgrows the screen.
    if (contentH > viewH) {
      const trackX = x0 + pw + 10;
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(trackX, top, 5, viewH);
      const thumbH = Math.max(24, viewH * viewH / contentH);
      const thumbY = top + (viewH - thumbH) * (this.shopScroll / (contentH - viewH));
      ctx.fillStyle = 'rgba(78,241,255,0.5)';
      ctx.fillRect(trackX, thumbY, 5, thumbH);
      drawText(ctx, 'SCROLL WITH MOUSE WHEEL OR DRAG', x0 + pw / 2, bottom + 14, 10, 'rgba(207,230,255,0.35)', 'center', false);
    }
    drawText(ctx, 'CLICK AN ITEM TO BUY   [ESC] BACK', w / 2, h - 24, 12, CFG.colors.uiDim, 'center', false);
  },

  // Settings -------------------------------------------------------
  settingsItems: [],

  drawSettings(dt) {
    this.enterT += dt;
    const w = this.vw(), h = this.vh();
    ctx.fillStyle = '#04040c';
    ctx.fillRect(0, 0, w, h);
    const t0 = this.st(0, 0.4);
    ctx.globalAlpha = t0.a;
    drawText(ctx, 'SETTINGS', w / 2, h * 0.16 + t0.oy, 26, CFG.colors.ui, 'center', true);
    ctx.globalAlpha = 1;
    const s = Save.data.settings;
    const items = [
      'SFX VOLUME   ' + Math.round(s.sfx * 100) + '%',
      'MUSIC VOLUME ' + Math.round(s.music * 100) + '%',
      'SCREEN SHAKE ' + (s.shake > 0 ? 'ON' : 'OFF'),
      'REDUCED MOTION ' + (s.reducedMotion ? 'ON' : 'OFF'),
      'RESET SAVE DATA',
      'BACK',
    ];
    this.hoverIndex = -1;
    if (Game.mouseX !== undefined) {
      for (let i = 0; i < items.length; i++) {
        if (Game.inRect(Game.mouseX, Game.mouseY, w / 2 - 180, h * 0.32 + i * 50 - 16, 360, 32)) {
          this.hoverIndex = i;
        }
      }
    }
    for (let i = 0; i < items.length; i++) {
      const st = this.st(i + 1, 0.35);
      const iy = h * 0.32 + i * 50 + st.oy;
      if (st.a <= 0.01) continue;
      const hovered = this.hoverIndex === i;
      ctx.globalAlpha = st.a;
      drawText(ctx, (hovered ? '> ' : '') + items[i], w / 2, iy, 16,
        hovered ? CFG.colors.player : CFG.colors.ui, 'center', true);
      ctx.globalAlpha = 1;
    }
    this.settingsItems = items;
  },

  // How to play ----------------------------------------------------
  drawHowTo(dt) {
    this.enterT += dt;
    const w = this.vw(), h = this.vh();
    ctx.fillStyle = '#04040c';
    ctx.fillRect(0, 0, w, h);
    const t0 = this.st(0, 0.4);
    ctx.globalAlpha = t0.a;
    drawText(ctx, 'HOW TO PLAY', w / 2, h * 0.12 + t0.oy, 26, CFG.colors.ui, 'center', true);
    ctx.globalAlpha = 1;
    const lines = [
      'MOVE with WASD or the left stick.',
      'AIM with the mouse or the right stick.',
      'FIRE by holding click, or automatically with the right stick.',
      'DASH with SPACE. You are invincible during a dash.',
      '',
      'Kill everything. Collect the blue gems to level up.',
      'Each level: pick one of three upgrades. Build a run.',
      'Every 5th wave a boss arrives. Learn its tells.',
      'Elites are white-named. They hit harder and drop triple rewards.',
      '',
      'Credits carry between runs. Spend them on permanent upgrades.',
      'The combo meter multiplies your score. Do not get hit.',
    ];
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i]) continue;
      const st = this.st(i + 1, 0.35, 0.05);
      ctx.globalAlpha = st.a;
      drawText(ctx, lines[i], w / 2, h * 0.2 + i * 30 + st.oy, 14, CFG.colors.ui, 'center', false);
      ctx.globalAlpha = 1;
    }
    const t9 = this.st(13, 0.4, 0.15);
    ctx.globalAlpha = t9.a;
    drawText(ctx, 'CLICK OR PRESS ESC TO RETURN', w / 2, h - 40, 12, CFG.colors.uiDim, 'center', false);
    ctx.globalAlpha = 1;
  },

  // Dev log: the shipped-change history, readable in game. ---------
  devlogScroll: 0,

  drawDevLog(dt) {
    this.enterT += dt;
    const w = this.vw(), h = this.vh();
    ctx.fillStyle = '#04040c';
    ctx.fillRect(0, 0, w, h);
    const t0 = this.st(0, 0.4);
    ctx.globalAlpha = t0.a;
    drawText(ctx, 'DEV LOG', w / 2, 34 + t0.oy, 26, CFG.colors.ui, 'center', true);
    drawText(ctx, 'EVERYTHING WE SHIPPED', w / 2, 60 + t0.oy, 12, CFG.colors.uiDim, 'center', false);
    ctx.globalAlpha = 1;

    // Build the line list: version header + its entries.
    const lines = [];
    for (const rel of CHANGELOG) {
      lines.push({ text: 'v' + rel.v + '  ' + rel.title, color: CFG.colors.gold, size: 14, bold: true, gap: true });
      for (const e of rel.entries) {
        lines.push({ text: e, color: CFG.colors.ui, size: 12, bold: false, gap: false });
      }
      lines.push({ text: '', color: '', size: 8, bold: false, gap: false });
    }

    const pw = Math.min(640, w - 24);
    const x0 = (w - pw) / 2;
    const top = 84;
    const bottom = h - 56;
    const lh = 22;
    const viewH = Math.max(120, bottom - top);
    const contentH = lines.length * lh;
    this.devlogScroll = clamp(this.devlogScroll, 0, Math.max(0, contentH - viewH));

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top - 4, w, viewH + 8);
    ctx.clip();
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const iy = top + i * lh - this.devlogScroll;
      if (iy + lh < top - 10 || iy > bottom + 10) continue;
      const s = this.st(i, 0.3, 0.04);
      if (s.a <= 0.01) continue;
      ctx.globalAlpha = s.a;
      drawText(ctx, ln.text, w / 2, iy + lh / 2 + s.oy, ln.size, ln.color, 'center', ln.bold);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    if (contentH > viewH) {
      const trackX = x0 + pw + 10;
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(trackX, top, 5, viewH);
      const thumbH = Math.max(24, viewH * viewH / contentH);
      const thumbY = top + (viewH - thumbH) * (this.devlogScroll / (contentH - viewH));
      ctx.fillStyle = 'rgba(78,241,255,0.5)';
      ctx.fillRect(trackX, thumbY, 5, thumbH);
      drawText(ctx, 'SCROLL WITH MOUSE WHEEL', w / 2, bottom + 14, 10, 'rgba(207,230,255,0.35)', 'center', false);
    }
    drawText(ctx, 'CLICK OR PRESS ESC TO RETURN', w / 2, h - 24, 12, CFG.colors.uiDim, 'center', false);
  },
};
