// ============================================================
// Utilities: math, RNG, pools, spatial hash.
// ============================================================
const TAU = Math.PI * 2;

function rand(a, b) { return a + Math.random() * (b - a); }
function irand(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function chance(p) { return Math.random() < p; }
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
function dist(ax, ay, bx, by) { return Math.sqrt(dist2(ax, ay, bx, by)); }
function ang(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
function normAng(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
function approach(v, target, delta) {
  if (v < target) return Math.min(v + delta, target);
  return Math.max(v - delta, target);
}
// Frame-rate independent exponential damping.
function damp(v, target, rate, dt) { return lerp(v, target, 1 - Math.exp(-rate * dt)); }

// Seeded RNG (mulberry32). Used for arena layout so a run is reproducible
// from its seed and for the music sequencer.
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Simple weighted pick from [{w: weight, ...}] arrays.
function weightedPick(items, rng) {
  const r = rng || Math.random;
  let total = 0;
  for (const it of items) total += it.w;
  let x = r() * total;
  for (const it of items) { x -= it.w; if (x <= 0) return it; }
  return items[items.length - 1];
}

// ------------------------------------------------------------
// Object pool. Reuses dead entries so the GC never sees the loop.
// ------------------------------------------------------------
class Pool {
  constructor(factory, size) {
    this.items = new Array(size);
    for (let i = 0; i < size; i++) this.items[i] = factory();
    this.count = 0; // active entries live at [0, count)
  }
  get() {
    if (this.count < this.items.length) {
      const o = this.items[this.count];
      this.count++;
      return o;
    }
    // Pool exhausted: recycle the oldest slot rather than grow forever.
    const o = this.items[0];
    // shift active range by rotating first item out
    this.items[0] = this.items[this.count - 1];
    this.items[this.count - 1] = o;
    return o;
  }
  release(i) {
    const last = this.count - 1;
    const tmp = this.items[i];
    this.items[i] = this.items[last];
    this.items[last] = tmp;
    this.count--;
  }
  clear() { this.count = 0; }
  forEach(fn) {
    // iterate backwards so fn may release entries safely
    for (let i = this.count - 1; i >= 0; i--) fn(this.items[i], i);
  }
}

// ------------------------------------------------------------
// Spatial hash: broad-phase collision for hundreds of bodies.
// ------------------------------------------------------------
class SpatialHash {
  constructor(cell) {
    this.cell = cell;
    this.map = new Map();
  }
  key(cx, cy) { return cx * 73856093 ^ cy * 19349663; }
  clear() { this.map.clear(); }
  insert(o) {
    const c = this.cell;
    const x0 = Math.floor((o.x - o.r) / c), x1 = Math.floor((o.x + o.r) / c);
    const y0 = Math.floor((o.y - o.r) / c), y1 = Math.floor((o.y + o.r) / c);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const k = this.key(cx, cy);
        let arr = this.map.get(k);
        if (!arr) { arr = []; this.map.set(k, arr); }
        arr.push(o);
      }
  }
  query(x, y, r, out) {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const arr = this.map.get(this.key(cx, cy));
        if (arr) for (const o of arr) out.push(o);
      }
    return out;
  }
}

// Circle vs circle overlap.
function circleHit(ax, ay, ar, bx, by, br) {
  const rr = ar + br;
  return dist2(ax, ay, bx, by) <= rr * rr;
}

// Circle vs axis-aligned rect.
function circleRectHit(cx, cy, cr, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  return dist2(cx, cy, nx, ny) <= cr * cr;
}

// Draw helper: text with optional glow.
function drawText(ctx, text, x, y, size, color, align, bold) {
  ctx.font = (bold ? 'bold ' : '') + size + 'px "Courier New", monospace';
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// Volume ladder for the settings screen.
function nextVol(v) {
  const ladder = [0, 0.25, 0.5, 0.75, 1];
  const i = ladder.indexOf(Math.round(v * 100) / 100);
  return ladder[(i + 1) % ladder.length];
}
