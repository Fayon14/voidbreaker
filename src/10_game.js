// ============================================================
// Game v1.1: state machine, loop, input, glue.
// Every screen change now runs through the transition driver.
// ============================================================
let canvas = null;
let ctx = null;
let DPR = 1;

const Game = {
  state: 'boot',   // boot intro menu shop howto settings devlog play levelup pause gameover
  time: 0,
  runSeed: 1,
  waveScale: { hp: 1, dmg: 1, speed: 1 },
  lastRun: null,
  settingsFrom: 'menu',

  input: {
    keys: new Set(),
    moveX: 0, moveY: 0,
    aimX: 0, aimY: 0, aiming: false,
    firing: false, dash: false,
    touch: null,
  },

  // ---- boot ----------------------------------------------------
  boot() {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');
    Save.load();
    Physics.init();
    FX.init();
    Bullets.init();
    Enemies.init();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    window.addEventListener('keydown', e => this.onKey(e, true));
    window.addEventListener('keyup', e => this.onKey(e, false));
    canvas.addEventListener('mousedown', e => this.onMouse(e, true));
    window.addEventListener('mouseup', e => this.onMouse(e, false));
    canvas.addEventListener('mousemove', e => this.onMove(e));
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('touchstart', e => this.onTouch(e, true), { passive: false });
    canvas.addEventListener('touchmove', e => this.onTouch(e, false), { passive: false });
    canvas.addEventListener('touchend', e => this.onTouch(e, false), { passive: false });
    // Wheel scrolls the shop and the dev log.
    window.addEventListener('wheel', e => {
      if (this.state === 'shop') UI.shopScroll += e.deltaY;
      else if (this.state === 'devlog') UI.devlogScroll += e.deltaY;
    }, { passive: true });

    // The intro plays on every launch. Skip any time.
    this.startIntro();
    requestAnimationFrame(t => this.frame(t));
  },

  resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * DPR);
    canvas.height = Math.floor(window.innerHeight * DPR);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = false;
  },

  // ---- state transitions --------------------------------------
  setState(s) {
    this.state = s;
    UI.enterT = 0;
    UI.hoverIndex = -1;
    if (s === 'shop') UI.shopScroll = 0;
    if (s === 'devlog') UI.devlogScroll = 0;
  },

  startIntro() {
    this.setState('intro');
    UI.startIntro();
  },

  goMenu() {
    Trans.go('menu');
    AudioSys.stopMusic();
    Save.data.seenIntro = true;
    Save.save();
  },

  goShop() { Trans.go('shop'); },
  goHowTo() { Trans.go('howto'); },
  goSettings() { this.settingsFrom = this.state === 'pause' ? 'pause' : 'menu'; Trans.go('settings'); },
  goDevLog() { Trans.go('devlog'); },

  newRun() {
    this.runSeed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    const stats = Object.assign(baseStats(), Save.statBase);
    this.waveScale = waveScale(1);
    World.generate(this.runSeed);
    Player.reset(stats);
    Bullets.reset();
    Enemies.reset();
    Pickups.reset();
    FX.reset();
    this.wave = 1;
    Waves.startWave(1);
    AudioSys.init();
    AudioSys.startMusic(this.runSeed);
    this.setState('play');
    FX.flash('#4ef1ff', 0.25);
  },

  // ---- wave events --------------------------------------------
  onWaveClear() {
    Player.score += CFG.waveClearBonus * Waves.wave;
    const next = Waves.wave + 1;
    Waves.startWave(next);
    if (Waves.bossWave) {
      Boss.spawn(Math.floor(next / CFG.bossEvery), waveScale(next));
    }
    Player.hp = Math.min(Player.maxHp, Player.hp + 10);
  },

  waveKill() {
    Waves.killsThisWave++;
  },

  onBossKill() {
    Waves.killsThisWave++;
  },

  onLevelUp() {
    const owned = Player._upgradeCounts || (Player._upgradeCounts = {});
    const avail = UPGRADES.filter(u => (owned[u.id] || 0) < u.max);
    const choices = [];
    const pool = avail.slice();
    while (choices.length < 3 && pool.length > 0) {
      const i = Math.floor(Math.random() * pool.length);
      choices.push(pool.splice(i, 1)[0]);
    }
    this.levelChoices = choices;
    UI.levelChoices = choices;
    this.setState('levelup');
    AudioSys.levelup();
    FX.ring(Player.x, Player.y, CFG.colors.xp, 120, 0.6, 4);
  },

  pickUpgrade(i) {
    const u = this.levelChoices[i];
    if (!u) return;
    const owned = Player._upgradeCounts || (Player._upgradeCounts = {});
    owned[u.id] = (owned[u.id] || 0) + 1;
    u.apply(Player.stats);
    if (u.id === 'hp') Player.hp = Math.min(Player.stats.maxHp, Player.hp + 25);
    Player.maxHp = Player.stats.maxHp;
    if (u.id === 'shield') Player.shield = Player.stats.shieldMax;
    if (u.id === 'drone') {
      Player.drones.push({ ang: rand(0, TAU), cd: 0 });
    }
    this.setState('play');
    FX.flash('#9d6bff', 0.12);
  },

  onPlayerDeath() {
    AudioSys.gameOver();
    AudioSys.stopMusic();
    FX.shake(20);
    FX.flash('#ff2d4d', 0.5);
    FX.burst(Player.x, Player.y, CFG.colors.player, 40, 420, 6, 1.0);
    const credits = Player.credits;
    Save.recordRun(Player.score, Waves.wave, Player.kills, credits);
    this.lastRun = {
      score: Player.score, wave: Waves.wave, kills: Player.kills,
      level: Player.level, credits,
      newBest: Player.score >= Save.data.best && Player.score > 0,
    };
    this.setState('gameover');
  },

  abandonRun() {
    const credits = Math.round(Player.credits * 0.5);
    Save.recordRun(Player.score, Waves.wave, Player.kills, credits);
    AudioSys.stopMusic();
    this.goMenu();
  },

  // ---- input ----------------------------------------------------
  onKey(e, down) {
    const k = e.key.toLowerCase();
    if (down) {
      this.input.keys.add(k);
      AudioSys.init();
      if (this.state === 'intro') { this.goMenu(); return; }
      if (Trans.closing()) { this.updateKeyAxes(); return; }
      if (this.state === 'levelup' && ['1', '2', '3'].includes(k)) {
        this.pickUpgrade(parseInt(k) - 1);
        return;
      }
      if (k === 'enter' && this.state === 'menu') { this.newRun(); return; }
      if (k === 'p' || k === 'escape') {
        if (this.state === 'play') Trans.go('pause');
        else if (this.state === 'pause') Trans.go('play');
        else if (this.state === 'settings') Trans.go(this.settingsFrom === 'pause' ? 'pause' : 'menu');
        else if (['shop', 'howto', 'devlog'].includes(this.state)) this.goMenu();
        return;
      }
      if (k === ' ') {
        if (this.state === 'play') this.input.dash = true;
        e.preventDefault();
      }
      if (k === 'm') { // mute toggle
        const s = Save.data.settings;
        if (s.sfx > 0 || s.music > 0) { s.sfx = 0; s.music = 0; }
        else { s.sfx = 0.8; s.music = 0.6; }
        AudioSys.applySettings();
        Save.save();
      }
    } else {
      this.input.keys.delete(k);
    }
    this.updateKeyAxes();
  },

  updateKeyAxes() {
    const k = this.input.keys;
    let x = 0, y = 0;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y -= 1;
    if (k.has('s') || k.has('arrowdown')) y += 1;
    this.input.moveX = x;
    this.input.moveY = y;
  },

  toWorldCoords(px, py) {
    return Camera.screenToWorld(px, py);
  },

  onMouse(e, down) {
    AudioSys.init();
    if (down && this.state === 'intro') { this.goMenu(); return; }
    const wx = e.clientX, wy = e.clientY;
    this.input.aimX = wx; this.input.aimY = wy;
    this.input.aiming = true;
    if (down) this.handleClick(wx, wy, true);
    else if (this.state === 'play') this.input.firing = false;
  },

  onMove(e) {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
    this.input.aimX = e.clientX;
    this.input.aimY = e.clientY;
    this.input.aiming = true;
  },

  handleClick(x, y, down) {
    if (!down) return;
    if (Trans.closing()) return;
    const st = this.state;
    if (st === 'menu') {
      const my = UI.vh() * 0.40;
      const idx = UI.menuItems.findIndex((it, i) => this.inRect(x, y, UI.vw() / 2 - 170, my + i * 50 - 18, 340, 34));
      if (idx === 0) this.newRun();
      else if (idx === 1) this.goShop();
      else if (idx === 2) this.goHowTo();
      else if (idx === 3) this.goDevLog();
      else if (idx === 4) this.goSettings();
      AudioSys.click();
    } else if (st === 'levelup') {
      const w = UI.vw(), h = UI.vh();
      const cw = Math.min(230, (w - 80) / 3), gap = 24;
      const totalW = cw * 3 + gap * 2;
      const x0 = (w - totalW) / 2, y0 = h * 0.34;
      for (let i = 0; i < 3; i++) {
        if (this.inRect(x, y, x0 + i * (cw + gap), y0, cw, 210)) {
          this.pickUpgrade(i);
          AudioSys.click();
          return;
        }
      }
    } else if (st === 'pause') {
      const r = UI.pauseRect;
      if (!r) return;
      for (let i = 0; i < 3; i++) {
        if (this.inRect(x, y, r.x, r.y + i * r.rowH - 16, r.w, 32)) {
          if (i === 0) Trans.go('play');
          else if (i === 1) this.goSettings();
          else this.abandonRun();
          AudioSys.click();
          return;
        }
      }
    } else if (st === 'gameover') {
      const h = UI.vh();
      for (let i = 0; i < 3; i++) {
        if (this.inRect(x, y, UI.vw() / 2 - 120, h * 0.6 + i * 46 - 16, 240, 32)) {
          if (i === 0) this.newRun();
          else if (i === 1) this.goShop();
          else this.goMenu();
          AudioSys.click();
          return;
        }
      }
    } else if (st === 'shop') {
      const r = UI.shopRect;
      if (!r) return;
      let handled = false;
      for (let i = 0; i < META_SHOP.length; i++) {
        const iy = r.top + i * r.rowH - UI.shopScroll;
        if (this.inRect(x, y, r.x0, iy, r.pw, r.rowH - 8)) {
          handled = true;
          const it = META_SHOP[i];
          const lvl = Save.metaLevel(it.id);
          const cost = Math.round(it.cost * Math.pow(it.scale, lvl));
          if (lvl < it.max && Save.data.credits >= cost) {
            Save.data.credits -= cost;
            Save.data.meta[it.id] = lvl + 1;
            Save.applyMeta();
            Save.save();
            AudioSys.buy();
            FX.flash('#ffd257', 0.08);
          } else {
            AudioSys.click();
          }
          break;
        }
      }
      if (!handled) this.goMenu();
    } else if (st === 'settings') {
      const h = UI.vh(), s = Save.data.settings;
      const rows = 6;
      for (let i = 0; i < rows; i++) {
        if (this.inRect(x, y, UI.vw() / 2 - 180, h * 0.32 + i * 50 - 16, 360, 32)) {
          if (i === 0) s.sfx = nextVol(s.sfx);
          if (i === 1) s.music = nextVol(s.music);
          if (i === 2) s.shake = s.shake > 0 ? 0 : 1;
          if (i === 3) s.reducedMotion = !s.reducedMotion;
          if (i === 4) {
            if (this._resetArm) { localStorage.removeItem(CFG.saveKey); Save.load(); this._resetArm = false; }
            else { this._resetArm = true; }
          }
          if (i === 5) Trans.go(this.settingsFrom === 'pause' ? 'pause' : 'menu');
          AudioSys.applySettings();
          Save.save();
          AudioSys.click();
          return;
        }
      }
      this.goMenu();
    } else if (st === 'howto') {
      this.goMenu();
    } else if (st === 'devlog') {
      this.goMenu();
    } else if (st === 'play') {
      this.input.firing = true;
    }
  },

  inRect(px, py, x, y, w, h) {
    return px >= x && px <= x + w && py >= y && py <= y + h;
  },

  // Touch: left half is a movement stick, right half aims+fires.
  onTouch(e, start) {
    e.preventDefault();
    AudioSys.init();
    if (start && this.state === 'intro') { this.goMenu(); return; }
    if (start && this.state !== 'play') {
      const t = e.touches[0];
      this.handleClick(t.clientX, t.clientY, true);
      return;
    }
    if (this.state !== 'play') return;
    const inp = this.input;
    if (!inp.touch) inp.touch = { moveId: null, aimId: null, moveOx: 0, moveOy: 0, aimOx: 0, aimOy: 0 };
    for (const t of e.touches) {
      const half = window.innerWidth / 2;
      if (start) {
        if (t.clientX < half && inp.moveId === null) {
          inp.moveId = t.identifier; inp.moveOx = t.clientX; inp.moveOy = t.clientY;
        } else if (t.clientX >= half && inp.aimId === null) {
          inp.aimId = t.identifier; inp.aimOx = t.clientX; inp.aimOy = t.clientY;
          inp.firing = true;
        }
      } else {
        if (t.identifier === inp.moveId) {
          const dx = t.clientX - inp.moveOx, dy = t.clientY - inp.moveOy;
          const l = Math.hypot(dx, dy) || 1;
          const cl = Math.min(1, l / 60);
          inp.moveX = dx / l * cl;
          inp.moveY = dy / l * cl;
        }
        if (t.identifier === inp.aimId) {
          const dx = t.clientX - inp.aimOx, dy = t.clientY - inp.aimOy;
          if (Math.hypot(dx, dy) > 14) {
            inp.aiming = false;
            Player.aimAng = Math.atan2(dy, dx);
          }
        }
      }
    }
    const remaining = new Set();
    for (const t of e.touches) remaining.add(t.identifier);
    if (inp.moveId !== null && !remaining.has(inp.moveId)) {
      inp.moveId = null; inp.moveX = 0; inp.moveY = 0;
    }
    if (inp.aimId !== null && !remaining.has(inp.aimId)) {
      inp.aimId = null; inp.firing = false;
    }
    if (e.touches.length >= 3 && this.state === 'play') this.input.dash = true;
  },

  // ---- main loop -------------------------------------------------
  lastT: 0,
  frame(t) {
    requestAnimationFrame(tt => this.frame(tt));
    let dt = (t - this.lastT) / 1000;
    this.lastT = t;
    if (!isFinite(dt) || dt <= 0) dt = 0.016;
    dt = Math.min(dt, 1 / 20);

    this.time += dt;
    Trans.update(dt);
    this.update(dt);
    this.render(dt);
  },

  update(dt) {
    const inp = this.input;

    switch (this.state) {
      case 'intro':
        break;

      case 'menu': case 'gameover': case 'shop': case 'howto':
      case 'settings': case 'devlog': {
        // Idle FX continue so menus feel alive.
        FX.update(dt);
        break;
      }

      case 'play': {
        // Hit stop: freeze the sim briefly, keep rendering.
        if (FX.hitStopT > 0) { FX.update(dt); break; }

        if (inp.aiming && !inp.touch) {
          const wpt = this.toWorldCoords(inp.aimX, inp.aimY);
          Player.update(dt, {
            moveX: inp.moveX, moveY: inp.moveY,
            aimX: wpt.x, aimY: wpt.y, aiming: true,
            firing: inp.firing, dash: inp.dash,
          });
          inp.dash = false;
        } else {
          Player.update(dt, {
            moveX: inp.moveX, moveY: inp.moveY,
            aiming: false, firing: inp.firing, dash: inp.dash,
          });
          inp.dash = false;
        }

        Enemies.update(dt);
        Boss.update(dt);
        Bullets.update(dt);
        Pickups.update(dt);
        Waves.update(dt);
        FX.update(dt);

        Camera.follow(dt);
        const intensity = clamp((Waves.wave - 1) / 14 + (Boss.active ? 0.4 : 0), 0, 1);
        AudioSys.setIntensity(intensity);
        break;
      }

      case 'levelup': case 'pause': {
        FX.update(dt * 0.2);
        break;
      }
    }
  },

  drawFlash(w, h) {
    if (FX.flashT > 0) {
      ctx.globalAlpha = Math.min(0.7, FX.flashT * 3);
      ctx.fillStyle = FX.flashColor;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  },

  render(dt) {
    const w = UI.vw(), h = UI.vh();
    const st = this.state;

    if (st === 'intro') {
      UI.drawIntro(dt);
      this.drawFlash(w, h);
      Trans.draw();
      return;
    }

    if (st === 'menu') { UI.drawMenu(dt); }
    else if (st === 'shop') { UI.drawShop(dt); }
    else if (st === 'howto') { UI.drawHowTo(dt); }
    else if (st === 'settings') { UI.drawSettings(dt); }
    else if (st === 'devlog') { UI.drawDevLog(dt); }
    else {
      // World rendering with camera transform for play states.
      FX.updateShake();
      Camera.apply(ctx, w, h);

      if (World.bgCanvas) ctx.drawImage(World.bgCanvas, 0, 0);
      World.drawObstacles(ctx);
      Pickups.draw(ctx);
      Enemies.draw(ctx);
      Boss.draw(ctx);
      Player.draw(ctx);
      Bullets.draw(ctx);
      FX.draw(ctx);

      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

      // Vignette when hurt.
      if (FX.vignette > 0 || Player.hp / Player.maxHp < 0.3) {
        const v = Math.max(FX.vignette, Player.hp / Player.maxHp < 0.3 ? 0.35 : 0);
        const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.75);
        g.addColorStop(0, 'rgba(255,45,77,0)');
        g.addColorStop(1, 'rgba(255,45,77,' + (v * 0.5).toFixed(2) + ')');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      if (st === 'play' || st === 'levelup' || st === 'pause' || st === 'gameover') {
        UI.drawHUD();
      }
      if (st === 'levelup') UI.drawLevelUp(dt);
      if (st === 'pause') UI.drawPause(dt);
      if (st === 'gameover') UI.drawGameOver(dt);
    }

    // Flash and transition overlays cover every screen now.
    this.drawFlash(w, h);
    Trans.draw();
  },
};

// ------------------------------------------------------------
// Camera: follows the player, clamped to the arena, with shake.
// ------------------------------------------------------------
const Camera = {
  x: 0, y: 0, zoom: 1,

  follow(dt) {
    const w = UI.vw(), h = UI.vh();
    const tx = Player.x - w / 2;
    const ty = Player.y - h / 2;
    this.x = damp(this.x, tx, 6, dt);
    this.y = damp(this.y, ty, 6, dt);
    this.x = clamp(this.x, 0, Math.max(0, CFG.arenaW - w));
    this.y = clamp(this.y, 0, Math.max(0, CFG.arenaH - h));
  },

  apply(c, w, h) {
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.translate(-Math.round(this.x) + FX.shakeX, -Math.round(this.y) + FX.shakeY);
  },

  screenToWorld(sx, sy) {
    return { x: sx + this.x - FX.shakeX, y: sy + this.y - FX.shakeY };
  },
};

// ------------------------------------------------------------
// GO.
// ------------------------------------------------------------
window.addEventListener('load', () => Game.boot());
