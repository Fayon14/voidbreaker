// ============================================================
// UI: HUD, cinematic intro, menus, level-up cards, minimap.
// Everything renders on the game canvas.
// ============================================================
const UI = {
  // Layout helpers ------------------------------------------------
  vw() { return canvas.width / DPR; },
  vh() { return canvas.height / DPR; },

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
    drawText(ctx, 'LVL ' + Player.level, pad, h - 20, 13, CFG.colors.xp, 'left', true);

    // Score / wave top right.
    drawText(ctx, 'SCORE ' + Player.score, w - pad, pad + 2, 15, CFG.colors.ui, 'right', true);
    drawText(ctx, 'WAVE ' + Waves.wave, w - pad, pad + 22, 12, CFG.colors.uiDim, 'right', true);
    drawText(ctx, 'CREDITS ' + Player.credits, w - pad, pad + 40, 11, CFG.colors.gold, 'right', true);

    // Combo meter center top.
    if (Player.combo > 1) {
      const mult = (1 + Math.min(CFG.comboMaxMult - 1, Player.combo * 0.05)).toFixed(1);
      const pulse = 1 + Math.sin(performance.now() / 60) * 0.05;
      ctx.save();
      ctx.translate(w / 2, pad + 14);
      ctx.scale(pulse, pulse);
      drawText(ctx, 'x' + mult + '  ' + Player.combo + ' COMBO', 0, 0, 16,
        mult >= 2 ? CFG.colors.gold : CFG.colors.ui, 'center', true);
      ctx.restore();
    }

    // Weapon name bottom left.
    const wp = WEAPONS[Player.weapon];
    drawText(ctx, wp.name, pad, h - 44, 12, CFG.colors[wp.color], 'left', true);

    // Dash cooldown pip.
    const dashFrac = clamp(1 - Player.dashCd / (CFG.dashCooldown * Player.stats.dashCdMult), 0, 1);
    ctx.fillStyle = dashFrac >= 1 ? CFG.colors.dash : 'rgba(167,255,94,0.35)';
    ctx.beginPath();
    ctx.arc(pad + 14, h - 24, 8, -Math.PI / 2, -Math.PI / 2 + dashFrac * TAU);
    ctx.lineTo(pad + 14, h - 24);
    ctx.fill();
    drawText(ctx, 'DASH', pad + 30, h - 24, 10, CFG.colors.uiDim, 'left', true);

    // Boss bar.
    if (Boss.active) {
      const bw = Math.min(520, w - 200);
      const bx = (w - bw) / 2;
      this.bar(bx, pad + 44, bw, 12, Boss.hp / Boss.maxHp, CFG.colors.boss);
      drawText(ctx, Boss.name, w / 2, pad + 36, 13, CFG.colors.boss, 'center', true);
      drawText(ctx, 'PHASE ' + Boss.phase + '/' + Boss.def.phases, w / 2, pad + 64, 10, CFG.colors.uiDim, 'center', true);
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

  // Cinematic intro: letterbox, drifting starfield, title reveal.
  intro: { t: 0, active: false },

  startIntro() { this.intro.active = true; this.intro.t = 0; },

  drawIntro(dt) {
    const it = this.intro;
    it.t += dt;
    const w = this.vw(), h = this.vh();
    const T = it.t;

    // Background: slow drifting stars over void.
    ctx.fillStyle = '#04040c';
    ctx.fillRect(0, 0, w, h);
    const drift = T * 12;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 90; i++) {
      const sx = ((i * 197 + 61) % w + drift * (0.3 + (i % 5) * 0.14)) % w;
      const sy = (i * 131 + 37) % h;
      const s = i % 7 === 0 ? 2 : 1;
      ctx.globalAlpha = 0.15 + ((i * 37) % 10) / 22;
      ctx.fillRect(sx, sy, s, s);
    }
    ctx.globalAlpha = 1;

    // Letterbox bars slide in over 0.8s.
    const barH = h * 0.14 * Math.min(1, T / 0.8);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, barH);
    ctx.fillRect(0, h - barH, w, barH);

    // Title: zooms from 1.15x to 1x with ease-out, fades in.
    const appear = clamp((T - 0.5) / 1.2, 0, 1);
    const ease = 1 - Math.pow(1 - appear, 3);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    const scale = 1.18 - 0.18 * ease;
    ctx.scale(scale, scale);
    ctx.globalAlpha = ease;
    drawText(ctx, 'VOIDBREAKER', 0, -10, Math.min(64, w / 12), '#e9ffff', 'center', true);
    // Neon underglow.
    ctx.globalAlpha = ease * 0.8;
    drawText(ctx, 'VOIDBREAKER', 0, -8, Math.min(64, w / 12), 'rgba(78,241,255,0.25)', 'center', true);
    ctx.restore();
    ctx.globalAlpha = 1;

    // Tagline types out.
    if (T > 1.4) {
      const msg = 'THE VOID SENDS ITS WAVES. SEND THEM BACK.';
      const chars = Math.floor(clamp((T - 1.4) / 1.2, 0, 1) * msg.length);
      drawText(ctx, msg.slice(0, chars), w / 2, h / 2 + 44, 14, CFG.colors.uiDim, 'center', false);
    }

    // Credits line.
    if (T > 2.6) {
      ctx.globalAlpha = clamp((T - 2.6) / 0.8, 0, 1);
      drawText(ctx, 'BUILT WITH FO', w / 2, h - barH - 26, 11, 'rgba(207,230,255,0.4)', 'center', false);
      ctx.globalAlpha = 1;
    }

    // Prompt blinks.
    if (T > 3.2) {
      const blink = Math.sin(T * 4) > -0.2;
      if (blink) {
        drawText(ctx, 'PRESS ANY KEY OR TAP', w / 2, h * 0.72, 14, CFG.colors.player, 'center', true);
      }
    }
    // Hard skip after 12s.
    if (T > 12) Game.goMenu();
  },

  // Main menu ------------------------------------------------------
  menuT: 0,
  drawMenu(dt) {
    this.menuT += dt;
    const w = this.vw(), h = this.vh();
    // Starfield backdrop with slow drift.
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

    drawText(ctx, 'VOIDBREAKER', w / 2, h * 0.24, Math.min(56, w / 13), '#e9ffff', 'center', true);
    drawText(ctx, 'WAVE SURVIVAL ROGUELITE', w / 2, h * 0.24 + 40, 13, CFG.colors.uiDim, 'center', false);

    // Stats strip.
    const d = Save.data;
    drawText(ctx,
      'BEST ' + d.best + '   WAVE ' + d.bestWave + '   RUNS ' + d.runs + '   KILLS ' + d.totalKills,
      w / 2, h * 0.34, 12, CFG.colors.uiDim, 'center', false);

    // Menu items.
    const items = [
      { id: 'play', label: 'PLAY', sub: '' },
      { id: 'shop', label: 'UPGRADES', sub: d.credits + ' CREDITS' },
      { id: 'howto', label: 'HOW TO PLAY', sub: '' },
      { id: 'settings', label: 'SETTINGS', sub: '' },
    ];
    this.menuItems = items;
    // Hover driven by the last known mouse position.
    this.hoverIndex = -1;
    const my = h * 0.46;
    if (Game.mouseX !== undefined) {
      for (let i = 0; i < items.length; i++) {
        if (Game.inRect(Game.mouseX, Game.mouseY, w / 2 - 170, my + i * 52 - 18, 340, 34)) {
          this.hoverIndex = i;
        }
      }
    }
    for (let i = 0; i < items.length; i++) {
      const iy = my + i * 52;
      const hovered = this.hoverIndex === i;
      const label = items[i].label + (items[i].sub ? '   ' + items[i].sub : '');
      if (hovered) {
        ctx.fillStyle = 'rgba(78,241,255,0.12)';
        ctx.fillRect(w / 2 - 170, iy - 18, 340, 34);
        ctx.strokeStyle = 'rgba(78,241,255,0.5)';
        ctx.strokeRect(w / 2 - 170, iy - 18, 340, 34);
      }
      drawText(ctx, (hovered ? '> ' : '') + label, w / 2, iy, 17,
        hovered ? CFG.colors.player : CFG.colors.ui, 'center', true);
    }
    drawText(ctx, 'v' + CFG.version + '  WASD move  mouse aim  click fire  space dash  P pause',
      w / 2, h - 24, 11, 'rgba(207,230,255,0.35)', 'center', false);
  },

  hoverIndex: -1,
  menuItems: [],

  // Level-up card picker -------------------------------------------
  levelChoices: [],
  levelT: 0,

  drawLevelUp(dt) {
    this.levelT += dt;
    const w = this.vw(), h = this.vh();

    // Dim the frozen battlefield behind.
    ctx.fillStyle = 'rgba(2,2,8,0.72)';
    ctx.fillRect(0, 0, w, h);
    drawText(ctx, 'LEVEL ' + Player.level, w / 2, h * 0.16, 34, CFG.colors.xp, 'center', true);
    drawText(ctx, 'CHOOSE AN UPGRADE', w / 2, h * 0.16 + 34, 13, CFG.colors.uiDim, 'center', false);

    // Three cards.
    const cw = Math.min(230, (w - 80) / 3), ch = 210;
    const gap = 24;
    const totalW = cw * 3 + gap * 2;
    const x0 = (w - totalW) / 2;
    const y0 = h * 0.34;
    for (let i = 0; i < this.levelChoices.length; i++) {
      const u = this.levelChoices[i];
      const cx = x0 + i * (cw + gap);
      const hover = this.hoverIndex === i;
      const pop = clamp((this.levelT - i * 0.08) / 0.25, 0, 1);
      const oy = (1 - (1 - Math.pow(1 - pop, 3))) * 20;
      this.panel(cx, y0 + oy, cw, ch, hover ? 0.94 : 0.85);
      if (hover) {
        ctx.strokeStyle = CFG.colors.player;
        ctx.lineWidth = 2;
        ctx.strokeRect(cx, y0 + oy, cw, ch);
      }
      drawText(ctx, u.name, cx + cw / 2, y0 + oy + 38, 15, CFG.colors.player, 'center', true);
      // Rarity tint bar.
      const owned = (Player._upgradeCounts && Player._upgradeCounts[u.id]) || 0;
      drawText(ctx, 'LV ' + owned + '/' + u.max, cx + cw / 2, y0 + oy + 60, 10, CFG.colors.uiDim, 'center', false);
      // Description wraps to two lines.
      const words = u.desc.split(' ');
      let line1 = '', line2 = '';
      for (const wd of words) {
        if ((line1 + ' ' + wd).length < 24 && !line2) line1 += (line1 ? ' ' : '') + wd;
        else line2 += (line2 ? ' ' : '') + wd;
      }
      drawText(ctx, line1, cx + cw / 2, y0 + oy + 105, 13, CFG.colors.ui, 'center', false);
      drawText(ctx, line2, cx + cw / 2, y0 + oy + 126, 13, CFG.colors.ui, 'center', false);
      drawText(ctx, '[' + (i + 1) + ']', cx + cw / 2, y0 + oy + ch - 24, 12, CFG.colors.uiDim, 'center', false);
    }
  },

  // Pause ----------------------------------------------------------
  drawPause() {
    const w = this.vw(), h = this.vh();
    ctx.fillStyle = 'rgba(2,2,8,0.6)';
    ctx.fillRect(0, 0, w, h);
    drawText(ctx, 'PAUSED', w / 2, h * 0.3, 34, CFG.colors.ui, 'center', true);
    const items = ['RESUME', 'SETTINGS', 'ABANDON RUN'];
    this.hoverIndex = -1;
    if (Game.mouseX !== undefined) {
      for (let i = 0; i < items.length; i++) {
        if (Game.inRect(Game.mouseX, Game.mouseY, w / 2 - 120, h * 0.48 + i * 46 - 16, 240, 32)) {
          this.hoverIndex = i;
        }
      }
    }
    for (let i = 0; i < items.length; i++) {
      const iy = h * 0.48 + i * 46;
      const hovered = this.hoverIndex === i;
      drawText(ctx, (hovered ? '> ' : '') + items[i], w / 2, iy, 16,
        hovered ? CFG.colors.player : CFG.colors.ui, 'center', true);
    }
    this.pauseItems = items;
  },

  // Game over ------------------------------------------------------
  drawGameOver(dt) {
    this.menuT += dt;
    const w = this.vw(), h = this.vh();
    ctx.fillStyle = 'rgba(2,2,8,0.78)';
    ctx.fillRect(0, 0, w, h);
    drawText(ctx, 'RUN TERMINATED', w / 2, h * 0.2, 36, CFG.colors.hpLow, 'center', true);

    const s = Game.lastRun;
    if (s) {
      const lines = [
        'SCORE ' + s.score + (s.newBest ? '   NEW BEST!' : ''),
        'WAVE ' + s.wave + '   KILLS ' + s.kills + '   LEVEL ' + s.level,
        'CREDITS EARNED ' + s.credits + '   TOTAL ' + Save.data.credits,
      ];
      for (let i = 0; i < lines.length; i++) {
        drawText(ctx, lines[i], w / 2, h * 0.32 + i * 30, 15, CFG.colors.ui, 'center', false);
      }
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
      const iy = h * 0.6 + i * 46;
      const hovered = this.hoverIndex === i;
      drawText(ctx, (hovered ? '> ' : '') + items[i], w / 2, iy, 16,
        hovered ? CFG.colors.player : CFG.colors.ui, 'center', true);
    }
    this.gameoverItems = items;
  },

  // Shop -----------------------------------------------------------
  shopScroll: 0,
  drawShop() {
    const w = this.vw(), h = this.vh();
    ctx.fillStyle = '#04040c';
    ctx.fillRect(0, 0, w, h);
    drawText(ctx, 'PERMANENT UPGRADES', w / 2, 40, 24, CFG.colors.gold, 'center', true);
    drawText(ctx, 'CREDITS: ' + Save.data.credits, w / 2, 70, 14, CFG.colors.uiDim, 'center', false);

    const rows = META_SHOP.length;
    const rowH = 64;
    const x0 = w / 2 - 300;
    const y0 = 110;
    for (let i = 0; i < rows; i++) {
      const it = META_SHOP[i];
      const lvl = Save.metaLevel(it.id);
      const cost = Math.round(it.cost * Math.pow(it.scale, lvl));
      const iy = y0 + i * rowH;
      this.panel(x0, iy, 600, rowH - 8, 0.85);
      drawText(ctx, it.name, x0 + 20, iy + 26, 15, CFG.colors.ui, 'left', true);
      drawText(ctx, it.desc, x0 + 20, iy + 46, 12, CFG.colors.uiDim, 'left', false);
      drawText(ctx, 'LV ' + lvl + '/' + it.max, x0 + 260, iy + 26, 12, CFG.colors.xp, 'left', true);
      if (lvl >= it.max) {
        drawText(ctx, 'MAXED', x0 + 470, iy + 30, 14, CFG.colors.hp, 'center', true);
      } else {
        const afford = Save.data.credits >= cost;
        drawText(ctx, cost + ' CR', x0 + 470, iy + 30, 15,
          afford ? CFG.colors.gold : 'rgba(255,210,87,0.4)', 'center', true);
      }
    }
    drawText(ctx, 'CLICK AN ITEM TO BUY   [ESC] BACK', w / 2, h - 30, 12, CFG.colors.uiDim, 'center', false);
  },

  // Settings -------------------------------------------------------
  drawSettings() {
    const w = this.vw(), h = this.vh();
    ctx.fillStyle = '#04040c';
    ctx.fillRect(0, 0, w, h);
    drawText(ctx, 'SETTINGS', w / 2, h * 0.16, 26, CFG.colors.ui, 'center', true);
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
        if (Game.inRect(Game.mouseX, Game.mouseY, w / 2 - 180, h * 0.34 + i * 50 - 16, 360, 32)) {
          this.hoverIndex = i;
        }
      }
    }
    for (let i = 0; i < items.length; i++) {
      const iy = h * 0.34 + i * 50;
      const hovered = this.hoverIndex === i;
      drawText(ctx, (hovered ? '> ' : '') + items[i], w / 2, iy, 16,
        hovered ? CFG.colors.player : CFG.colors.ui, 'center', true);
    }
    this.settingsItems = items;
  },

  // How to play ----------------------------------------------------
  drawHowTo() {
    const w = this.vw(), h = this.vh();
    ctx.fillStyle = '#04040c';
    ctx.fillRect(0, 0, w, h);
    drawText(ctx, 'HOW TO PLAY', w / 2, h * 0.12, 26, CFG.colors.ui, 'center', true);
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
      drawText(ctx, lines[i], w / 2, h * 0.2 + i * 30, 14, CFG.colors.ui, 'center', false);
    }
    drawText(ctx, 'CLICK OR PRESS ESC TO RETURN', w / 2, h - 40, 12, CFG.colors.uiDim, 'center', false);
  },
};
