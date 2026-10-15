// ============================================================
// VOIDBREAKER - configuration and data tables
// All tuning lives here so balance changes never touch systems.
// ============================================================
'use strict';

const CFG = {
  version: '1.0.0',
  saveKey: 'voidbreaker_save_v1',

  // Arena (world units). Camera follows the player inside these bounds.
  arenaW: 2600,
  arenaH: 2000,
  wallPad: 40,

  // Player tuning
  playerRadius: 14,
  playerSpeed: 260,          // px/s max speed
  playerAccel: 1900,         // px/s^2
  playerFriction: 8.5,       // exponential damping coefficient
  playerMaxHp: 100,
  dashSpeed: 950,
  dashTime: 0.16,
  dashCooldown: 1.6,
  dashIframes: 0.28,
  iframeTime: 0.9,
  pickupMagnet: 110,

  // Combat
  critChance: 0.05,
  critMult: 2.0,
  comboWindow: 3.0,
  comboMaxMult: 5.0,

  // XP curve: xp needed for level n = base * n^exp
  xpBase: 22,
  xpExp: 1.42,
  gemLifetime: 22,

  // Waves
  waveIntroTime: 2.2,
  waveClearBonus: 120,
  bossEvery: 5,
  maxAliveEnemies: 90,

  // Particles
  particleMax: 1600,
  floatTextMax: 120,

  // Colors (neon on void palette)
  colors: {
    bg: '#04040c',
    bgGrid: 'rgba(70,90,160,0.10)',
    player: '#4ef1ff',
    playerCore: '#e9ffff',
    dash: '#a7ff5e',
    bullet: '#ffe66d',
    bulletAlt: '#ff9d5c',
    laser: '#ff5cf0',
    ebullet: '#ff5c7a',
    hp: '#4ef1a0',
    hpLow: '#ff5c5c',
    xp: '#9d6bff',
    gem: '#6bd6ff',
    gold: '#ffd257',
    boss: '#ff4d6d',
    ui: '#cfe6ff',
    uiDim: 'rgba(207,230,255,0.55)',
    panel: 'rgba(10,14,30,0.88)',
    enemyA: '#ff6b4d',   // grunt
    enemyB: '#ff4dd8',   // darter
    enemyC: '#7dff4d',   // spitter
    enemyD: '#4d9dff',   // splitter
    enemyE: '#ffe14d',   // orbiter
    enemyF: '#b44dff',   // brute
    enemyG: '#ff9d4d',   // swarm
    enemyH: '#ff2d55',   // bomber
    elite: '#ffffff',
  },
};

// ------------------------------------------------------------
// Weapons. Each defines the player's fire behavior.
// ------------------------------------------------------------
const WEAPONS = {
  blaster: {
    name: 'PULSE BLASTER',
    cooldown: 0.16,
    damage: 10,
    speed: 780,
    count: 1,
    spread: 0.02,
    size: 5,
    color: 'bullet',
    pierce: 0,
    knock: 90,
    desc: 'Reliable plasma bolts. Never runs dry.',
  },
  shotgun: {
    name: 'SCATTER CANNON',
    cooldown: 0.62,
    damage: 7,
    speed: 700,
    count: 6,
    spread: 0.42,
    size: 4,
    color: 'bulletAlt',
    pierce: 0,
    knock: 150,
    lifetime: 0.55,
    desc: 'Six pellets of close range persuasion.',
  },
  laser: {
    name: 'PHOTON LANCE',
    cooldown: 0.9,
    damage: 26,
    speed: 1500,
    count: 1,
    spread: 0.0,
    size: 7,
    color: 'laser',
    pierce: 3,
    knock: 40,
    desc: 'A rail of light. Burns through ranks.',
  },
  missiles: {
    name: 'SEEKER PODS',
    cooldown: 0.75,
    damage: 18,
    speed: 420,
    count: 2,
    spread: 0.5,
    size: 6,
    color: 'bulletAlt',
    pierce: 0,
    knock: 200,
    homing: 3.2,
    blast: 90,
    blastDmg: 14,
    lifetime: 2.4,
    desc: 'Fire and forget. Loves crowds.',
  },
};

// ------------------------------------------------------------
// Enemy archetypes. Data driven, one update fn per behavior.
// ------------------------------------------------------------
const ENEMY_TYPES = {
  grunt: {
    name: 'GRUNT', color: 'enemyA', radius: 15, hp: 26, speed: 105,
    damage: 12, score: 10, xp: 3, mass: 1,
    behavior: 'chase', touch: true,
  },
  darter: {
    name: 'DARTER', color: 'enemyB', radius: 12, hp: 18, speed: 70,
    damage: 14, score: 15, xp: 4, mass: 0.8,
    behavior: 'dart', dartSpeed: 560, dartWind: 0.55, dartCd: 1.9, touch: true,
  },
  spitter: {
    name: 'SPITTER', color: 'enemyC', radius: 14, hp: 30, speed: 80,
    damage: 8, score: 20, xp: 5, mass: 1,
    behavior: 'kite', keepDist: 320, fireCd: 1.7, bulletSpeed: 240,
    bulletDmg: 10, bulletSize: 7, touch: true,
  },
  splitter: {
    name: 'SPLITTER', color: 'enemyD', radius: 20, hp: 44, speed: 85,
    damage: 12, score: 25, xp: 6, mass: 1.4,
    behavior: 'chase', splits: 3, childType: 'shard', touch: true,
  },
  shard: {
    name: 'SHARD', color: 'enemyD', radius: 9, hp: 10, speed: 165,
    damage: 6, score: 5, xp: 1, mass: 0.5,
    behavior: 'chase', touch: true,
  },
  orbiter: {
    name: 'ORBITER', color: 'enemyE', radius: 13, hp: 34, speed: 190,
    damage: 10, score: 20, xp: 5, mass: 0.9,
    behavior: 'orbit', orbitDist: 210, orbitDir: 1, fireCd: 2.4,
    bulletSpeed: 300, bulletDmg: 9, bulletSize: 6, touch: true,
  },
  brute: {
    name: 'BRUTE', color: 'enemyF', radius: 30, hp: 160, speed: 55,
    damage: 24, score: 50, xp: 12, mass: 3.2,
    behavior: 'chase', knockResist: 0.75, touch: true,
  },
  swarm: {
    name: 'SWARM', color: 'enemyG', radius: 8, hp: 8, speed: 190,
    damage: 6, score: 5, xp: 1, mass: 0.35,
    behavior: 'boid', touch: true,
  },
  bomber: {
    name: 'BOMBER', color: 'enemyH', radius: 16, hp: 22, speed: 125,
    damage: 34, score: 30, xp: 7, mass: 1.1,
    behavior: 'kamikaze', fuse: 0.55, blast: 130, blastDmg: 34, touch: false,
  },
};

// Elite modifiers rolled per spawn at higher waves.
const ELITE_MODS = [
  { id: 'swift',   name: 'SWIFT',   mult: { speed: 1.45 }, tint: '#aef' },
  { id: 'iron',    name: 'IRON',    mult: { hp: 2.6 },     tint: '#fa4' },
  { id: 'giant',   name: 'GIANT',   mult: { radius: 1.7, hp: 1.8, damage: 1.3 }, tint: '#f6f' },
  { id: 'vampiric',name: 'VAMPIRIC',mult: { lifesteal: 0.25 }, tint: '#f55' },
  { id: 'volatile',name: 'VOLATILE',mult: { deathBlast: 120, deathBlastDmg: 18 }, tint: '#fa2' },
];

// ------------------------------------------------------------
// Boss definitions. One per boss tier, cycled with scaling.
// ------------------------------------------------------------
const BOSSES = [
  {
    id: 'warden', name: 'THE WARDEN', color: 'boss', radius: 46,
    hp: 1500, speed: 85, damage: 26, score: 800, xp: 60,
    phases: 3, ringBullets: 18, bulletSpeed: 230, bulletDmg: 12,
    dashCd: 3.4, summonType: 'grunt', summonCount: 5,
  },
  {
    id: 'hydra', name: 'HYDRA PRIME', color: 'boss', radius: 54,
    hp: 2600, speed: 70, damage: 30, score: 1400, xp: 90,
    phases: 4, ringBullets: 24, bulletSpeed: 260, bulletDmg: 13,
    dashCd: 2.6, summonType: 'spitter', summonCount: 4,
  },
  {
    id: 'annihilator', name: 'ANNIHILATOR', color: 'boss', radius: 62,
    hp: 4200, speed: 95, damage: 36, score: 2400, xp: 140,
    phases: 4, ringBullets: 30, bulletSpeed: 290, bulletDmg: 15,
    dashCd: 2.1, summonType: 'swarm', summonCount: 14,
  },
];

// ------------------------------------------------------------
// In-run level-up upgrade pool. max stacks, apply mutates stats.
// ------------------------------------------------------------
const UPGRADES = [
  { id: 'dmg',    name: 'OVERCHARGE',     desc: '+18% weapon damage',        max: 8, apply: s => { s.dmgMult += 0.18; } },
  { id: 'rate',   name: 'RAPID CYCLER',   desc: '+15% fire rate',            max: 8, apply: s => { s.rateMult += 0.15; } },
  { id: 'multi',  name: 'SPLIT BARREL',   desc: '+1 projectile per shot',    max: 3, apply: s => { s.extraShots += 1; } },
  { id: 'pierce', name: 'PHASE ROUNDS',   desc: 'Bullets pierce +1 enemy',   max: 4, apply: s => { s.pierce += 1; } },
  { id: 'speed',  name: 'LIGHT FRAME',    desc: '+12% move speed',           max: 6, apply: s => { s.speedMult += 0.12; } },
  { id: 'hp',     name: 'PLATING',        desc: '+25 max HP, heal 25',       max: 6, apply: s => { s.maxHp += 25; } },
  { id: 'regen',  name: 'NANOREPAIR',     desc: '+0.8 HP/sec regen',         max: 5, apply: s => { s.regen += 0.8; } },
  { id: 'dash',   name: 'PHASE DRIVE',    desc: '-25% dash cooldown',        max: 4, apply: s => { s.dashCdMult *= 0.75; } },
  { id: 'magnet', name: 'GRAVWELL',       desc: '+45% pickup magnet range',  max: 4, apply: s => { s.magnetMult += 0.45; } },
  { id: 'crit',   name: 'CRIT MATRIX',    desc: '+7% crit chance',           max: 6, apply: s => { s.critChance += 0.07; } },
  { id: 'critd',  name: 'RUPTURE',        desc: '+35% crit damage',          max: 4, apply: s => { s.critMult += 0.35; } },
  { id: 'life',   name: 'SIPHON',         desc: 'Heal 3% of damage dealt',   max: 3, apply: s => { s.lifesteal += 0.03; } },
  { id: 'drone',  name: 'ORBIT DRONE',    desc: 'A drone fires for you',     max: 4, apply: s => { s.drones += 1; } },
  { id: 'shield', name: 'AEGIS',          desc: 'Shield blocks one hit, recharges', max: 3, apply: s => { s.shieldMax += 1; } },
  { id: 'thorn',  name: 'REACTIVE ARMOR', desc: 'Contact damage back: 20',   max: 3, apply: s => { s.thorns += 20; } },
  { id: 'boom',   name: 'VOLATILE ROUNDS',desc: 'Bullets explode on kill',   max: 2, apply: s => { s.boomOnKill += 1; } },
  { id: 'slow',   name: 'CHRONO FIELD',   desc: 'Enemies near you slow 25%', max: 2, apply: s => { s.chrono += 0.25; } },
  { id: 'xp',     name: 'DATA SIPHON',    desc: '+25% XP from gems',         max: 4, apply: s => { s.xpMult += 0.25; } },
  { id: 'gold',   name: 'SCRAPPER',       desc: '+30% credits earned',       max: 4, apply: s => { s.goldMult += 0.30; } },
  { id: 'greed',  name: 'SECOND WIND',    desc: 'Revive once at 50% HP',     max: 1, apply: s => { s.revives += 1; } },
];

// ------------------------------------------------------------
// Meta progression shop (spend credits earned across runs).
// ------------------------------------------------------------
const META_SHOP = [
  { id: 'm_hp',    name: 'HULL LATTICE',  desc: '+20 starting max HP',       cost: 120, scale: 1.6, max: 5, apply: s => { s.maxHp += 20; } },
  { id: 'm_dmg',   name: 'FOCUS CRYSTAL', desc: '+10% weapon damage',        cost: 150, scale: 1.7, max: 5, apply: s => { s.dmgMult += 0.10; } },
  { id: 'm_speed', name: 'BOOSTER RIG',   desc: '+6% move speed',            cost: 100, scale: 1.6, max: 5, apply: s => { s.speedMult += 0.06; } },
  { id: 'm_start', name: 'WAR CHEST',     desc: 'Start with a better weapon',cost: 400, scale: 2.0, max: 1, apply: s => { s.startWeapon = 'shotgun'; } },
  { id: 'm_dash',  name: 'REFLEX CORE',   desc: '-15% dash cooldown',        cost: 180, scale: 1.7, max: 3, apply: s => { s.dashCdMult *= 0.85; } },
  { id: 'm_crit',  name: 'DEADEYE CHIP',  desc: '+3% crit chance',           cost: 140, scale: 1.6, max: 5, apply: s => { s.critChance += 0.03; } },
  { id: 'm_regen', name: 'REPAIR SWARM',  desc: '+0.4 HP/sec regen',         cost: 160, scale: 1.6, max: 4, apply: s => { s.regen += 0.4; } },
  { id: 'm_gold',  name: 'PROSPECTOR',    desc: '+15% credits earned',       cost: 130, scale: 1.6, max: 4, apply: s => { s.goldMult += 0.15; } },
];

// Base stats every run starts from (meta upgrades mutate this).
function baseStats() {
  return {
    dmgMult: 1, rateMult: 1, extraShots: 0, pierce: 0,
    speedMult: 1, maxHp: CFG.playerMaxHp, regen: 0,
    dashCdMult: 1, magnetMult: 1,
    critChance: CFG.critChance, critMult: CFG.critMult,
    lifesteal: 0, drones: 0, shieldMax: 0, thorns: 0,
    boomOnKill: 0, chrono: 0, xpMult: 1, goldMult: 1,
    revives: 0, startWeapon: 'blaster',
  };
}

// Wave composition: which enemy types may appear at wave N, and how many.
function waveComposition(n) {
  const budget = Math.round(8 + n * 3.6 + Math.pow(n, 1.35) * 0.9);
  const pool = ['grunt'];
  if (n >= 2) pool.push('darter');
  if (n >= 3) pool.push('spitter');
  if (n >= 4) pool.push('swarm');
  if (n >= 6) pool.push('splitter');
  if (n >= 7) pool.push('orbiter');
  if (n >= 9) pool.push('bomber');
  if (n >= 11) pool.push('brute');
  const cost = { grunt: 2, darter: 3, spitter: 4, swarm: 1, splitter: 6, orbiter: 4, bomber: 5, brute: 12, shard: 1 };
  return { budget, pool, cost };
}

// HP and count scaling per wave.
function waveScale(n) {
  return {
    hp: 1 + (n - 1) * 0.16 + Math.pow(n, 1.6) * 0.008,
    dmg: 1 + (n - 1) * 0.055,
    speed: 1 + Math.min(0.55, (n - 1) * 0.02),
  };
}
