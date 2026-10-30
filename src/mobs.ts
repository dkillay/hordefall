import * as THREE from 'three';

export type MobType = 'grunt' | 'runner' | 'brute' | 'spitter';

export interface MobStats {
  name: string;
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  scale: number;
  skin: number;
  dark: number;
  eye: number;
  blood: number;
  score: number;
  attackRate: number;
  reach: number;
}

export const MOB_STATS: Record<MobType, MobStats> = {
  grunt:   { name: 'GRUNT',   hp: 70,  speed: 3.6, damage: 12, radius: 0.45, scale: 1.0,  skin: 0x6b8f3e, dark: 0x2c3a1c, eye: 0xff3b1f, blood: 0x9dff3b, score: 100, attackRate: 0.9,  reach: 1.15 },
  runner:  { name: 'RUNNER',  hp: 35,  speed: 7.4, damage: 7,  radius: 0.38, scale: 0.8,  skin: 0xc0462f, dark: 0x4a1a14, eye: 0xffe23b, blood: 0xff7a2e, score: 150, attackRate: 1.5,  reach: 1.0 },
  brute:   { name: 'BRUTE',   hp: 420, speed: 2.5, damage: 28, radius: 0.95, scale: 1.85, skin: 0x5b4a86, dark: 0x231a38, eye: 0xff2e88, blood: 0xc65bff, score: 600, attackRate: 0.55, reach: 1.8 },
  spitter: { name: 'SPITTER', hp: 50,  speed: 3.2, damage: 11, radius: 0.45, scale: 0.95, skin: 0x2f8f80, dark: 0x123a34, eye: 0x6bffd8, blood: 0x6bffd8, score: 250, attackRate: 0.8,  reach: 1.1 },
};

const geoCache = new Map<string, THREE.BufferGeometry>();
function bgeo(w: number, h: number, d: number): THREE.BufferGeometry {
  const k = `b${w},${h},${d}`;
  let g = geoCache.get(k);
  if (!g) geoCache.set(k, (g = new THREE.BoxGeometry(w, h, d)));
  return g;
}
const coneGeo = new THREE.ConeGeometry(0.09, 0.32, 6);
const sacGeo = new THREE.SphereGeometry(0.32, 14, 10);
const barGeo = new THREE.PlaneGeometry(1, 0.09);
const fillGeo = new THREE.PlaneGeometry(1, 0.09).translate(0.5, 0, 0);
const barBgMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false });

export class Mob {
  readonly type: MobType;
  readonly stats: MobStats;
  readonly group = new THREE.Group();
  readonly rig = new THREE.Group();
  readonly hitMeshes: THREE.Mesh[] = [];
  readonly hpBar = new THREE.Group();

  hp: number;
  maxHp: number;
  speed: number;
  height: number;
  vel = new THREE.Vector3();
  walkT = Math.random() * 10;
  attackCd = 0.6;
  attackAnim = 0;
  pendingHit = -1;
  hitFlash = 0;
  dead = false;
  deathT = 0;
  spawnT = 0;
  side = Math.random() < 0.5 ? -1 : 1;
  shootCd = 1.5 + Math.random() * 2;
  growlCd = 2 + Math.random() * 6;

  private readonly mats: THREE.MeshStandardMaterial[] = [];
  private readonly legL = new THREE.Group();
  private readonly legR = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly headG = new THREE.Group();
  private readonly hpFill: THREE.Mesh;
  private flashOn = false;

  constructor(type: MobType, wave: number) {
    this.type = type;
    this.stats = MOB_STATS[type];
    const s = this.stats;
    this.maxHp = this.hp = s.hp * (1 + (wave - 1) * 0.09);
    this.speed = s.speed * (1 + Math.min(0.35, (wave - 1) * 0.025)) * (0.9 + Math.random() * 0.2);
    this.height = 2.35 * s.scale;

    const skin = new THREE.MeshStandardMaterial({ color: s.skin, roughness: 0.75, metalness: 0.05, emissive: s.skin, emissiveIntensity: 0.22 });
    const dark = new THREE.MeshStandardMaterial({ color: s.dark, roughness: 0.9, emissive: s.dark, emissiveIntensity: 0.25 });
    this.mats.push(skin, dark);
    const eyeMat = new THREE.MeshBasicMaterial({ color: s.eye });

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, hit = true, head = false): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      if (hit) {
        m.userData.mob = this;
        m.userData.head = head;
        this.hitMeshes.push(m);
      }
      return m;
    };

    // legs
    this.legL.position.set(-0.18, 0.9, 0);
    this.legR.position.set(0.18, 0.9, 0);
    add(bgeo(0.24, 0.9, 0.26), dark, 0, -0.45, 0, this.legL);
    add(bgeo(0.24, 0.9, 0.26), dark, 0, -0.45, 0, this.legR);
    this.rig.add(this.legL, this.legR);

    // torso
    this.torso.position.y = 0.9;
    this.rig.add(this.torso);
    add(bgeo(0.72, 0.8, 0.42), skin, 0, 0.42, 0, this.torso);
    add(bgeo(0.62, 0.18, 0.44), dark, 0, 0.06, 0, this.torso, false); // belt

    // head
    this.headG.position.y = 0.85;
    this.torso.add(this.headG);
    add(bgeo(0.5, 0.5, 0.5), skin, 0, 0.25, 0.02, this.headG, true, true);
    add(bgeo(0.11, 0.07, 0.04), eyeMat, -0.12, 0.3, 0.28, this.headG, false);
    add(bgeo(0.11, 0.07, 0.04), eyeMat, 0.12, 0.3, 0.28, this.headG, false);
    add(bgeo(0.34, 0.07, 0.05), dark, 0, 0.1, 0.27, this.headG, false); // jaw

    // arms
    this.armL.position.set(-0.47, 0.76, 0);
    this.armR.position.set(0.47, 0.76, 0);
    add(bgeo(0.2, 0.8, 0.22), skin, 0, -0.36, 0, this.armL);
    add(bgeo(0.2, 0.8, 0.22), skin, 0, -0.36, 0, this.armR);
    add(bgeo(0.22, 0.12, 0.24), dark, 0, -0.8, 0, this.armL, false);
    add(bgeo(0.22, 0.12, 0.24), dark, 0, -0.8, 0, this.armR, false);
    this.torso.add(this.armL, this.armR);

    // type-specific dressing
    if (type === 'runner') {
      this.torso.rotation.x = 0.45;
      for (let i = 0; i < 3; i++) {
        const sp = add(coneGeo, dark, 0, 0.25 + i * 0.22, -0.24, this.torso, false);
        sp.rotation.x = -1.2;
      }
    } else if (type === 'brute') {
      this.armL.scale.set(1.6, 1.15, 1.6);
      this.armR.scale.set(1.6, 1.15, 1.6);
      add(bgeo(0.5, 0.22, 0.56), dark, -0.5, 0.82, 0, this.torso, false);
      add(bgeo(0.5, 0.22, 0.56), dark, 0.5, 0.82, 0, this.torso, false);
      const hornMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.5 });
      const h1 = add(coneGeo, hornMat, -0.2, 0.55, 0.05, this.headG, false);
      const h2 = add(coneGeo, hornMat, 0.2, 0.55, 0.05, this.headG, false);
      h1.rotation.z = 0.5;
      h2.rotation.z = -0.5;
      this.torso.rotation.x = 0.2;
    } else if (type === 'spitter') {
      const sacMat = new THREE.MeshStandardMaterial({ color: s.eye, emissive: s.eye, emissiveIntensity: 1.2, roughness: 0.3 });
      add(sacGeo, sacMat, 0, 0.55, -0.34, this.torso);
      add(bgeo(0.22, 0.08, 0.06), eyeMat, 0, 0.1, 0.28, this.headG, false); // glowing mouth
      this.headG.scale.set(1, 1.15, 1.1);
    }

    this.rig.scale.setScalar(s.scale);
    this.group.add(this.rig);

    // floating health bar
    const bg = new THREE.Mesh(barGeo, barBgMat);
    this.hpFill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: s.eye, depthWrite: false }));
    this.hpFill.position.set(-0.5, 0, 0.001);
    this.hpBar.add(bg, this.hpFill);
    this.hpBar.position.y = this.height + 0.35;
    this.hpBar.scale.setScalar(Math.max(0.8, s.scale * 0.8));
    this.hpBar.visible = false;
    this.group.add(this.hpBar);
  }

  get radius(): number {
    return this.stats.radius;
  }

  updateHpBar(): void {
    this.hpFill.scale.x = Math.max(0.001, this.hp / this.maxHp);
    this.hpBar.visible = !this.dead && this.hp < this.maxHp;
  }

  animate(dt: number): void {
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.walkT += dt * (sp * 2.4) / this.stats.scale;
    const amt = Math.min(1, sp / 2);
    const sw = Math.sin(this.walkT) * amt * 0.8;
    this.legL.rotation.x = sw;
    this.legR.rotation.x = -sw;

    const base = this.type === 'grunt' || this.type === 'brute' ? -1.25 : this.type === 'runner' ? -0.5 : -0.25;
    this.attackAnim = Math.max(0, this.attackAnim - dt * 2.4);
    const atk = Math.sin(this.attackAnim * Math.PI) * 1.5;
    this.armL.rotation.x = base - sw * 0.5 - atk;
    this.armR.rotation.x = base + sw * 0.5 - atk;
    this.armL.rotation.z = -0.1;
    this.armR.rotation.z = 0.1;
    this.rig.position.y = Math.abs(Math.sin(this.walkT)) * 0.06 * amt;
    this.headG.rotation.z = Math.sin(this.walkT * 0.5 + 1) * 0.12;
    this.headG.rotation.y = Math.sin(this.walkT * 0.31) * 0.15;

    this.hitFlash = Math.max(0, this.hitFlash - dt);
    const on = this.hitFlash > 0;
    if (on !== this.flashOn) {
      this.flashOn = on;
      this.mats.forEach((m, i) => {
        if (on) { m.emissive.setRGB(1, 1, 1); m.emissiveIntensity = 0.6; }
        else { m.emissive.setHex(i === 0 ? this.stats.skin : this.stats.dark); m.emissiveIntensity = i === 0 ? 0.22 : 0.25; }
      });
    }
  }

  dispose(): void {
    for (const m of this.mats) m.dispose();
    (this.hpFill.material as THREE.Material).dispose();
  }
}
