// ============================================================
// Entities: player, bullets, enemies, boss, pickups.
// Plain objects, pooled where they spawn constantly.
// ============================================================

// ------------------------------------------------------------
// Player
// ------------------------------------------------------------
const Player = {
  x: 0, y: 0, vx: 0, vy: 0, kx: 0, ky: 0, r: CFG.playerRadius, rest: 0.2,
  hp: 100, maxHp: 100,
  aimX: 1, aimY: 0, aimAng: 0,
  fireCd: 0, dashCd: 0, dashing: 0, dashVX: 0, dashVY: 0,
  iframes: 0, weapon: 'blaster',
  shield: 0, shieldRecharge: 0,
  level: 1, xp: 0, xpNext: 0,
  kills: 0, score: 0, credits: 0,
  combo: 0, comboT: 0,
  stats: null,
  drones: [], // {ang, cd}

  reset(stats) {
    this.stats = stats;
    this.x = CFG.arenaW / 2;
    this.y = CFG.arenaH / 2;
    this.vx = 0; this.vy = 0;
    this.r = CFG.playerRadius;
    this.maxHp = stats.maxHp;
    this.hp = stats.maxHp;
    this.fireCd = 0; this.dashCd = 0; this.dashing = 0;
    this.iframes = 1.0;
    this.weapon = stats.startWeapon;
    this.shield = stats.shieldMax;
    this.shieldRecharge = 0;
    this.level = 1; this.xp = 0;
    this.xpNext = xpForLevel(1);
    this.kills = 0; this.score = 0; this.credits = 0;
    this.combo = 0; this.comboT = 0;
    this._upgradeCounts = {};
    this.drones = [];
    for (let i = 0; i < stats.drones; i++) {
      this.drones.push({ ang: (i / stats.drones) * TAU, cd: 0 });
    }
  },

  update(dt, input) {
    const s = this.stats;

    // Movement: acceleration + exponential friction feels crisp.
    let ix = input.moveX, iy = input.moveY;
    const il = Math.hypot(ix, iy);
    if (il > 1) { ix /= il; iy /= il; }
    if (this.dashing > 0) {
      this.dashing -= dt;
      this.vx = this.dashVX;
      this.vy = this.dashVY;
      FX.trail(this.x, this.y, CFG.colors.dash, 5);
    } else {
      const speed = CFG.playerSpeed * s.speedMult;
      this.vx += ix * CFG.playerAccel * dt;
      this.vy += iy * CFG.playerAccel * dt;
      const dampK = il > 0.01 ? CFG.playerFriction : CFG.playerFriction * 1.6;
      this.vx = damp(this.vx, ix * speed, dampK, dt);
      this.vy = damp(this.vy, iy * speed, dampK, dt);
    }
    // Physics engine handles integration, walls and obstacle response.
    Physics.integrate(this, dt, { substeps: 2, knockDecay: 6.0 });

    // Aim: mouse position or right stick.
    if (input.aiming) {
      this.aimAng = Math.atan2(input.aimY - this.y, input.aimX - this.x);
    } else if (il > 0.1) {
      // Auto-aim fallback when not aiming manually.
      const t = this.nearestEnemy();
      if (t) this.aimAng = ang(this.x, this.y, t.x, t.y);
      else this.aimAng = Math.atan2(iy, ix);
    }

    // Timers.
    this.fireCd -= dt;
    this.dashCd -= dt;
    this.iframes = Math.max(0, this.iframes - dt);
    this.comboT -= dt;
    if (this.comboT <= 0 && this.combo > 0) { this.combo = 0; }

    // Regen.
    if (s.regen > 0 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + s.regen * dt);
    }

    // Shield recharge: one block back every 9 seconds.
    if (this.shield < s.shieldMax) {
      this.shieldRecharge += dt;
      if (this.shieldRecharge >= 9) {
        this.shieldRecharge = 0;
        this.shield++;
        FX.ring(this.x, this.y, CFG.colors.player, 40, 0.4, 2);
      }
    }

    // Dash.
    if (input.dash && this.dashCd <= 0 && this.dashing <= 0) {
      input.dash = false;
      let dx = ix, dy = iy;
      if (Math.hypot(dx, dy) < 0.1) { dx = Math.cos(this.aimAng); dy = Math.sin(this.aimAng); }
      const l = Math.hypot(dx, dy) || 1;
      this.dashVX = (dx / l) * CFG.dashSpeed;
      this.dashVY = (dy / l) * CFG.dashSpeed;
      this.dashing = CFG.dashTime;
      this.dashCd = CFG.dashCooldown * s.dashCdMult;
      this.iframes = Math.max(this.iframes, CFG.dashIframes);
      AudioSys.dash();
      FX.ring(this.x, this.y, CFG.colors.dash, 46, 0.3, 3);
    }

    // Fire.
    if (input.firing && this.fireCd <= 0) {
      this.fire();
    }

    // Orbit drones fire on their own cadence.
    for (const d of this.drones) {
      d.ang += 1.6 * dt;
      d.cd -= dt;
      if (d.cd <= 0) {
        const dx = this.x + Math.cos(d.ang) * 46;
        const dy = this.y + Math.sin(d.ang) * 46;
        const t = this.nearestEnemy();
        if (t) {
          const a = ang(dx, dy, t.x, t.y);
          spawnBullet(dx, dy, a, 700, 8, 4, s.dmgMult * 6 * (chance(s.critChance) ? s.critMult : 1), 0, CFG.colors.gem, 0, 0);
          d.cd = 0.8;
        }
      }
    }
  },

  nearestEnemy() {
    let best = null, bd = 1e12;
    for (let i = 0; i < Enemies.list.count; i++) {
      const e = Enemies.list.items[i];
      const d = dist2(this.x, this.y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best && Boss.active) best = Boss;
    return best;
  },

  fire() {
    const s = this.stats;
    const w = WEAPONS[this.weapon];
    this.fireCd = w.cooldown / s.rateMult;
    const shots = w.count + s.extraShots;
    for (let i = 0; i < shots; i++) {
      const spread = w.spread * (shots > 1 ? 1 : 0.5);
      const off = shots > 1 ? (i / (shots - 1) - 0.5) * spread * 2 : 0;
      const a = this.aimAng + off + rand(-0.02, 0.02);
      const dmg = w.damage * s.dmgMult * (chance(s.critChance) ? s.critMult : 1);
      spawnBullet(
        this.x + Math.cos(a) * (this.r + 8),
        this.y + Math.sin(a) * (this.r + 8),
        a, w.speed * rand(0.95, 1.05),
        dmg, w.size, CFG.colors[w.color],
        w.pierce + s.pierce, w.knock, w.homing, w.blast, w.blastDmg, w.lifetime
      );
    }
    if (this.weapon === 'shotgun') AudioSys.shotgun();
    else if (this.weapon === 'laser') AudioSys.laser();
    else if (this.weapon === 'missiles') AudioSys.missile();
    else AudioSys.shoot();
    // Muzzle flash + recoil kick.
    FX.spawn(this.x + Math.cos(this.aimAng) * 20, this.y + Math.sin(this.aimAng) * 20,
      { color: CFG.colors[w.color], size: 8, life: 0.08, type: 0 });
    Physics.impulse(this, -Math.cos(this.aimAng) * (w.knock || 60) * 0.30,
      -Math.sin(this.aimAng) * (w.knock || 60) * 0.30);
  },

  gainXp(v) {
    this.xp += v * this.stats.xpMult;
    if (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = xpForLevel(this.level);
      Game.onLevelUp();
    }
  },

  takeDamage(amount, sourceX, sourceY) {
    if (this.iframes > 0) return false;
    if (this.shield > 0) {
      this.shield--;
      this.iframes = 0.5;
      AudioSys.hit();
      FX.ring(this.x, this.y, CFG.colors.player, 60, 0.35, 4);
      FX.text(this.x, this.y - 26, 'BLOCKED', CFG.colors.player, 13);
      return false;
    }
    this.hp -= amount;
    this.iframes = CFG.iframeTime;
    this.combo = 0;
    AudioSys.hurt();
    FX.shake(9);
    FX.flash('#ff2d4d', 0.16);
    FX.pulseVignette(0.5);
    FX.hitStop(0.05);
    FX.burst(this.x, this.y, '#ff5c7a', 14, 220, 4, 0.4);
    if (sourceX !== undefined) {
      // Knockback rides the physics impulse channel now.
      Physics.knockFrom(this, sourceX, sourceY, 210);
    }
    if (this.hp <= 0) {
      if (this.stats.revives > 0) {
        this.stats.revives--;
        this.hp = this.maxHp * 0.5;
        this.iframes = 2.0;
        AudioSys.levelup();
        FX.ring(this.x, this.y, CFG.colors.gold, 220, 0.8, 6);
        FX.text(this.x, this.y - 40, 'SECOND WIND!', CFG.colors.gold, 20);
        FX.shake(16);
        return false;
      }
      this.hp = 0;
      Game.onPlayerDeath();
    }
    return true;
  },

  draw(ctx) {
    const blink = this.iframes > 0 && Math.floor(this.iframes * 20) % 2 === 0;
    if (blink) ctx.globalAlpha = 0.4;

    // Shadow/glow disc.
    ctx.fillStyle = 'rgba(78,241,255,0.10)';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r + 7, 0, TAU);
    ctx.fill();

    // Body: ship triangle pointing at aim.
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.aimAng);
    // Squash on dash for stretch juice.
    const st = this.dashing > 0 ? 1.45 : 1;
    ctx.scale(st, 2 - st);
    ctx.fillStyle = CFG.colors.player;
    ctx.strokeStyle = CFG.colors.playerCore;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.r + 4, 0);
    ctx.lineTo(-this.r, this.r * 0.8);
    ctx.lineTo(-this.r * 0.45, 0);
    ctx.lineTo(-this.r, -this.r * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Engine glow scales with speed.
    const spd = Math.hypot(this.vx, this.vy);
    ctx.fillStyle = 'rgba(167,255,94,' + Math.min(0.9, spd / 400) + ')';
    ctx.beginPath();
    ctx.arc(-this.r * 0.9, 0, 4 + spd * 0.012, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Shield bubbles.
    if (this.shield > 0) {
      ctx.strokeStyle = 'rgba(78,241,255,0.6)';
      ctx.lineWidth = 2;
      for (let i = 0; i < this.shield; i++) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r + 9 + i * 5, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  },
};

function xpForLevel(n) { return Math.round(CFG.xpBase * Math.pow(n, CFG.xpExp)); }

// ------------------------------------------------------------
// Bullet pool (player + enemy share one pool, team flag).
// ------------------------------------------------------------
const Bullets = {
  list: null,
  hash: null,
  near: [],

  init() {
    this.list = new Pool(() => ({
      active: false, x: 0, y: 0, vx: 0, vy: 0, r: 4, dmg: 0,
      team: 0, life: 0, pierce: 0, homing: 0, blast: 0, blastDmg: 0,
      color: '#fff', knock: 0, hitSet: null,
    }), 700);
    this.hash = new SpatialHash(90);
  },

  reset() { this.list.clear(); },

  fire(x, y, angA, speed, dmg, size, color, pierce, knock, homing, blast, blastDmg, life, team) {
    const b = this.list.get();
    b.active = true;
    b.x = x; b.y = y;
    b.vx = Math.cos(angA) * speed;
    b.vy = Math.sin(angA) * speed;
    b.r = size; b.dmg = dmg;
    b.team = team || 0;
    b.life = life || 1.4;
    b.pierce = pierce || 0;
    b.homing = homing || 0;
    b.blast = blast || 0;
    b.blastDmg = blastDmg || 0;
    b.color = color;
    b.knock = knock || 0;
    b.hitSet = b.pierce > 0 ? new Set() : null;
    return b;
  },

  explode(b) {
    FX.burst(b.x, b.y, b.color, 16, 260, 5, 0.5);
    FX.ring(b.x, b.y, b.color, b.blast, 0.3, 4);
    AudioSys.explode(false);
    FX.shake(4);
    const q = this.hash.query(b.x, b.y, b.blast, this.near);
    for (const e of q) {
      if (!e.alive || e.type === 'bullet') continue;
      if (dist2(b.x, b.y, e.x, e.y) <= (b.blast + e.r) * (b.blast + e.r)) {
        if (e === Boss) Boss.damage(b.blastDmg, b.x, b.y);
        else if (e.team === 1) Enemies.damage(e, b.blastDmg, b.x, b.y);
      }
    }
  },

  update(dt) {
    // Rebuild the broad-phase hash over enemies + boss once per frame.
    this.hash.clear();
    for (let i = 0; i < Enemies.list.count; i++) {
      const e = Enemies.list.items[i];
      this.hash.insert(e);
    }
    if (Boss.active) this.hash.insert(Boss);

    this.list.forEach((b, i) => {
      b.life -= dt;
      if (b.life <= 0) {
        if (b.blast > 0 && b.team === 0) this.explode(b);
        this.list.release(i);
        return;
      }
      // Homing steer toward nearest enemy.
      if (b.homing > 0 && b.team === 0) {
        const t = Player.nearestEnemy();
        if (t) {
          const want = ang(b.x, b.y, t.x, t.y);
          const cur = Math.atan2(b.vy, b.vx);
          const na = cur + clamp(normAng(want - cur), -b.homing * dt, b.homing * dt);
          const sp = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(na) * sp;
          b.vy = Math.sin(na) * sp;
        }
      }
      const px = b.x, py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < -40 || b.x > CFG.arenaW + 40 || b.y < -40 || b.y > CFG.arenaH + 40) {
        this.list.release(i);
        return;
      }
      if (World.segHitsObstacle(px, py, b.x, b.y, b.r)) {
        FX.burst(b.x, b.y, b.color, 4, 120, 3, 0.25);
        if (b.blast > 0 && b.team === 0) this.explode(b);
        this.list.release(i);
        return;
      }

      if (b.team === 0) {
        // Player bullet vs enemies.
        const q = this.hash.query((b.x + px) / 2, (b.y + py) / 2,
          b.r + 34 + Math.hypot(b.vx, b.vy) * dt * 0.5, this.near);
        for (const e of q) {
          if (!e.alive) continue;
          if (b.hitSet && b.hitSet.has(e)) continue;
          if (!Physics.segCircle(px, py, b.x, b.y, e.x, e.y, e.r + b.r)) continue;
          if (e === Boss) Boss.damage(b.dmg, b.x, b.y);
          else Enemies.damage(e, b.dmg, b.x, b.y);
          // Knockback.
          const ka = Math.atan2(b.vy, b.vx);
          const kr = (b.knock || 60) / (e.mass || 1);
          Physics.impulse(e, Math.cos(ka) * kr, Math.sin(ka) * kr);
          FX.burst(b.x, b.y, b.color, 5, 160, 3, 0.3);
          if (b.pierce > 0) {
            b.pierce--;
            if (b.hitSet) b.hitSet.add(e);
          } else {
            if (b.blast > 0) this.explode(b);
            this.list.release(i);
            break;
          }
        }
      } else {
        // Enemy bullet vs player.
        if (Physics.segCircle(px, py, b.x, b.y, Player.x, Player.y, Player.r + b.r)) {
          Player.takeDamage(b.dmg, b.x, b.y);
          FX.burst(b.x, b.y, CFG.colors.ebullet, 6, 140, 3, 0.3);
          this.list.release(i);
        }
      }
    });
  },

  draw(ctx) {
    this.list.forEach(b => {
      ctx.fillStyle = b.color;
      if (b.team === 1) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,92,122,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 3, 0, TAU);
        ctx.stroke();
      } else {
        const a = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(a);
        ctx.fillRect(-b.r * 2, -b.r * 0.5, b.r * 3, b.r);
        ctx.restore();
      }
    });
  },
};

function spawnBullet(x, y, a, speed, dmg, size, color, pierce, knock, homing, blast, blastDmg, life, team) {
  return Bullets.fire(x, y, a, speed, dmg, size, color, pierce, knock, homing, blast, blastDmg, life, team);
}

// ------------------------------------------------------------
// Enemies. One pool, type field switches behavior.
// ------------------------------------------------------------
const Enemies = {
  list: null,
  hash: null,
  near: [],

  init() {
    this.list = new Pool(() => ({
      active: false, alive: false, type: '', x: 0, y: 0, vx: 0, vy: 0, kx: 0, ky: 0,
      r: 10, hp: 1, maxHp: 1, speed: 100, damage: 10, score: 10, xp: 1,
      mass: 1, color: '#fff', team: 1, t: 0, state: 'chase',
      timer: 0, fireT: 0, elite: null, flash: 0, slowT: 0,
      dartAng: 0, fused: false, lifesteal: 0, deathBlast: 0, deathBlastDmg: 0,
    }), 200);
    this.hash = new SpatialHash(80);
  },

  reset() { this.list.clear(); },

  aliveCount() {
    let n = 0;
    for (let i = 0; i < this.list.count; i++) if (this.list.items[i].alive) n++;
    return n;
  },

  spawn(typeName, x, y, scale, elite) {
    const def = ENEMY_TYPES[typeName];
    const e = this.list.get();
    e.active = true; e.alive = true;
    e.type = typeName;
    e.x = x; e.y = y; e.vx = 0; e.vy = 0;
    e.r = def.radius * (elite && elite.mods.radius ? elite.mods.radius : 1);
    e.maxHp = def.hp * scale.hp * (elite ? elite.mods.hp || 1 : 1);
    e.hp = e.maxHp;
    e.speed = def.speed * scale.speed * (elite && elite.mods.speed ? elite.mods.speed : 1) * rand(0.9, 1.1);
    e.damage = def.damage * scale.dmg * (elite && elite.mods.damage ? elite.mods.damage : 1);
    e.score = def.score * (elite ? 3 : 1);
    e.xp = def.xp * (elite ? 3 : 1);
    e.mass = def.mass;
    e.color = elite ? elite.tint : CFG.colors[def.color];
    e.team = 1;
    e.t = rand(0, TAU);
    e.state = 'chase';
    e.timer = 0;
    e.fireT = rand(0.5, def.fireCd || 1);
    e.flash = 0;
    e.slowT = 0;
    e.elite = elite ? elite.name : null;
    e.lifesteal = elite && elite.mods.lifesteal ? elite.mods.lifesteal : 0;
    e.deathBlast = elite && elite.mods.deathBlast ? elite.mods.deathBlast : 0;
    e.deathBlastDmg = elite && elite.mods.deathBlastDmg ? elite.mods.deathBlastDmg : 0;
    e.dartAng = 0;
    e.fused = false;
    return e;
  },

  damage(e, amount, srcX, srcY) {
    e.hp -= amount;
    e.flash = 0.09;
    if (amount >= 25) { AudioSys.crit(); FX.text(e.x, e.y - e.r - 8, Math.round(amount), CFG.colors.gold, 15); }
    else { AudioSys.hit(); }
    if (srcX !== undefined && e.type !== 'bomber') {
      Physics.knockFrom(e, srcX, srcY, 70 / (e.mass || 1));
    }
    if (e.hp <= 0) this.kill(e);
  },

  kill(e) {
    e.alive = false;
    Player.kills++;
    Player.combo++;
    Player.comboT = CFG.comboWindow;
    const mult = 1 + Math.min(CFG.comboMaxMult - 1, Player.combo * 0.05);
    const pts = Math.round(e.score * mult);
    Player.score += pts;
    const creds = Math.round(e.score * 0.4 * Player.stats.goldMult);
    Player.credits += creds;

    AudioSys.explode(e.r > 24);
    FX.burst(e.x, e.y, e.color, e.r > 24 ? 26 : 12, e.r > 24 ? 320 : 200, e.r > 24 ? 5 : 3.5, 0.5);
    FX.ring(e.x, e.y, e.color, e.r * 3, 0.3, 3);
    if (e.r > 24) { FX.shake(7); FX.hitStop(0.045); }
    else FX.shake(2.5);
    FX.text(e.x, e.y - e.r - 6, '+' + pts, mult > 1.5 ? CFG.colors.gold : CFG.colors.ui, 13);

    // Drop gems and occasional pickups.
    const gems = clamp(Math.round(e.xp / 2) + 1, 1, 6);
    for (let i = 0; i < gems; i++) {
      Pickups.spawnGem(e.x + rand(-12, 12), e.y + rand(-12, 12), Math.max(1, Math.round(e.xp / gems)));
    }
    if (chance(0.03)) Pickups.spawnHealth(e.x, e.y);
    if (chance(0.02)) Pickups.spawnWeapon(e.x, e.y);

    // Volatile elite death blast.
    if (e.deathBlast > 0) {
      FX.ring(e.x, e.y, '#fa2', e.deathBlast, 0.4, 5);
      if (dist2(e.x, e.y, Player.x, Player.y) < (e.deathBlast + Player.r) ** 2) {
        Player.takeDamage(e.deathBlastDmg, e.x, e.y);
      }
    }

    // Splitter children.
    const def = ENEMY_TYPES[e.type];
    if (def.splits && e.type === 'splitter') {
      for (let i = 0; i < def.splits; i++) {
        const a = (i / def.splits) * TAU + rand(0, 1);
        this.spawn(def.childType, e.x + Math.cos(a) * 18, e.y + Math.sin(a) * 18,
          { hp: 1, dmg: 1, speed: 1 }, null);
      }
    }
    Game.waveKill();
  },

  update(dt) {
    this.hash.clear();
    for (let i = 0; i < this.list.count; i++) {
      const e = this.list.items[i];
      if (e.alive) this.hash.insert(e);
    }

    this.list.forEach((e, i) => {
      if (!e.alive) { this.list.release(i); return; }
      e.t += dt;
      e.flash = Math.max(0, e.flash - dt);
      e.slowT = Math.max(0, e.slowT - dt);

      // Chrono field slows nearby enemies.
      let spdMult = 1;
      if (Player.stats.chrono > 0 &&
          dist2(e.x, e.y, Player.x, Player.y) < 260 * 260) {
        spdMult = 1 - Player.stats.chrono;
      }

      AI.update(e, dt * spdMult);
      Physics.integrate(e, dt, { substeps: 2, knockDecay: 5.0 });

      // Touch damage to the player.
      const def = ENEMY_TYPES[e.type];
      if (def.touch !== false && circleHit(e.x, e.y, e.r, Player.x, Player.y, Player.r)) {
        const hit = Player.takeDamage(e.damage, e.x, e.y);
        // Thorns reflect.
        if (Player.stats.thorns > 0) this.damage(e, Player.stats.thorns, e.x, e.y);
        if (hit && e.lifesteal > 0) {
          e.hp = Math.min(e.maxHp, e.hp + e.maxHp * e.lifesteal);
        }
        // Bounce apart so enemies don't sit inside the player.
        const a = ang(Player.x, Player.y, e.x, e.y);
        Physics.impulse(e, Math.cos(a) * 150, Math.sin(a) * 150);
      }

      // Bombers arm and detonate.
      if (e.type === 'bomber' && !e.fused &&
          dist2(e.x, e.y, Player.x, Player.y) < 80 * 80) {
        e.fused = true;
        e.timer = def.fuse;
      }
      if (e.type === 'bomber' && e.fused) {
        e.timer -= dt;
        if (e.timer <= 0) {
          FX.ring(e.x, e.y, e.color, def.blast, 0.35, 6);
          AudioSys.explode(true);
          FX.shake(12);
          if (dist2(e.x, e.y, Player.x, Player.y) < (def.blast + Player.r) ** 2) {
            Player.takeDamage(def.blastDmg * (1 + (Waves.wave - 1) * 0.03), e.x, e.y);
          }
          e.alive = false;
          this.kill(e);
          return;
        }
      }
    });
    // Physics crowd separation so enemies never stack into one blob.
    Physics.resolvePairs(this.list.items, this.list.count);
  },

  draw(ctx) {
    this.list.forEach(e => {
      if (!e.alive) return;
      const def = ENEMY_TYPES[e.type];
      ctx.save();
      ctx.translate(e.x, e.y);
      const wob = 1 + Math.sin(e.t * 6) * 0.06;
      ctx.scale(wob, 2 - wob);
      if (e.flash > 0) ctx.fillStyle = '#ffffff';
      else ctx.fillStyle = e.color;

      switch (e.type) {
        case 'grunt':
          ctx.rotate(e.t * 2);
          ctx.fillRect(-e.r, -e.r, e.r * 2, e.r * 2);
          break;
        case 'darter': {
          const a = Math.atan2(e.vy, e.vx);
          ctx.rotate(a);
          ctx.beginPath();
          ctx.moveTo(e.r * 1.6, 0);
          ctx.lineTo(-e.r, e.r);
          ctx.lineTo(-e.r, -e.r);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'spitter':
          ctx.beginPath();
          ctx.arc(0, 0, e.r, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#04040c';
          ctx.beginPath();
          ctx.arc(0, 0, e.r * 0.45, 0, TAU);
          ctx.fill();
          break;
        case 'splitter':
        case 'shard':
          ctx.rotate(e.t);
          ctx.beginPath();
          const sides = e.type === 'splitter' ? 6 : 3;
          for (let s = 0; s <= sides; s++) {
            const a2 = (s / sides) * TAU;
            const px = Math.cos(a2) * e.r, py = Math.sin(a2) * e.r;
            if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          break;
        case 'orbiter':
          ctx.rotate(Math.atan2(e.vy, e.vx));
          ctx.fillRect(-e.r, -e.r * 0.5, e.r * 2, e.r);
          ctx.fillRect(-e.r * 0.4, -e.r, e.r * 0.8, e.r * 2);
          break;
        case 'brute':
          ctx.rotate(e.t * 0.6);
          ctx.fillRect(-e.r, -e.r, e.r * 2, e.r * 2);
          ctx.fillStyle = '#04040c';
          ctx.fillRect(-e.r * 0.5, -e.r * 0.5, e.r, e.r);
          ctx.fillStyle = e.color;
          ctx.fillRect(-e.r * 0.25, -e.r * 0.25, e.r * 0.5, e.r * 0.5);
          break;
        case 'swarm':
          ctx.beginPath();
          ctx.arc(0, 0, e.r, 0, TAU);
          ctx.fill();
          break;
        case 'bomber':
          ctx.beginPath();
          ctx.arc(0, 0, e.r, 0, TAU);
          ctx.fill();
          if (e.fused) {
            const blink = Math.sin(e.t * 40) > 0;
            ctx.strokeStyle = blink ? '#ffffff' : 'rgba(255,45,85,0.5)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, e.r + 6, 0, TAU);
            ctx.stroke();
          }
          break;
      }
      ctx.restore();

      // Elite name tag.
      if (e.elite) {
        drawText(ctx, e.elite, e.x, e.y - e.r - 10, 10, e.color, 'center', true);
      }
      // HP pips for tough enemies.
      if (e.maxHp >= 40 && e.hp < e.maxHp) {
        const w = e.r * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(e.x - w / 2, e.y - e.r - 6, w, 3);
        ctx.fillStyle = CFG.colors.hp;
        ctx.fillRect(e.x - w / 2, e.y - e.r - 6, w * (e.hp / e.maxHp), 3);
      }
    });
  },
};

// ------------------------------------------------------------
// Boss. Larger enemy with phases and telegraphed attacks.
// ------------------------------------------------------------
const Boss = {
  active: false, x: 0, y: 0, vx: 0, vy: 0, kx: 0, ky: 0, r: 46,
  hp: 1, maxHp: 1, name: '', color: '#fff',
  def: null, phase: 1, t: 0, flash: 0,
  ringT: 0, dashT: 0, dashWind: 0, summonT: 0, spawnT: 0,
  score: 0, xp: 0, damage: 20, mass: 10, rest: 0.08, alive: false,

  spawn(tier, scale) {
    const idx = (tier - 1) % BOSSES.length;
    const def = BOSSES[idx];
    const loops = Math.floor((tier - 1) / BOSSES.length);
    this.def = def;
    this.active = true; this.alive = true;
    this.x = CFG.arenaW / 2;
    this.y = 160;
    this.vx = 0; this.vy = 0;
    this.r = def.radius;
    this.maxHp = def.hp * scale.hp * (1 + loops * 1.1);
    this.hp = this.maxHp;
    this.speed = def.speed * (1 + loops * 0.15);
    this.damage = def.damage * (1 + loops * 0.3);
    this.name = def.name + (loops > 0 ? ' MK' + (loops + 1) : '');
    this.color = CFG.colors[def.color];
    this.phase = 1;
    this.t = 0; this.flash = 0;
    this.ringT = 2.5; this.dashT = 5; this.dashWind = 0; this.summonT = 6;
    this.score = def.score * (1 + loops);
    this.xp = def.xp * (1 + loops);
    AudioSys.bossRoar();
    FX.shake(18);
    FX.flash(this.color, 0.3);
  },

  damage(amount, srcX, srcY) {
    this.hp -= amount;
    this.flash = 0.07;
    if (amount >= 25) FX.text(this.x + rand(-20, 20), this.y - this.r - 10, Math.round(amount), CFG.colors.gold, 16);
    if (srcX !== undefined) {
      // Bosses barely budge.
      const a = ang(srcX, srcY, this.x, this.y);
      Physics.impulse(this, Math.cos(a) * 8, Math.sin(a) * 8);
    }
    const frac = this.hp / this.maxHp;
    const def = this.def;
    const wantPhase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
    if (wantPhase > this.phase && wantPhase <= def.phases) {
      this.phase = wantPhase;
      AudioSys.bossRoar();
      FX.ring(this.x, this.y, this.color, 260, 0.8, 8);
      FX.shake(14);
      FX.hitStop(0.12);
      FX.text(this.x, this.y - this.r - 30, 'PHASE ' + this.phase, this.color, 24);
      // Phase transition ring attack.
      this.ringAttack(def.ringBullets, def.bulletSpeed * 1.1);
    }
    if (this.hp <= 0) this.die();
  },

  ringAttack(count, speed) {
    const off = rand(0, TAU);
    for (let i = 0; i < count; i++) {
      const a = off + (i / count) * TAU;
      Bullets.fire(this.x, this.y, a, speed, this.def.bulletDmg, 8, CFG.colors.ebullet, 0, 0, 0, 0, 0, 3.2, 1);
    }
    AudioSys.explode(false);
  },

  spiralAttack(t) {
    // Continuous spiral during phase 3+.
    const arms = this.def.phases >= 4 ? 3 : 2;
    for (let k = 0; k < arms; k++) {
      const a = t * 3.2 + (k / arms) * TAU;
      Bullets.fire(this.x, this.y, a, this.def.bulletSpeed * 0.85, this.def.bulletDmg * 0.8, 7, CFG.colors.ebullet, 0, 0, 0, 0, 0, 3.0, 1);
    }
  },

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    const def = this.def;

    // Seek the player, accelerating in later phases.
    const a = ang(this.x, this.y, Player.x, Player.y);
    const sp = this.speed * (1 + (this.phase - 1) * 0.25);
    this.vx = damp(this.vx, Math.cos(a) * sp, 2.2, dt);
    this.vy = damp(this.vy, Math.sin(a) * sp, 2.2, dt);
    Physics.integrate(this, dt, { substeps: 2, knockDecay: 4.0 });

    // Ring bursts on a timer; faster per phase.
    this.ringT -= dt;
    if (this.ringT <= 0) {
      this.ringT = Math.max(1.1, 3.0 - this.phase * 0.45);
      this.ringAttack(def.ringBullets + this.phase * 4, def.bulletSpeed);
      FX.ring(this.x, this.y, this.color, 90, 0.4, 4);
    }
    // Spiral in phase 3+.
    if (this.phase >= 3) this.spiralAttack(this.t);

    // Charge dash with a wind-up telegraph.
    this.dashT -= dt;
    if (this.dashWind > 0) {
      this.dashWind -= dt;
      if (this.dashWind <= 0) {
        const ca = ang(this.x, this.y, Player.x, Player.y);
        this.vx = Math.cos(ca) * 620;
        this.vy = Math.sin(ca) * 620;
        AudioSys.dash();
        FX.shake(8);
      }
    } else if (this.dashT <= 0) {
      this.dashT = def.dashCd * rand(0.85, 1.15);
      this.dashWind = 0.6;
      FX.text(this.x, this.y - this.r - 20, '!', this.color, 30);
    }

    // Summon minions in phase 2+.
    if (this.phase >= 2) {
      this.summonT -= dt;
      if (this.summonT <= 0) {
        this.summonT = 8 - this.phase;
        for (let i = 0; i < def.summonCount; i++) {
          const sa = rand(0, TAU);
          Enemies.spawn(def.summonType,
            clamp(this.x + Math.cos(sa) * 90, 40, CFG.arenaW - 40),
            clamp(this.y + Math.sin(sa) * 90, 40, CFG.arenaH - 40),
            Game.waveScale(), null);
        }
        FX.ring(this.x, this.y, this.color, 130, 0.5, 4);
      }
    }

    // Contact damage.
    if (circleHit(this.x, this.y, this.r, Player.x, Player.y, Player.r)) {
      Player.takeDamage(this.damage, this.x, this.y);
    }
  },

  die() {
    this.active = false; this.alive = false;
    AudioSys.explode(true);
    FX.shake(24);
    FX.hitStop(0.2);
    FX.flash('#ffffff', 0.4);
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        if (Game.state !== 'play') return;
        FX.burst(this.x + rand(-50, 50), this.y + rand(-50, 50), this.color, 30, 380, 6, 0.9);
        AudioSys.explode(true);
      }, i * 130);
    }
    Player.score += Math.round(this.score * (1 + Math.min(CFG.comboMaxMult - 1, Player.combo * 0.05)));
    Player.credits += Math.round(this.score * 0.5 * Player.stats.goldMult);
    for (let i = 0; i < 14; i++) Pickups.spawnGem(this.x + rand(-40, 40), this.y + rand(-40, 40), 8);
    Pickups.spawnHealth(this.x + rand(-30, 30), this.y + rand(-30, 30));
    Pickups.spawnWeapon(this.x + rand(-30, 30), this.y + rand(-30, 30));
    FX.text(this.x, this.y, '+' + Math.round(this.score), CFG.colors.gold, 26);
    Game.onBossKill();
  },

  draw(ctx) {
    if (!this.active) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    // Rotating outer shell.
    ctx.rotate(this.t * 0.8);
    ctx.fillStyle = this.flash > 0 ? '#ffffff' : this.color;
    const sides = 7;
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const a2 = (i / sides) * TAU;
      const rr = this.r * (1 + Math.sin(this.t * 5 + i) * 0.05);
      if (i === 0) ctx.moveTo(Math.cos(a2) * rr, Math.sin(a2) * rr);
      else ctx.lineTo(Math.cos(a2) * rr, Math.sin(a2) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.rotate(-this.t * 0.8);
    // Inner core shows phase.
    ctx.fillStyle = '#04040c';
    ctx.beginPath();
    ctx.arc(0, 0, this.r * 0.55, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(0, 0, this.r * 0.3 * (0.6 + this.phase * 0.15) + Math.sin(this.t * 8) * 3, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Wind-up telegraph line.
    if (this.dashWind > 0) {
      const a = ang(this.x, this.y, Player.x, Player.y);
      ctx.strokeStyle = 'rgba(255,77,109,' + (0.25 + 0.5 * Math.abs(Math.sin(this.t * 20))) + ')';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + Math.cos(a) * 800, this.y + Math.sin(a) * 800);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  },
};

// ------------------------------------------------------------
// Pickups: XP gems, health, weapon crates.
// ------------------------------------------------------------
const Pickups = {
  gems: [],
  items: [],

  reset() { this.gems.length = 0; this.items.length = 0; },

  spawnGem(x, y, value) {
    if (this.gems.length > 260) this.gems.shift();
    this.gems.push({ x, y, vx: rand(-40, 40), vy: rand(-40, 40), v: value, life: CFG.gemLifetime, t: rand(0, TAU) });
  },
  spawnHealth(x, y) {
    this.items.push({ kind: 'health', x, y, t: 0, life: 26 });
  },
  spawnWeapon(x, y) {
    const w = pick(['shotgun', 'laser', 'missiles']);
    this.items.push({ kind: 'weapon', weapon: w, x, y, t: 0, life: 30 });
  },

  update(dt) {
    const magnet = CFG.pickupMagnet * Player.stats.magnetMult;
    const m2 = magnet * magnet;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      g.life -= dt;
      if (g.life <= 0) { this.gems.splice(i, 1); continue; }
      g.t += dt;
      const d2 = dist2(g.x, g.y, Player.x, Player.y);
      if (d2 < m2) {
        // Accelerate toward the player, faster when closer.
        const a = ang(g.x, g.y, Player.x, Player.y);
        const pull = 560 * (1 - Math.sqrt(d2) / magnet) + 220;
        g.vx = damp(g.vx, Math.cos(a) * pull, 6, dt);
        g.vy = damp(g.vy, Math.sin(a) * pull, 6, dt);
      } else {
        g.vx *= Math.exp(-2.5 * dt);
        g.vy *= Math.exp(-2.5 * dt);
      }
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      if (d2 < (Player.r + 10) * (Player.r + 10)) {
        Player.gainXp(g.v);
        AudioSys.gem();
        FX.burst(g.x, g.y, CFG.colors.gem, 3, 90, 2, 0.25);
        this.gems.splice(i, 1);
      }
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      it.t += dt;
      if (it.life <= 0) { this.items.splice(i, 1); continue; }
      if (dist2(it.x, it.y, Player.x, Player.y) < (Player.r + 16) * (Player.r + 16)) {
        if (it.kind === 'health') {
          Player.hp = Math.min(Player.maxHp, Player.hp + 30);
          AudioSys.pickup();
          FX.text(it.x, it.y - 12, '+30 HP', CFG.colors.hp, 15);
          FX.ring(it.x, it.y, CFG.colors.hp, 40, 0.4, 3);
        } else {
          Player.weapon = it.weapon;
          AudioSys.buy();
          FX.text(it.x, it.y - 12, WEAPONS[it.weapon].name, CFG.colors.gold, 14);
          FX.ring(it.x, it.y, CFG.colors.gold, 50, 0.5, 3);
        }
        this.items.splice(i, 1);
      }
    }
  },

  draw(ctx) {
    for (const g of this.gems) {
      const blinkOut = g.life < 3 && Math.floor(g.life * 6) % 2 === 0;
      if (blinkOut) continue;
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.t * 2);
      ctx.fillStyle = CFG.colors.gem;
      ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
    }
    for (const it of this.items) {
      const bob = Math.sin(it.t * 4) * 3;
      ctx.save();
      ctx.translate(it.x, it.y + bob);
      if (it.kind === 'health') {
        ctx.fillStyle = CFG.colors.hp;
        ctx.fillRect(-8, -3, 16, 6);
        ctx.fillRect(-3, -8, 6, 16);
      } else {
        ctx.fillStyle = CFG.colors.gold;
        ctx.fillRect(-9, -7, 18, 14);
        ctx.fillStyle = '#04040c';
        ctx.fillRect(-6, -4, 12, 8);
        ctx.fillStyle = CFG.colors.gold;
        ctx.fillRect(-3, -2, 6, 4);
      }
      ctx.restore();
    }
  },
};
