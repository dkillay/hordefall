import * as THREE from 'three';
import './style.css';
import { buildWorld, ARENA } from './world';
import { Mob, type MobType } from './mobs';
import { initAudio, sfx } from './audio';

// ============================================================================
// constants
// ============================================================================
const EYE = 1.62;
const PR = 0.4; // player radius
const GRAVITY = 24;
const JUMP = 8.6;
const WALK = 6.6;
const SPRINT = 10.2;
const SENS = 0.0022;
const MAX_ALIVE = 26;
const BASE_FOV = 78;

// ============================================================================
// DOM
// ============================================================================
const $ = (id: string) => document.getElementById(id) as HTMLElement;
const ui = {
  hud: $('hud'), menu: $('menu'), pause: $('pause'), over: $('gameover'),
  hpFill: $('hpfill'), hpText: $('hptext'), mag: $('mag'), reserve: $('reserve'),
  wave: $('wave'), score: $('score'), combo: $('combo'), mobsLeft: $('mobsleft'),
  banner: $('banner'), feed: $('killfeed'), hit: $('hitmarker'), vignette: $('vignette'),
  lowhp: $('lowhp'), dmgind: $('dmgind'), reloadBar: $('reloadbar'), best: $('best'),
  overStats: $('overstats'), crosshair: $('crosshair'),
  slots: Array.from(document.querySelectorAll<HTMLElement>('.slot')),
};

function loadBest(): number {
  try { return Number(localStorage.getItem('hordefall-best') || 0); } catch { return 0; }
}
function saveBest(v: number): void {
  try { localStorage.setItem('hordefall-best', String(v)); } catch { /* storage unavailable */ }
}
const showBest = () => {
  const b = loadBest();
  ui.best.textContent = b > 0 ? `BEST SCORE ${b.toLocaleString()}` : '';
};
showBest();

// ============================================================================
// renderer / scene
// ============================================================================
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.autoClear = false;
renderer.setClearColor(0x08060f);
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x08060f, 0.024);

const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.03, 300);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = buildWorld(scene);

// Viewmodel is drawn in a second pass on layer 1 so the gun never clips into walls.
const VM_LAYER = 1;
const muzzleLight = new THREE.PointLight(0xffb060, 0, 9, 2);
muzzleLight.position.set(0.2, -0.1, -0.9);
camera.add(muzzleLight);
scene.traverse((o) => { if ((o as THREE.Light).isLight) o.layers.enable(VM_LAYER); });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================================
// weapons
// ============================================================================
type WeaponId = 'rifle' | 'shotgun' | 'rail';
interface Weapon {
  id: WeaponId;
  name: string;
  damage: number;
  rate: number;
  magSize: number;
  reserveMax: number;
  reloadTime: number;
  spread: number;
  pellets: number;
  auto: boolean;
  pierce: boolean;
  range: number;
  kick: number;
  recoil: number;
  shake: number;
  tracer: number;
  tracerW: number;
  tracerLife: number;
  pickupAmmo: number;
  sound: () => void;
  mag: number;
  reserve: number;
  model: THREE.Group;
  muzzle: THREE.Object3D;
  flash: THREE.Object3D;
}

const gunMetal = new THREE.MeshStandardMaterial({ color: 0x4a4658, metalness: 0.35, roughness: 0.4 });
const gunDark = new THREE.MeshStandardMaterial({ color: 0x24222c, metalness: 0.25, roughness: 0.6 });
const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

function buildGun(id: WeaponId): { model: THREE.Group; muzzle: THREE.Object3D; flash: THREE.Object3D } {
  const g = new THREE.Group();
  const part = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    g.add(m);
    return m;
  };
  const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const C = (r: number, len: number) => new THREE.CylinderGeometry(r, r, len, 10);
  const glow = (c: number) => new THREE.MeshBasicMaterial({ color: c });
  let muzzleZ = -0.6;

  if (id === 'rifle') {
    part(B(0.07, 0.1, 0.5), gunMetal, 0, 0, -0.1);
    part(C(0.018, 0.32), gunDark, 0, 0.015, -0.5, Math.PI / 2);
    part(B(0.05, 0.15, 0.07), gunDark, 0, -0.11, -0.13);
    part(B(0.05, 0.13, 0.06), gunDark, 0, -0.1, 0.09, 0.25);
    part(B(0.06, 0.08, 0.16), gunDark, 0, -0.01, 0.23);
    part(B(0.03, 0.045, 0.12), gunDark, 0, 0.07, -0.06);
    part(B(0.074, 0.016, 0.34), glow(0x3df2ff), 0, 0.02, -0.12);
    muzzleZ = -0.67;
  } else if (id === 'shotgun') {
    part(B(0.1, 0.11, 0.42), gunMetal, 0, 0, -0.05);
    part(C(0.024, 0.46), gunDark, -0.026, 0.02, -0.46, Math.PI / 2);
    part(C(0.024, 0.46), gunDark, 0.026, 0.02, -0.46, Math.PI / 2);
    part(B(0.09, 0.07, 0.2), gunDark, 0, -0.05, -0.4); // pump
    part(B(0.06, 0.14, 0.07), gunDark, 0, -0.1, 0.12, 0.3);
    part(B(0.08, 0.09, 0.2), gunDark, 0, -0.02, 0.24);
    part(B(0.104, 0.02, 0.3), glow(0xff8a2e), 0, 0.045, -0.05);
    muzzleZ = -0.7;
  } else {
    part(B(0.08, 0.12, 0.6), gunMetal, 0, 0, -0.12);
    part(C(0.02, 0.5), gunDark, 0, 0.0, -0.62, Math.PI / 2);
    const coilMat = glow(0xff2e88);
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 16), coilMat);
      t.position.set(0, 0, -0.45 - i * 0.09);
      g.add(t);
    }
    part(B(0.05, 0.14, 0.07), gunDark, 0, -0.11, 0.08, 0.3);
    part(B(0.06, 0.09, 0.18), gunDark, 0, -0.01, 0.26);
    part(B(0.04, 0.06, 0.16), gunDark, 0, 0.09, -0.08);
    part(B(0.084, 0.02, 0.5), coilMat, 0, -0.035, -0.12);
    muzzleZ = -0.9;
  }

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.015, muzzleZ);
  g.add(muzzle);
  const flash = new THREE.Group();
  const pg = new THREE.PlaneGeometry(0.32, 0.32);
  const f1 = new THREE.Mesh(pg, flashMat);
  const f2 = new THREE.Mesh(pg, flashMat);
  f1.rotation.z = Math.PI / 4;
  f2.rotation.y = Math.PI / 2;
  flash.add(f1, f2);
  flash.position.copy(muzzle.position);
  flash.visible = false;
  g.add(flash);
  g.traverse((o) => o.layers.set(VM_LAYER));
  return { model: g, muzzle, flash };
}

const viewmodel = new THREE.Group();
viewmodel.scale.setScalar(0.8);
camera.add(viewmodel);
// soft fill so the gun reads even in dark corners
const vmFill = new THREE.PointLight(0xc8c0ff, 1.2, 2, 1);
vmFill.position.set(-0.3, 0.4, 0.2);
vmFill.layers.set(VM_LAYER); // lights the gun only
camera.add(vmFill);

function makeWeapon(def: Omit<Weapon, 'mag' | 'reserve' | 'model' | 'muzzle' | 'flash'>): Weapon {
  const parts = buildGun(def.id);
  viewmodel.add(parts.model);
  return { ...def, mag: def.magSize, reserve: def.reserveMax / 2, ...parts };
}

const weapons: Weapon[] = [
  makeWeapon({ id: 'rifle', name: 'RIFLE', damage: 24, rate: 10, magSize: 30, reserveMax: 300, reloadTime: 1.6, spread: 0.014, pellets: 1, auto: true, pierce: false, range: 120, kick: 0.35, recoil: 0.009, shake: 0.05, tracer: 0x9ff7ff, tracerW: 0.012, tracerLife: 0.06, pickupAmmo: 60, sound: sfx.rifle }),
  makeWeapon({ id: 'shotgun', name: 'SCATTER', damage: 15, rate: 1.4, magSize: 6, reserveMax: 48, reloadTime: 2.0, spread: 0.075, pellets: 9, auto: false, pierce: false, range: 45, kick: 1, recoil: 0.05, shake: 0.28, tracer: 0xffc070, tracerW: 0.01, tracerLife: 0.07, pickupAmmo: 10, sound: sfx.shotgun }),
  makeWeapon({ id: 'rail', name: 'RAIL', damage: 160, rate: 0.85, magSize: 4, reserveMax: 24, reloadTime: 2.3, spread: 0.0, pellets: 1, auto: false, pierce: true, range: 160, kick: 1.2, recoil: 0.06, shake: 0.35, tracer: 0xff2e88, tracerW: 0.045, tracerLife: 0.45, pickupAmmo: 4, sound: sfx.rail }),
];
let cur = 0;

// ============================================================================
// game state
// ============================================================================
type State = 'menu' | 'playing' | 'paused' | 'over';
let state: State = 'menu';
let locked = false;
let time = 0;

const player = {
  pos: new THREE.Vector3(0, 0, 14),
  vel: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  onGround: true,
  hp: 100,
  maxHp: 100,
  lastHurt: -10,
};

const mobs: Mob[] = [];
let wave = 0;
let toSpawn: MobType[] = [];
let spawnTimer = 0;
let inBreak = true;
let breakTimer = 0;
let score = 0;
let kills = 0;
let headshots = 0;
let shotsFired = 0;
let shotsHit = 0;
let combo = 0;
let comboT = 0;

// FX state
let lastShot = -10;
let reloadT = 0;
let switchT = 0;
let autoReloadT = -1;
let kick = 0;
let shake = 0;
let flashT = 0;
let hurtFlash = 0;
let bobT = 0;
let aimT = 0;
let fovKick = 0;
const sway = new THREE.Vector2();
let landDip = 0;

// ============================================================================
// input
// ============================================================================
const keys = new Set<string>();
let mouseDown = false;
let aimDown = false;

addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (state !== 'playing') return;
  if (e.code === 'Digit1') selectWeapon(0);
  if (e.code === 'Digit2') selectWeapon(1);
  if (e.code === 'Digit3') selectWeapon(2);
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyQ') selectWeapon((cur + weapons.length - 1) % weapons.length);
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouseDown = false; aimDown = false; });
addEventListener('mousemove', (e) => {
  if (!locked || state !== 'playing') return;
  const s = SENS * (1 - aimT * 0.45);
  player.yaw -= e.movementX * s;
  player.pitch -= e.movementY * s;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch));
  sway.x = THREE.MathUtils.clamp(sway.x - e.movementX * 0.00035, -0.05, 0.05);
  sway.y = THREE.MathUtils.clamp(sway.y + e.movementY * 0.00035, -0.05, 0.05);
});
addEventListener('mousedown', (e) => {
  if (state !== 'playing' || !locked) return;
  if (e.button === 0) { mouseDown = true; tryFire(true); }
  if (e.button === 2) aimDown = true;
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseDown = false;
  if (e.button === 2) aimDown = false;
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => {
  if (state !== 'playing') return;
  selectWeapon((cur + (e.deltaY > 0 ? 1 : weapons.length - 1)) % weapons.length);
}, { passive: true });

function lock(): void {
  try {
    const p = renderer.domElement.requestPointerLock() as unknown;
    if (p instanceof Promise) p.catch(() => { /* user gesture too soon, they can click again */ });
  } catch { /* ignore */ }
}
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  if (!locked && state === 'playing') setState('paused');
  else if (locked && state === 'paused') setState('playing');
});

$('play').addEventListener('click', () => { initAudio(); resetGame(); setState('playing'); lock(); });
$('retry').addEventListener('click', () => { initAudio(); resetGame(); setState('playing'); lock(); });
$('resume').addEventListener('click', () => lock());
renderer.domElement.addEventListener('click', () => { if (state === 'playing' && !locked) lock(); });

function setState(s: State): void {
  state = s;
  ui.menu.classList.toggle('hidden', s !== 'menu');
  ui.pause.classList.toggle('hidden', s !== 'paused');
  ui.over.classList.toggle('hidden', s !== 'over');
  ui.hud.classList.toggle('hidden', s === 'menu');
  if (s !== 'playing') { mouseDown = false; aimDown = false; keys.clear(); }
}

// ============================================================================
// collision helpers
// ============================================================================
const clamp = THREE.MathUtils.clamp;

function circlePush(p: THREE.Vector3, r: number, feetY: number, headY: number): boolean {
  let hit = false;
  for (const b of world.boxes) {
    if (feetY >= b.max.y - 0.02 || headY <= b.min.y) continue;
    const cx = clamp(p.x, b.min.x, b.max.x);
    const cz = clamp(p.z, b.min.z, b.max.z);
    const dx = p.x - cx;
    const dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      p.x += (dx / d) * (r - d);
      p.z += (dz / d) * (r - d);
    } else {
      const l = p.x - b.min.x, rr = b.max.x - p.x, n = p.z - b.min.z, f = b.max.z - p.z;
      const m = Math.min(l, rr, n, f);
      if (m === l) p.x = b.min.x - r;
      else if (m === rr) p.x = b.max.x + r;
      else if (m === n) p.z = b.min.z - r;
      else p.z = b.max.z + r;
    }
  }
  return hit;
}

function groundAt(x: number, z: number, y: number): number {
  let g = 0;
  const r = PR * 0.7;
  for (const b of world.boxes) {
    if (b.max.y > y + 0.05) continue;
    if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z) g = Math.max(g, b.max.y);
  }
  return g;
}

function pointInBoxes(p: THREE.Vector3): boolean {
  for (const b of world.boxes) {
    if (p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z) return true;
  }
  return false;
}

// ============================================================================
// FX: particles, tracers, projectiles, pickups
// ============================================================================
interface Particle { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; max: number; grav: number; size: number; }
const particleGeo = new THREE.BoxGeometry(1, 1, 1);
const particleMats = new Map<number, THREE.MeshBasicMaterial>();
const particles: Particle[] = [];
const particlePool: THREE.Mesh[] = [];

function emit(pos: THREE.Vector3, color: number, n: number, speed: number, life = 0.6, grav = 16, size = 0.08, dir?: THREE.Vector3): void {
  let mat = particleMats.get(color);
  if (!mat) particleMats.set(color, (mat = new THREE.MeshBasicMaterial({ color })));
  for (let i = 0; i < n; i++) {
    if (particles.length > 700) particles.shift()!.mesh.visible = false;
    const mesh = particlePool.pop() ?? new THREE.Mesh(particleGeo, mat);
    if (!mesh.parent) scene.add(mesh);
    mesh.material = mat;
    mesh.visible = true;
    mesh.position.copy(pos);
    const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 0.3, Math.random() * 2 - 1).normalize().multiplyScalar(speed * (0.3 + Math.random() * 0.7));
    if (dir) v.addScaledVector(dir, speed * 0.6);
    const l = life * (0.6 + Math.random() * 0.6);
    const sz = size * (0.6 + Math.random() * 0.8);
    mesh.scale.setScalar(sz);
    particles.push({ mesh, vel: v, life: l, max: l, grav, size: sz });
  }
}

function updateParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      p.mesh.visible = false;
      particlePool.push(p.mesh);
      particles.splice(i, 1);
      continue;
    }
    p.vel.y -= p.grav * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    if (p.mesh.position.y < 0.03) {
      p.mesh.position.y = 0.03;
      p.vel.set(p.vel.x * 0.4, -p.vel.y * 0.25, p.vel.z * 0.4);
    }
    p.mesh.scale.setScalar(p.size * Math.min(1, (p.life / p.max) * 1.6));
    p.mesh.rotation.x += dt * 6;
    p.mesh.rotation.y += dt * 4;
  }
}

interface Tracer { mesh: THREE.Mesh; life: number; max: number; }
const tracerGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).rotateX(Math.PI / 2);
const tracers: Tracer[] = [];
function addTracer(from: THREE.Vector3, to: THREE.Vector3, color: number, w: number, life: number): void {
  const len = from.distanceTo(to);
  if (len < 0.1) return;
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const m = new THREE.Mesh(tracerGeo, mat);
  m.position.copy(from).add(to).multiplyScalar(0.5);
  m.lookAt(to);
  m.scale.set(w, w, len);
  scene.add(m);
  tracers.push({ mesh: m, life, max: life });
}
function updateTracers(dt: number): void {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt;
    const mat = t.mesh.material as THREE.MeshBasicMaterial;
    if (t.life <= 0) {
      scene.remove(t.mesh);
      mat.dispose();
      tracers.splice(i, 1);
      continue;
    }
    mat.opacity = (t.life / t.max) * 0.9;
  }
}

interface Proj { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; dmg: number; trail: number; }
const projGeo = new THREE.SphereGeometry(0.2, 10, 8);
const projMat = new THREE.MeshBasicMaterial({ color: 0x8bffe0 });
const projs: Proj[] = [];

function fireProjectile(m: Mob): void {
  const from = m.group.position.clone();
  from.y = m.height * 0.75;
  const target = player.pos.clone();
  target.y += 1.2;
  const speed = 17;
  const t = from.distanceTo(target) / speed;
  target.addScaledVector(player.vel, t * 0.55);
  target.y += t * t * 2; // compensate for arc
  const vel = target.sub(from).normalize().multiplyScalar(speed);
  const mesh = new THREE.Mesh(projGeo, projMat);
  mesh.position.copy(from);
  scene.add(mesh);
  projs.push({ mesh, vel, life: 4, dmg: m.stats.damage, trail: 0 });
  m.attackAnim = 1;
  sfx.spit(volAt(m.group.position));
}

const chest = new THREE.Vector3();
function updateProjectiles(dt: number): void {
  chest.copy(player.pos);
  chest.y += 1.1;
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i];
    p.life -= dt;
    p.vel.y -= 4 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.trail -= dt;
    if (p.trail <= 0) { p.trail = 0.03; emit(p.mesh.position, 0x6bffd8, 1, 0.5, 0.35, 0, 0.07); }
    let done = p.life <= 0;
    if (!done && p.mesh.position.distanceTo(chest) < 0.75) {
      damagePlayer(p.dmg, p.mesh.position);
      done = true;
    }
    if (!done && (p.mesh.position.y < 0.05 || pointInBoxes(p.mesh.position))) {
      emit(p.mesh.position, 0x6bffd8, 12, 4, 0.5);
      sfx.splat(volAt(p.mesh.position));
      done = true;
    }
    if (done) {
      if (p.life > 0) emit(p.mesh.position, 0x6bffd8, 8, 3, 0.4);
      scene.remove(p.mesh);
      projs.splice(i, 1);
    }
  }
}

type PickupKind = 'health' | 'ammo';
interface Pickup { obj: THREE.Group; kind: PickupKind; life: number; t: number; }
const pickups: Pickup[] = [];
const pickupHealthMat = new THREE.MeshBasicMaterial({ color: 0x4dff7a });
const pickupAmmoMat = new THREE.MeshBasicMaterial({ color: 0xffc23d });
const pickupDarkMat = new THREE.MeshStandardMaterial({ color: 0x1a1822, metalness: 0.6, roughness: 0.4 });
const pickupRing = new THREE.RingGeometry(0.45, 0.55, 24);

function dropPickup(pos: THREE.Vector3, kind: PickupKind): void {
  const g = new THREE.Group();
  if (kind === 'health') {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.16), pickupHealthMat));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), pickupHealthMat));
  } else {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.3, 0.3), pickupDarkMat));
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.08, 0.31), pickupAmmoMat);
    g.add(stripe);
  }
  const ring = new THREE.Mesh(pickupRing, kind === 'health' ? pickupHealthMat : pickupAmmoMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.55;
  g.add(ring);
  g.position.set(pos.x + (Math.random() - 0.5) * 0.8, 0.6, pos.z + (Math.random() - 0.5) * 0.8);
  // never inside cover
  if (pointInBoxes(g.position)) g.position.y = groundAt(g.position.x, g.position.z, 20) + 0.6;
  scene.add(g);
  pickups.push({ obj: g, kind, life: 22, t: Math.random() * 6 });
}

function updatePickups(dt: number): void {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.life -= dt;
    p.t += dt;
    p.obj.children[0].parent!.rotation.y += dt * 2;
    p.obj.children[p.obj.children.length - 1].position.y = -0.55 - Math.sin(p.t * 3) * 0.08;
    const baseY = p.obj.userData.baseY ?? (p.obj.userData.baseY = p.obj.position.y);
    p.obj.position.y = baseY + Math.sin(p.t * 3) * 0.12;
    p.obj.visible = p.life > 4 || Math.floor(p.life * 8) % 2 === 0;
    const dx = p.obj.position.x - player.pos.x;
    const dz = p.obj.position.z - player.pos.z;
    const dy = p.obj.position.y - (player.pos.y + 0.6);
    let take = false;
    if (dx * dx + dz * dz < 1.6 && Math.abs(dy) < 1.6) {
      if (p.kind === 'health' && player.hp < player.maxHp) {
        player.hp = Math.min(player.maxHp, player.hp + 30);
        feed('+30 VITALS', '#4dff7a');
        take = true;
      } else if (p.kind === 'ammo') {
        for (const w of weapons) w.reserve = Math.min(w.reserveMax, w.reserve + w.pickupAmmo);
        feed('+AMMO', '#ffc23d');
        take = true;
      }
    }
    if (take) {
      sfx.pickup();
      emit(p.obj.position, p.kind === 'health' ? 0x4dff7a : 0xffc23d, 14, 3, 0.5, 4);
    }
    if (take || p.life <= 0) {
      scene.remove(p.obj);
      p.obj.traverse((o) => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry !== pickupRing) (o as THREE.Mesh).geometry.dispose(); });
      pickups.splice(i, 1);
    }
  }
}

// ============================================================================
// HUD helpers
// ============================================================================
function feed(text: string, color = '#b6ff3b', html = false): void {
  const d = document.createElement('div');
  if (html) d.innerHTML = text;
  else d.textContent = text;
  d.style.setProperty('--c', color);
  ui.feed.prepend(d);
  while (ui.feed.children.length > 6) ui.feed.lastChild!.remove();
  setTimeout(() => d.remove(), 2400);
}

let bannerTimer = 0;
function banner(big: string, small: string, dur = 2.4): void {
  (ui.banner.querySelector('.big') as HTMLElement).textContent = big;
  (ui.banner.querySelector('.small') as HTMLElement).textContent = small;
  ui.banner.classList.add('show');
  bannerTimer = dur;
}

function hitmarker(kind: 'hit' | 'head' | 'kill'): void {
  ui.hit.className = '';
  void ui.hit.offsetWidth;
  ui.hit.className = `show ${kind === 'hit' ? '' : kind}`;
}

function damageIndicator(from: THREE.Vector3): void {
  const a = Math.atan2(from.x - player.pos.x, from.z - player.pos.z);
  const rel = a - (player.yaw + Math.PI);
  const d = document.createElement('div');
  d.className = 'arc';
  d.style.transform = `rotate(${-rel}rad)`;
  ui.dmgind.appendChild(d);
  setTimeout(() => d.remove(), 1000);
}

const hudCache: Record<string, string> = {};
function setText(el: HTMLElement, key: string, v: string): void {
  if (hudCache[key] !== v) { hudCache[key] = v; el.textContent = v; }
}

function updateHud(): void {
  const w = weapons[cur];
  const hpPct = Math.max(0, player.hp / player.maxHp);
  ui.hpFill.style.width = `${hpPct * 100}%`;
  ui.hpFill.classList.toggle('low', hpPct < 0.3);
  ui.lowhp.style.opacity = hpPct < 0.3 ? String(1 - hpPct / 0.3) : '0';
  setText(ui.hpText, 'hp', String(Math.ceil(Math.max(0, player.hp))));
  setText(ui.mag, 'mag', String(w.mag));
  ui.mag.classList.toggle('empty', w.mag === 0);
  setText(ui.reserve, 'res', `/ ${w.reserve}`);
  setText(ui.wave, 'wave', inBreak && wave === 0 ? 'GET READY' : `WAVE ${wave}`);
  const alive = mobs.filter((m) => !m.dead).length;
  setText(ui.mobsLeft, 'left', inBreak ? `NEXT WAVE IN ${Math.ceil(Math.max(0, breakTimer))}` : `HOSTILES ${alive + toSpawn.length}`);
  setText(ui.score, 'score', score.toLocaleString());
  setText(ui.combo, 'combo', combo > 1 && comboT > 0 ? `x${combo} COMBO` : '');
  ui.reloadBar.style.width = reloadT > 0 ? `${(1 - reloadT / w.reloadTime) * 100}%` : '0';
  ui.slots.forEach((s, i) => s.classList.toggle('active', i === cur));
  ui.vignette.style.opacity = String(Math.min(1, hurtFlash));
  const moving = Math.hypot(player.vel.x, player.vel.z);
  const gap = 6 + moving * 0.8 + kick * 14 + (player.onGround ? 0 : 8) - aimT * 4 + weapons[cur].spread * 120;
  ui.crosshair.style.setProperty('--gap', `${Math.max(3, gap)}px`);
}

// ============================================================================
// combat
// ============================================================================
const raycaster = new THREE.Raycaster();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

function volAt(p: THREE.Vector3): number {
  const d = p.distanceTo(player.pos);
  return Math.max(0, 1 - d / 40);
}

function mobTargets(): THREE.Object3D[] {
  const t: THREE.Object3D[] = world.solids.slice();
  for (const m of mobs) if (!m.dead) for (const h of m.hitMeshes) t.push(h);
  return t;
}

function selectWeapon(i: number): void {
  if (i === cur || state !== 'playing') return;
  cur = i;
  reloadT = 0;
  autoReloadT = -1;
  switchT = 0.32;
  sfx.swap();
  weapons.forEach((w, k) => (w.model.visible = k === cur));
}

function startReload(): void {
  const w = weapons[cur];
  if (reloadT > 0 || switchT > 0 || w.mag === w.magSize || w.reserve <= 0) return;
  reloadT = w.reloadTime;
  sfx.reload();
}

function finishReload(): void {
  const w = weapons[cur];
  const need = w.magSize - w.mag;
  const take = Math.min(need, w.reserve);
  w.mag += take;
  w.reserve -= take;
}

function tryFire(clicked: boolean): void {
  const w = weapons[cur];
  if (switchT > 0) return;
  if (!w.auto && !clicked) return;
  if (time - lastShot < 1 / w.rate) return;
  if (w.mag <= 0) {
    if (clicked) sfx.empty();
    if (reloadT <= 0) startReload();
    return;
  }
  if (reloadT > 0) {
    // shotgun can interrupt reload by firing
    if (w.id !== 'shotgun' || w.mag === 0) return;
    reloadT = 0;
  }
  lastShot = time;
  w.mag--;
  shotsFired++;
  w.sound();

  const origin = camera.getWorldPosition(new THREE.Vector3());
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const muzzleWorld = w.muzzle.getWorldPosition(new THREE.Vector3());
  const moving = Math.hypot(player.vel.x, player.vel.z) > 1;
  const spreadMul = (moving ? 1.5 : 1) * (player.onGround ? 1 : 2) * (1 - aimT * 0.6);
  const targets = mobTargets();
  let anyHit = false;

  for (let p = 0; p < w.pellets; p++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * w.spread * spreadMul;
    const dir = fwd.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    raycaster.set(origin, dir);
    raycaster.far = w.range;
    const hits = raycaster.intersectObjects(targets, false);
    const end = origin.clone().addScaledVector(dir, w.range);
    const hitMobs = new Set<Mob>();
    for (const h of hits) {
      const m = h.object.userData.mob as Mob | undefined;
      if (m) {
        if (m.dead || hitMobs.has(m)) continue;
        hitMobs.add(m);
        anyHit = true;
        const head = h.object.userData.head === true;
        const falloff = w.id === 'shotgun' ? clamp(1.3 - h.distance / 25, 0.35, 1) : 1;
        damageMob(m, w.damage * falloff * (head ? 2 : 1), head, h.point, dir);
        if (!w.pierce) { end.copy(h.point); break; }
      } else {
        end.copy(h.point);
        const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : tmpV.set(0, 1, 0);
        emit(h.point, 0xffe0a0, w.id === 'rail' ? 18 : 4, 4, 0.3, 14, 0.05, n);
        emit(h.point, 0x3a3546, 3, 2, 0.6, 14, 0.07, n);
        break;
      }
    }
    addTracer(muzzleWorld, end, w.tracer, w.tracerW, w.tracerLife);
  }
  if (anyHit) shotsHit++;

  kick = Math.min(1.6, kick + w.kick);
  player.pitch = Math.min(1.5, player.pitch + w.recoil * (1 - aimT * 0.4));
  player.yaw += (Math.random() - 0.5) * w.recoil * 0.5;
  shake = Math.min(0.6, shake + w.shake);
  fovKick = Math.min(4, fovKick + w.shake * 6);
  flashT = 0.05;
  muzzleLight.intensity = w.id === 'rail' ? 40 : 28;
  muzzleLight.color.setHex(w.id === 'rail' ? 0xff2e88 : 0xffb060);
  if (w.mag === 0 && w.reserve > 0) autoReloadT = 0.3;
}

function damageMob(m: Mob, dmg: number, head: boolean, point: THREE.Vector3, dir: THREE.Vector3): void {
  m.hp -= dmg;
  m.hitFlash = 0.08;
  const kb = (dmg * 0.05) / (m.stats.scale * m.stats.scale);
  m.vel.x += dir.x * kb;
  m.vel.z += dir.z * kb;
  emit(point, m.stats.blood, head ? 12 : 5, head ? 5 : 3.5, 0.6, 16, 0.08, dir);
  if (m.hp <= 0) {
    killMob(m, head, dir);
    hitmarker('kill');
  } else {
    hitmarker(head ? 'head' : 'hit');
    if (head) sfx.head(); else sfx.hit();
    m.updateHpBar();
  }
}

function killMob(m: Mob, head: boolean, dir: THREE.Vector3): void {
  m.dead = true;
  m.deathT = 0;
  m.updateHpBar();
  kills++;
  if (head) headshots++;
  combo = comboT > 0 ? Math.min(8, combo + 1) : 1;
  comboT = 2.6;
  if (combo > 1) { ui.combo.classList.remove('bump'); void ui.combo.offsetWidth; ui.combo.classList.add('bump'); }
  const gained = Math.round(m.stats.score * combo * (head ? 1.5 : 1));
  score += gained;
  const c = '#' + m.stats.eye.toString(16).padStart(6, '0');
  feed(`${m.stats.name}${head ? ' <em>HEADSHOT</em>' : ''} +${gained}`, c, true);
  sfx.kill();
  const center = m.group.position.clone();
  center.y = m.height * 0.6;
  emit(center, m.stats.blood, 26 + Math.round(m.stats.scale * 14), 6, 0.9, 16, 0.11, dir);
  emit(center, m.stats.dark, 10, 4, 0.9, 16, 0.14);
  m.vel.addScaledVector(dir, 3);

  // drops
  const r = Math.random();
  if (m.type === 'brute') { dropPickup(m.group.position, 'health'); dropPickup(m.group.position, 'ammo'); }
  else if (r < 0.13) dropPickup(m.group.position, 'health');
  else if (r < 0.32) dropPickup(m.group.position, 'ammo');
}

function damagePlayer(d: number, from: THREE.Vector3): void {
  if (state !== 'playing') return;
  player.hp -= d;
  player.lastHurt = time;
  hurtFlash = Math.min(1, hurtFlash + 0.5 + d / 40);
  shake = Math.min(0.8, shake + 0.2 + d / 60);
  sfx.hurt();
  damageIndicator(from);
  if (player.hp <= 0) gameOver();
}

// ============================================================================
// waves
// ============================================================================
function startWave(): void {
  wave++;
  inBreak = false;
  toSpawn = [];
  const n = 6 + wave * 3;
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    let t: MobType = 'grunt';
    if (wave >= 4 && r < 0.05 + wave * 0.008) t = 'brute';
    else if (wave >= 3 && r < 0.26) t = 'spitter';
    else if (wave >= 2 && r < 0.52) t = 'runner';
    toSpawn.push(t);
  }
  if (wave % 5 === 0) for (let i = 0; i < wave / 5 + 1; i++) toSpawn.push('brute');
  toSpawn.sort(() => Math.random() - 0.5);
  spawnTimer = 0.5;
  banner(`WAVE ${wave}`, wave % 5 === 0 ? 'BRUTE SURGE INCOMING' : `${toSpawn.length} HOSTILES`);
  sfx.wave();
}

function spawnMob(type: MobType): void {
  const pts = world.spawnPoints
    .filter((p) => p.distanceTo(player.pos) > 16)
    .sort(() => Math.random() - 0.5);
  const sp = pts[0] ?? world.spawnPoints[Math.floor(Math.random() * world.spawnPoints.length)];
  const m = new Mob(type, wave);
  m.group.position.set(sp.x + (Math.random() - 0.5) * 1.5, 0, sp.z + (Math.random() - 0.5) * 1.5);
  m.group.rotation.y = Math.atan2(-sp.x, -sp.z);
  scene.add(m.group);
  mobs.push(m);
  emit(new THREE.Vector3(m.group.position.x, 0.2, m.group.position.z), 0xff1e3c, 16, 4, 0.7, 6);
}

function updateWaves(dt: number): void {
  if (inBreak) {
    breakTimer -= dt;
    if (breakTimer <= 0) startWave();
    return;
  }
  spawnTimer -= dt;
  const alive = mobs.filter((m) => !m.dead).length;
  if (toSpawn.length && spawnTimer <= 0 && alive < MAX_ALIVE) {
    spawnMob(toSpawn.pop()!);
    spawnTimer = Math.max(0.28, 1.25 - wave * 0.08) * (0.6 + Math.random() * 0.8);
  }
  if (!toSpawn.length && alive === 0) {
    inBreak = true;
    breakTimer = 7;
    const bonus = wave * 250;
    score += bonus;
    player.hp = Math.min(player.maxHp, player.hp + 25);
    banner('WAVE CLEARED', `+${bonus} BONUS  ·  +25 VITALS`);
    sfx.clear();
  }
}

// ============================================================================
// mob AI
// ============================================================================
const losRay = new THREE.Raycaster();
function hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
  const dir = tmpV2.copy(to).sub(from);
  const dist = dir.length();
  losRay.set(from, dir.normalize());
  losRay.far = dist;
  return losRay.intersectObjects(world.solids, false).length === 0;
}

function angleLerp(a: number, b: number, t: number): number {
  let d = b - a;
  d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}

function updateMobs(dt: number): void {
  const desired = new THREE.Vector3();
  for (let i = mobs.length - 1; i >= 0; i--) {
    const m = mobs[i];
    const pos = m.group.position;

    if (m.dead) {
      m.deathT += dt;
      m.vel.multiplyScalar(Math.exp(-4 * dt));
      pos.addScaledVector(m.vel, dt);
      m.rig.rotation.x = -Math.min(1, m.deathT * 3.5) * Math.PI / 2;
      m.rig.position.y = Math.min(1, m.deathT * 3.5) * 0.25 * m.stats.scale;
      if (m.deathT > 1.2) pos.y = -(m.deathT - 1.2) * 1.2;
      if (m.deathT > 2.6) {
        scene.remove(m.group);
        m.dispose();
        mobs.splice(i, 1);
      }
      continue;
    }

    if (m.spawnT < 1) {
      m.spawnT = Math.min(1, m.spawnT + dt * 1.3);
      pos.y = (m.spawnT - 1) * m.height;
      m.vel.set(0, 0, 0);
      m.animate(dt);
      continue;
    }
    pos.y = 0;

    const dx = player.pos.x - pos.x;
    const dz = player.pos.z - pos.z;
    const dist = Math.max(0.001, Math.hypot(dx, dz));
    desired.set(dx / dist, 0, dz / dist);
    let speed = m.speed;

    if (m.type === 'spitter') {
      if (dist < 9) desired.negate();
      else if (dist < 18) { desired.set((-dz / dist) * m.side, 0, (dx / dist) * m.side); speed *= 0.55; }
    }
    if (m.attackAnim > 0.2) speed *= 0.35;

    // obstacle avoidance: probe ahead, steer around
    const probeX = pos.x + desired.x * (m.radius + 1.3);
    const probeZ = pos.z + desired.z * (m.radius + 1.3);
    for (const b of world.boxes) {
      if (b.max.y < 0.5) continue;
      if (probeX > b.min.x - m.radius && probeX < b.max.x + m.radius && probeZ > b.min.z - m.radius && probeZ < b.max.z + m.radius) {
        desired.set(desired.x - desired.z * m.side * 1.6, 0, desired.z + desired.x * m.side * 1.6).normalize();
        break;
      }
    }

    // separation
    let sx = 0, sz = 0;
    for (const o of mobs) {
      if (o === m || o.dead || o.spawnT < 1) continue;
      const ox = pos.x - o.group.position.x;
      const oz = pos.z - o.group.position.z;
      const rr = m.radius + o.radius + 0.25;
      const d2 = ox * ox + oz * oz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        sx += (ox / d) * (rr - d);
        sz += (oz / d) * (rr - d);
      }
    }

    const k = 1 - Math.exp(-7 * dt);
    m.vel.x += (desired.x * speed + sx * 4 - m.vel.x) * k;
    m.vel.z += (desired.z * speed + sz * 4 - m.vel.z) * k;
    pos.x += m.vel.x * dt;
    pos.z += m.vel.z * dt;
    circlePush(pos, m.radius, 0, m.height);
    // don't overlap player
    const pdx = pos.x - player.pos.x, pdz = pos.z - player.pos.z;
    const pd = Math.hypot(pdx, pdz);
    const minD = m.radius + PR;
    if (pd < minD && pd > 1e-4 && player.pos.y < m.height) {
      pos.x = player.pos.x + (pdx / pd) * minD;
      pos.z = player.pos.z + (pdz / pd) * minD;
    }
    pos.x = clamp(pos.x, -ARENA + m.radius, ARENA - m.radius);
    pos.z = clamp(pos.z, -ARENA + m.radius, ARENA - m.radius);

    m.group.rotation.y = angleLerp(m.group.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 8));

    // melee
    m.attackCd -= dt;
    const reach = m.radius + PR + m.stats.reach * 0.6;
    const vertOk = player.pos.y < m.height + 0.4;
    if (m.type !== 'spitter' || dist < 2.5) {
      if (dist < reach && vertOk && m.attackCd <= 0 && m.pendingHit < 0) {
        m.attackCd = 1 / m.stats.attackRate;
        m.attackAnim = 1;
        m.pendingHit = 0.22;
        sfx.swing(volAt(pos));
      }
    }
    if (m.pendingHit >= 0) {
      m.pendingHit -= dt;
      if (m.pendingHit < 0) {
        const d2 = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
        if (d2 < reach + 0.35 && player.pos.y < m.height + 0.4) damagePlayer(m.stats.damage, pos);
      }
    }

    // ranged
    if (m.type === 'spitter') {
      m.shootCd -= dt;
      if (m.shootCd <= 0 && dist < 30 && dist > 3) {
        const from = tmpV.copy(pos);
        from.y = m.height * 0.8;
        const to = player.pos.clone();
        to.y += 1.2;
        if (hasLineOfSight(from, to)) {
          fireProjectile(m);
          m.shootCd = 2.2 + Math.random() * 1.6 - Math.min(0.8, wave * 0.05);
        } else {
          m.shootCd = 0.4;
        }
      }
    }

    // ambient growls
    m.growlCd -= dt;
    if (m.growlCd <= 0) {
      m.growlCd = 4 + Math.random() * 8;
      const v = volAt(pos);
      if (v > 0.2) sfx.growl(v * (m.type === 'brute' ? 1.4 : 1));
    }

    m.animate(dt);
  }

  // billboard hp bars
  const q = new THREE.Quaternion();
  for (const m of mobs) {
    if (!m.hpBar.visible) continue;
    q.copy(m.group.quaternion).invert().multiply(camera.quaternion);
    m.hpBar.quaternion.copy(q);
  }
}

// ============================================================================
// player
// ============================================================================
const fwd = new THREE.Vector3();
const rgt = new THREE.Vector3();
const wish = new THREE.Vector3();

function updatePlayer(dt: number): void {
  fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  rgt.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  wish.set(0, 0, 0);
  if (keys.has('KeyW') || keys.has('ArrowUp')) wish.add(fwd);
  if (keys.has('KeyS') || keys.has('ArrowDown')) wish.sub(fwd);
  if (keys.has('KeyD') || keys.has('ArrowRight')) wish.add(rgt);
  if (keys.has('KeyA') || keys.has('ArrowLeft')) wish.sub(rgt);
  if (wish.lengthSq() > 0) wish.normalize();

  const sprinting = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && keys.has('KeyW') && aimT < 0.5;
  const speed = (sprinting ? SPRINT : WALK) * (1 - aimT * 0.4);
  const k = 1 - Math.exp(-(player.onGround ? 14 : 2.5) * dt);
  player.vel.x += (wish.x * speed - player.vel.x) * k;
  player.vel.z += (wish.z * speed - player.vel.z) * k;

  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  circlePush(player.pos, PR, player.pos.y, player.pos.y + 1.8);

  if (keys.has('Space') && player.onGround) {
    player.vel.y = JUMP;
    player.onGround = false;
    sfx.jump();
  }
  player.vel.y -= GRAVITY * dt;
  const prevY = player.pos.y;
  player.pos.y += player.vel.y * dt;
  const g = groundAt(player.pos.x, player.pos.z, prevY);
  if (player.pos.y <= g) {
    if (!player.onGround && player.vel.y < -6) { landDip = Math.min(0.15, -player.vel.y * 0.012); sfx.land(); }
    player.pos.y = g;
    player.vel.y = 0;
    player.onGround = true;
  } else {
    player.onGround = false;
  }

  const hs = Math.hypot(player.vel.x, player.vel.z);
  if (player.onGround) bobT += dt * hs * 1.25;

  // camera
  const targetFov = BASE_FOV + (sprinting && hs > 7 ? 8 : 0) - aimT * 22 + fovKick;
  camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-12 * dt));
  camera.updateProjectionMatrix();
  const bob = player.onGround ? Math.sin(bobT * 2) * 0.045 * Math.min(1, hs / WALK) : 0;
  landDip *= Math.exp(-10 * dt);
  camera.position.set(player.pos.x, player.pos.y + EYE + bob - landDip, player.pos.z);
  const sh = shake * shake;
  camera.rotation.set(
    player.pitch + kick * 0.02 + (Math.random() - 0.5) * sh * 0.08,
    player.yaw + (Math.random() - 0.5) * sh * 0.08,
    Math.sin(bobT) * 0.004 * hs - player.vel.x * 0,
  );
}

function updateViewmodel(dt: number): void {
  const hs = Math.hypot(player.vel.x, player.vel.z);
  const w = weapons[cur];
  sway.multiplyScalar(Math.exp(-8 * dt));
  kick *= Math.exp(-11 * dt);
  const swY = switchT > 0 ? Math.sin((switchT / 0.32) * Math.PI) * 0.35 : 0;
  const rl = reloadT > 0 ? Math.sin((1 - reloadT / w.reloadTime) * Math.PI) : 0;
  const bx = player.onGround ? Math.cos(bobT) * 0.012 * Math.min(1, hs / WALK) : 0;
  const by = player.onGround ? Math.abs(Math.sin(bobT)) * 0.014 * Math.min(1, hs / WALK) : 0.01;
  const hip = new THREE.Vector3(0.21, -0.19, -0.4);
  const ads = new THREE.Vector3(0, -0.126 + (w.id === 'rail' ? -0.016 : 0), -0.3);
  const p = hip.lerp(ads, aimT);
  viewmodel.position.set(p.x + sway.x + bx * (1 - aimT), p.y - sway.y + by * (1 - aimT) - swY - rl * 0.12 - landDip * 0.5, p.z + kick * 0.07);
  viewmodel.rotation.set(kick * 0.12 + rl * 0.5 + sway.y * 2, sway.x * 2, rl * -0.6 + sway.x * 1.5);

  flashT -= dt;
  w.flash.visible = flashT > 0;
  if (w.flash.visible) w.flash.rotation.z = Math.random() * Math.PI;
  muzzleLight.intensity *= Math.exp(-30 * dt);
}

// ============================================================================
// lifecycle
// ============================================================================
function clearEntities(): void {
  for (const m of mobs) { scene.remove(m.group); m.dispose(); }
  mobs.length = 0;
  for (const p of projs) scene.remove(p.mesh);
  projs.length = 0;
  for (const p of pickups) scene.remove(p.obj);
  pickups.length = 0;
  for (const t of tracers) scene.remove(t.mesh);
  tracers.length = 0;
  for (const p of particles) { p.mesh.visible = false; particlePool.push(p.mesh); }
  particles.length = 0;
}

function resetGame(): void {
  clearEntities();

  player.pos.set(0, 0, 14);
  player.vel.set(0, 0, 0);
  player.yaw = 0;
  player.pitch = 0;
  player.hp = player.maxHp;
  player.onGround = true;
  for (const w of weapons) { w.mag = w.magSize; w.reserve = Math.floor(w.reserveMax / 2); }
  cur = 0;
  weapons.forEach((w, k) => (w.model.visible = k === cur));
  wave = 0;
  toSpawn = [];
  inBreak = true;
  breakTimer = 3;
  score = kills = headshots = shotsFired = shotsHit = 0;
  combo = 0;
  comboT = 0;
  reloadT = switchT = 0;
  autoReloadT = -1;
  kick = shake = hurtFlash = fovKick = 0;
  time = 0;
  lastShot = -10;
  mouseDown = false;
  ui.feed.innerHTML = '';
  ui.dmgind.innerHTML = '';
  camera.fov = BASE_FOV;
  banner('HORDEFALL', 'SURVIVE THE WAVES', 2.6);
}

function gameOver(): void {
  setState('over');
  sfx.gameOver();
  if (document.pointerLockElement) document.exitPointerLock();
  const best = loadBest();
  const newBest = score > best;
  if (newBest) saveBest(score);
  const acc = shotsFired ? Math.round((shotsHit / shotsFired) * 100) : 0;
  const mins = Math.floor(time / 60);
  const secs = Math.floor(time % 60).toString().padStart(2, '0');
  ui.overStats.innerHTML = [
    [score.toLocaleString(), newBest ? 'NEW BEST' : 'SCORE', newBest],
    [String(wave), 'WAVE REACHED', false],
    [String(kills), 'KILLS', false],
    [String(headshots), 'HEADSHOTS', false],
    [`${acc}%`, 'ACCURACY', false],
    [`${mins}:${secs}`, 'SURVIVED', false],
  ].map(([v, l, nb]) => `<div><b class="${nb ? 'nb' : ''}">${v}</b><span>${l}</span></div>`).join('');
  showBest();
}

// ============================================================================
// main loop
// ============================================================================
const clock = new THREE.Clock();
let wallT = 0;
let menuAngle = 0;

function update(dt: number): void {
  time += dt;
  aimT += ((aimDown && reloadT <= 0 && switchT <= 0 ? 1 : 0) - aimT) * (1 - Math.exp(-14 * dt));

  updatePlayer(dt);

  if (switchT > 0) switchT -= dt;
  if (reloadT > 0) {
    reloadT -= dt;
    if (reloadT <= 0) { reloadT = 0; finishReload(); }
  }
  if (autoReloadT >= 0) {
    autoReloadT -= dt;
    if (autoReloadT < 0) startReload();
  }
  if (mouseDown && locked) tryFire(false);

  updateWaves(dt);
  updateMobs(dt);
  updateProjectiles(dt);
  updatePickups(dt);

  comboT -= dt;
  if (comboT <= 0) combo = 0;
  shake *= Math.exp(-7 * dt);
  hurtFlash *= Math.exp(-3 * dt);
  fovKick *= Math.exp(-10 * dt);
  if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) ui.banner.classList.remove('show'); }
}

function render(): void {
  renderer.clear();
  camera.layers.set(0);
  renderer.render(scene, camera);
  if (state !== 'menu') {
    renderer.clearDepth();
    camera.layers.set(VM_LAYER);
    renderer.render(scene, camera);
  }
  camera.layers.set(0);
}

function frame(): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  wallT += dt;

  if (state === 'playing') {
    update(dt);
    updateViewmodel(dt);
    updateHud();
  } else if (state === 'menu') {
    menuAngle += dt * 0.08;
    camera.position.set(Math.cos(menuAngle) * 26, 9 + Math.sin(menuAngle * 2) * 1.5, Math.sin(menuAngle) * 26);
    camera.lookAt(0, 1.5, 0);
    menuDemo(dt);
  }
  // particles/tracers keep settling on pause screens for a nicer freeze-frame
  if (state === 'playing' || state === 'menu') { updateParticles(dt); updateTracers(dt); }
  world.update(wallT);
  render();
}

// a few idle mobs shamble around on the title screen
let demoInit = false;
function menuDemo(dt: number): void {
  if (!demoInit) {
    demoInit = true;
    const types: MobType[] = ['grunt', 'runner', 'brute', 'spitter', 'grunt', 'grunt'];
    types.forEach((t, i) => {
      const m = new Mob(t, 1);
      const a = (i / types.length) * Math.PI * 2;
      m.group.position.set(Math.cos(a) * 10, 0, Math.sin(a) * 10);
      m.spawnT = 1;
      m.side = a;
      scene.add(m.group);
      mobs.push(m);
    });
  }
  for (const m of mobs) {
    m.side += dt * (0.12 + m.speed * 0.02);
    const r = 10 + Math.sin(m.side * 3) * 1.5;
    const nx = Math.cos(m.side) * r;
    const nz = Math.sin(m.side) * r;
    m.vel.set((nx - m.group.position.x) / dt, 0, (nz - m.group.position.z) / dt).clampLength(0, m.speed * 0.5);
    m.group.rotation.y = Math.atan2(m.vel.x, m.vel.z);
    m.group.position.set(nx, 0, nz);
    m.animate(dt);
  }
}

// expose a tiny hook for automated smoke tests
(window as unknown as Record<string, unknown>).__hordefall = {
  get state() { return state; },
  get mobs() { return mobs.length; },
  get wave() { return wave; },
  get score() { return score; },
  get hp() { return player.hp; },
  start: () => { resetGame(); setState('playing'); locked = true; },
  fire: () => tryFire(true),
  step: (n: number) => { for (let i = 0; i < n && state === 'playing'; i++) { update(1 / 60); updateParticles(1 / 60); updateTracers(1 / 60); } },
  setHp: (v: number) => { player.hp = v; },
  aimAt: (x: number, y: number, z: number) => {
    const d = new THREE.Vector3(x, y, z).sub(camera.position);
    player.yaw = Math.atan2(-d.x, -d.z);
    player.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  },
  nearestMob: () => {
    const m = mobs.filter((x) => !x.dead && x.spawnT >= 1).sort((a, b) => a.group.position.distanceTo(player.pos) - b.group.position.distanceTo(player.pos))[0];
    return m ? { x: m.group.position.x, y: m.height * 0.55, z: m.group.position.z } : null;
  },
};

frame();
