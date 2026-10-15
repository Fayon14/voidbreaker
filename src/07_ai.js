// ============================================================
// AI: steering behaviors + per-type decision logic.
// ============================================================
const AI = {
  steer: { x: 0, y: 0 },

  update(e, dt) {
    const def = ENEMY_TYPES[e.type];
    const s = AI.steer;
    s.x = 0; s.y = 0;

    switch (def.behavior) {
      case 'chase': AI.chase(e, dt); break;
      case 'dart': AI.dart(e, dt); break;
      case 'kite': AI.kite(e, def, dt); break;
      case 'orbit': AI.orbit(e, def, dt); break;
      case 'boid': AI.boid(e, def, dt); break;
      case 'kamikaze': AI.chase(e, dt); break;
    }

    // Integrate steering into velocity.
    e.vx = damp(e.vx, s.x * e.speed, 4, dt);
    e.vy = damp(e.vy, s.y * e.speed, 4, dt);
  },

  chase(e, dt) {
    const s = AI.steer;
    const a = ang(e.x, e.y, Player.x, Player.y);
    s.x = Math.cos(a);
    s.y = Math.sin(a);
    AI.separate(e, s, 0.7);
    AI.avoidObstacles(e, s);
  },

  // Darter: telegraph, then rocket at the player.
  dart(e, dt) {
    const def = ENEMY_TYPES[e.type];
    const s = AI.steer;
    if (e.state === 'chase') {
      const a = ang(e.x, e.y, Player.x, Player.y);
      s.x = Math.cos(a) * 0.5;
      s.y = Math.sin(a) * 0.5;
      e.timer += dt;
      const d = dist(e.x, e.y, Player.x, Player.y);
      if (e.timer > def.dartCd && d < 420 && d > 90) {
        e.state = 'windup';
        e.timer = def.dartWind;
        e.dartAng = a;
      }
    } else if (e.state === 'windup') {
      e.timer -= dt;
      // Track the player slowly during wind-up so it stays fair.
      e.dartAng = e.dartAng + clamp(normAng(ang(e.x, e.y, Player.x, Player.y) - e.dartAng), -1.6 * dt, 1.6 * dt);
      if (e.timer <= 0) {
        e.state = 'dash';
        e.timer = 0.42;
        e.vx = Math.cos(e.dartAng) * def.dartSpeed;
        e.vy = Math.sin(e.dartAng) * def.dartSpeed;
        FX.trail(e.x, e.y, e.color, 4);
      }
    } else {
      e.timer -= dt;
      FX.trail(e.x, e.y, e.color, 3);
      if (e.timer <= 0) { e.state = 'chase'; e.timer = rand(0, 0.6); }
      s.x = 0; s.y = 0; // ballistic during the dash
      return;
    }
    AI.separate(e, s, 0.5);
  },

  // Kite: hold at preferred distance, strafe, and fire.
  kite(e, def, dt) {
    const s = AI.steer;
    const d = dist(e.x, e.y, Player.x, Player.y);
    const a = ang(e.x, e.y, Player.x, Player.y);
    if (d > def.keepDist * 1.15) {
      s.x = Math.cos(a); s.y = Math.sin(a);
    } else if (d < def.keepDist * 0.8) {
      s.x = -Math.cos(a); s.y = -Math.sin(a);
    } else {
      // Strafe sideways.
      const perp = a + Math.PI / 2 * (e.t % 20 < 10 ? 1 : -1);
      s.x = Math.cos(perp) * 0.7;
      s.y = Math.sin(perp) * 0.7;
    }
    AI.separate(e, s, 0.6);
    AI.avoidObstacles(e, s);

    e.fireT -= dt;
    if (e.fireT <= 0 && d < 560) {
      e.fireT = def.fireCd * rand(0.85, 1.15);
      const aim = ang(e.x, e.y, Player.x, Player.y) + rand(-0.08, 0.08);
      Bullets.fire(e.x, e.y, aim, def.bulletSpeed, def.bulletDmg * (1 + (Waves.wave - 1) * 0.03),
        def.bulletSize, CFG.colors.ebullet, 0, 0, 0, 0, 0, 3.5, 1);
      AudioSys.tone(300, 0.08, 'square', 0.04, 140);
      FX.spawn(e.x + Math.cos(aim) * e.r, e.y + Math.sin(aim) * e.r,
        { color: CFG.colors.ebullet, size: 5, life: 0.1 });
    }
  },

  // Orbit: circle the player at range, fire inward.
  orbit(e, def, dt) {
    const s = AI.steer;
    const a = ang(Player.x, Player.y, e.x, e.y); // from player to enemy
    const d = dist(e.x, e.y, Player.x, Player.y);
    // Radial correction plus tangential drive.
    const radial = clamp((def.orbitDist - d) / 100, -1, 1);
    const tangent = def.orbitDir;
    const rx = -Math.cos(a), ry = -Math.sin(a);
    const tx = -Math.sin(a) * tangent, ty = Math.cos(a) * tangent;
    s.x = rx * radial + tx;
    s.y = ry * radial + ty;
    AI.separate(e, s, 0.6);

    e.fireT -= dt;
    if (e.fireT <= 0) {
      e.fireT = def.fireCd * rand(0.85, 1.15);
      const aim = ang(e.x, e.y, Player.x, Player.y) + rand(-0.06, 0.06);
      Bullets.fire(e.x, e.y, aim, def.bulletSpeed, def.bulletDmg * (1 + (Waves.wave - 1) * 0.03),
        def.bulletSize, CFG.colors.ebullet, 0, 0, 0, 0, 0, 3.5, 1);
    }
  },

  // Boid: separation + alignment + cohesion toward the player's gravity.
  boid(e, def, dt) {
    const s = AI.steer;
    let sepX = 0, sepY = 0, cohX = 0, cohY = 0, n = 0;
    const q = Enemies.hash.query(e.x, e.y, 46, Enemies.near);
    for (const o of q) {
      if (o === e || !o.alive) continue;
      const d2 = dist2(e.x, e.y, o.x, o.y);
      if (d2 < 46 * 46 && d2 > 0.01) {
        const d = Math.sqrt(d2);
        sepX += (e.x - o.x) / d;
        sepY += (e.y - o.y) / d;
        cohX += o.vx; cohY += o.vy;
        n++;
      }
    }
    if (n > 0) {
      sepX /= n; sepY /= n;
      cohX /= n; cohY /= n;
    }
    const pa = ang(e.x, e.y, Player.x, Player.y);
    s.x = Math.cos(pa) + sepX * 1.4 + cohX / 220 * 0.3;
    s.y = Math.sin(pa) + sepY * 1.4 + cohY / 220 * 0.3;
    const l = Math.hypot(s.x, s.y) || 1;
    s.x /= l; s.y /= l;
  },

  // Push away from nearby same-type enemies so crowds spread out.
  separate(e, s, weight) {
    let sx = 0, sy = 0;
    const q = Enemies.hash.query(e.x, e.y, e.r * 2.2, Enemies.near);
    for (const o of q) {
      if (o === e || !o.alive) continue;
      const d2 = dist2(e.x, e.y, o.x, o.y);
      const minD = e.r + o.r;
      if (d2 < minD * minD && d2 > 0.01) {
        const d = Math.sqrt(d2);
        sx += (e.x - o.x) / d * (1 - d / minD);
        sy += (e.y - o.y) / d * (1 - d / minD);
      }
    }
    s.x += sx * weight;
    s.y += sy * weight;
  },

  // Simple obstacle avoidance: sample ahead, steer around blocks.
  avoidObstacles(e, s) {
    for (const o of World.obstacles) {
      const d = dist(e.x, e.y, o.cx, o.cy);
      const rr = o.br + e.r + 24;
      if (d < rr && d > 0.01) {
        const push = (1 - d / rr) * 1.6;
        s.x += (e.x - o.cx) / d * push;
        s.y += (e.y - o.cy) / d * push;
      }
    }
  },
};
