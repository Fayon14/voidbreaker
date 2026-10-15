// ============================================================
// PHYSICS ENGINE v2 (VOIDBREAKER 1.1)
// Body-based top-down physics:
//   - semi-implicit integration with collision substeps
//   - per-body mass, restitution and drag
//   - knockback on its own fast-decaying impulse channel so it
//     never fights steering
//   - circle vs wall and circle vs AABB resolution with slide
//   - swept (continuous) segment tests so fast shots never
//     tunnel through thin targets
//   - pairwise crowd separation through a spatial hash
// ============================================================
const Physics = {
  hash: null,
  _near: [],

  init() {
    this.hash = new SpatialHash(72);
  },

  // Body factory. Anything with x, y, vx, vy, r works as a body.
  // Optional: mass, rest (restitution), wall (arena bounce, default true).
  body(x, y, r, o) {
    o = o || {};
    return {
      x: x, y: y, vx: 0, vy: 0,
      kx: 0, ky: 0,   // knockback channel, decays fast
      r: r,
      mass: o.mass || 1,
      rest: o.rest !== undefined ? o.rest : 0.35,
      wall: o.wall !== false,
    };
  },

  // Add an instantaneous velocity change to the knockback channel.
  impulse(b, ix, iy) {
    b.kx = (b.kx || 0) + ix;
    b.ky = (b.ky || 0) + iy;
  },

  // Knockback away from a source point.
  knockFrom(b, sx, sy, power) {
    const a = ang(sx, sy, b.x, b.y);
    this.impulse(b, Math.cos(a) * power, Math.sin(a) * power);
  },

  // Semi-implicit integration with collision substeps.
  // opts: { knockDecay, substeps, drag }
  integrate(b, dt, opts) {
    opts = opts || {};
    // Knockback decays exponentially, spring-like recovery.
    const kd = Math.exp(-(opts.knockDecay || 6.5) * dt);
    b.kx *= kd; b.ky *= kd;
    if (Math.abs(b.kx) < 2) b.kx = 0;
    if (Math.abs(b.ky) < 2) b.ky = 0;

    let vx = b.vx + b.kx;
    let vy = b.vy + b.ky;
    const dr = opts.drag || 0;
    if (dr > 0) {
      const f = Math.exp(-dr * dt);
      vx *= f; vy *= f;
    }

    const steps = opts.substeps || 2;
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      b.x += vx * sdt;
      b.y += vy * sdt;
      this.collide(b);
    }
    return { vx: vx, vy: vy };
  },

  // Resolve one body against arena walls and world obstacles.
  collide(b) {
    const rest = b.rest !== undefined ? b.rest : 0.35;
    if (b.wall !== false) {
      if (b.x < b.r) { b.x = b.r; if (b.vx < 0) b.vx = -b.vx * rest; if (b.kx < 0) b.kx = -b.kx * rest; }
      else if (b.x > CFG.arenaW - b.r) { b.x = CFG.arenaW - b.r; if (b.vx > 0) b.vx = -b.vx * rest; if (b.kx > 0) b.kx = -b.kx * rest; }
      if (b.y < b.r) { b.y = b.r; if (b.vy < 0) b.vy = -b.vy * rest; if (b.ky < 0) b.ky = -b.ky * rest; }
      else if (b.y > CFG.arenaH - b.r) { b.y = CFG.arenaH - b.r; if (b.vy > 0) b.vy = -b.vy * rest; if (b.ky > 0) b.ky = -b.ky * rest; }
    }
    for (const o of World.obstacles) {
      const nx = clamp(b.x, o.x, o.x + o.w);
      const ny = clamp(b.y, o.y, o.y + o.h);
      const dx = b.x - nx, dy = b.y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 >= b.r * b.r) continue;
      const d = Math.sqrt(d2);
      if (d < 0.0001) {
        // Center inside the box: eject along the shallowest axis.
        const left = b.x - o.x, right = o.x + o.w - b.x;
        const top = b.y - o.y, bottom = o.y + o.h - b.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) { b.x = o.x - b.r; if (b.vx > 0) b.vx = -b.vx * rest; }
        else if (m === right) { b.x = o.x + o.w + b.r; if (b.vx < 0) b.vx = -b.vx * rest; }
        else if (m === top) { b.y = o.y - b.r; if (b.vy > 0) b.vy = -b.vy * rest; }
        else { b.y = o.y + o.h + b.r; if (b.vy < 0) b.vy = -b.vy * rest; }
        continue;
      }
      const ux = dx / d, uy = dy / d;
      const push = b.r - d;
      b.x += ux * push;
      b.y += uy * push;
      const dot = b.vx * ux + b.vy * uy;
      if (dot < 0) {
        b.vx -= (1 + rest) * dot * ux;
        b.vy -= (1 + rest) * dot * uy;
      }
      const kdot = (b.kx || 0) * ux + (b.ky || 0) * uy;
      if (kdot < 0) {
        b.kx -= kdot * ux;
        b.ky -= kdot * uy;
      }
    }
  },

  // Pairwise circle separation over a spatial hash. Mass-weighted,
  // with closing-velocity removal so nothing vibrates.
  resolvePairs(items, count) {
    this.hash.clear();
    for (let i = 0; i < count; i++) {
      const e = items[i];
      if (e.alive) this.hash.insert(e);
    }
    for (let i = 0; i < count; i++) {
      const e = items[i];
      if (!e.alive) continue;
      const q = this.hash.query(e.x, e.y, e.r + 40, this._near);
      for (let j = 0; j < q.length; j++) {
        const o = q[j];
        if (o === e || !o.alive) continue;
        const dx = e.x - o.x, dy = e.y - o.y;
        const minD = e.r + o.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD || d2 < 0.0001) continue;
        const d = Math.sqrt(d2);
        const overlap = minD - d;
        const me = e.mass || 1, mo = o.mass || 1;
        const totalM = me + mo;
        const ux = dx / d, uy = dy / d;
        // Positional correction, weighted by the other body's mass.
        const share = overlap * (mo / totalM);
        e.x += ux * share;
        e.y += uy * share;
        const rel = (e.vx - o.vx) * ux + (e.vy - o.vy) * uy;
        if (rel < 0) {
          e.vx -= rel * ux * (mo / totalM) * 1.4;
          e.vy -= rel * uy * (mo / totalM) * 1.4;
          o.vx += rel * ux * (me / totalM) * 1.4;
          o.vy += rel * uy * (me / totalM) * 1.4;
        }
      }
    }
  },

  // Continuous collision: does the segment (x0,y0)-(x1,y1) pass within
  // cr of (cx,cy)?
  segCircle(x0, y0, x1, y1, cx, cy, cr) {
    const dx = x1 - x0, dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 0.0001) {
      t = ((cx - x0) * dx + (cy - y0) * dy) / len2;
      t = clamp(t, 0, 1);
    }
    const px = x0 + dx * t, py = y0 + dy * t;
    return dist2(px, py, cx, cy) <= cr * cr;
  },

  // Continuous circle vs AABB along a segment (sampled, bounded steps).
  segRect(x0, y0, x1, y1, rx, ry, rw, rh, cr) {
    const len = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    const steps = Math.max(1, Math.ceil(len / Math.max(2, cr * 0.9)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (circleRectHit(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, cr, rx, ry, rw, rh)) return true;
    }
    return false;
  },
};
