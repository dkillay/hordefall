import * as THREE from 'three';

export interface Box {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export interface World {
  boxes: Box[];
  solids: THREE.Object3D[];
  spawnPoints: THREE.Vector3[];
  update(t: number): void;
}

/** Half-size of the playable arena. */
export const ARENA = 34;

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D) => void, repeat = 1): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function floorTexture(): THREE.CanvasTexture {
  return canvasTex(256, (g) => {
    g.fillStyle = '#15131d';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2200; i++) {
      const v = (16 + Math.random() * 16) | 0;
      g.fillStyle = `rgb(${v},${v - 2},${v + 8})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    // stains
    for (let i = 0; i < 5; i++) {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 40);
      gr.addColorStop(0, 'rgba(0,0,0,0.35)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.save();
      g.translate(Math.random() * 256, Math.random() * 256);
      g.fillStyle = gr;
      g.fillRect(-40, -40, 80, 80);
      g.restore();
    }
    g.strokeStyle = '#2d2942';
    g.lineWidth = 4;
    g.strokeRect(0, 0, 256, 256);
    g.strokeStyle = '#1e1b2c';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(128, 0); g.lineTo(128, 256);
    g.moveTo(0, 128); g.lineTo(256, 128);
    g.stroke();
  }, ARENA / 2);
}

function crateTexture(): THREE.CanvasTexture {
  return canvasTex(128, (g) => {
    g.fillStyle = '#2b2733';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 600; i++) {
      const v = (34 + Math.random() * 18) | 0;
      g.fillStyle = `rgb(${v},${v - 4},${v + 6})`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    g.strokeStyle = '#4a4458';
    g.lineWidth = 8;
    g.strokeRect(4, 4, 120, 120);
    // hazard stripe band
    g.save();
    g.beginPath();
    g.rect(8, 52, 112, 24);
    g.clip();
    g.fillStyle = '#d9a514';
    g.fillRect(8, 52, 112, 24);
    g.fillStyle = '#16141c';
    for (let x = -30; x < 140; x += 18) {
      g.beginPath();
      g.moveTo(x, 76); g.lineTo(x + 9, 76); g.lineTo(x + 33, 52); g.lineTo(x + 24, 52);
      g.fill();
    }
    g.restore();
  });
}

function wallTexture(): THREE.CanvasTexture {
  return canvasTex(256, (g) => {
    g.fillStyle = '#1b1824';
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 64) {
      for (let x = 0; x < 256; x += 128) {
        const off = (y / 64) % 2 ? 64 : 0;
        g.fillStyle = `rgb(${30 + Math.random() * 8},${27 + Math.random() * 6},${40 + Math.random() * 8})`;
        g.fillRect(x + off + 3, y + 3, 122, 58);
      }
    }
    for (let i = 0; i < 900; i++) {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
    }
  });
}

export function buildWorld(scene: THREE.Scene): World {
  const boxes: Box[] = [];
  const solids: THREE.Object3D[] = [];
  const pulsers: { mat: THREE.MeshBasicMaterial; phase: number; base: number; color: THREE.Color }[] = [];

  // ---------- floor ----------
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA * 2, ARENA * 2),
    new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.82, metalness: 0.25 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  solids.push(floor);

  const addBox = (x: number, z: number, w: number, h: number, d: number, mat: THREE.Material, y0 = 0, collide = true): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y0 + h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    if (collide) {
      solids.push(m);
      boxes.push({ min: new THREE.Vector3(x - w / 2, y0, z - d / 2), max: new THREE.Vector3(x + w / 2, y0 + h, z + d / 2) });
    }
    return m;
  };

  // ---------- perimeter walls ----------
  const wallTex = wallTexture();
  wallTex.repeat.set(10, 2);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9, metalness: 0.1 });
  const W = ARENA * 2 + 4;
  addBox(0, -ARENA - 1, W, 7, 2, wallMat);
  addBox(0, ARENA + 1, W, 7, 2, wallMat);
  addBox(-ARENA - 1, 0, 2, 7, W, wallMat);
  addBox(ARENA + 1, 0, 2, 7, W, wallMat);

  // neon trim along wall tops
  const trimA = new THREE.MeshBasicMaterial({ color: 0xff2e88 });
  const trimB = new THREE.MeshBasicMaterial({ color: 0x3df2ff });
  addBox(0, -ARENA + 0.02, ARENA * 2, 0.12, 0.08, trimA, 6.4, false);
  addBox(0, ARENA - 0.02, ARENA * 2, 0.12, 0.08, trimA, 6.4, false);
  addBox(-ARENA + 0.02, 0, 0.08, 0.12, ARENA * 2, trimB, 6.4, false);
  addBox(ARENA - 0.02, 0, 0.08, 0.12, ARENA * 2, trimB, 6.4, false);

  // ---------- pillars ----------
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3d3850, roughness: 0.7, metalness: 0.15 });
  const pillarSpots: [number, number, number][] = [
    [-15, -15, 0xff2e88], [15, -15, 0x3df2ff], [-15, 15, 0x3df2ff], [15, 15, 0xff2e88],
    [0, -24, 0xb6ff3b], [0, 24, 0xb6ff3b], [-24, 0, 0xb6ff3b], [24, 0, 0xb6ff3b],
  ];
  pillarSpots.forEach(([x, z, c], i) => {
    addBox(x, z, 2.4, 10, 2.4, pillarMat);
    for (let k = 0; k < 2; k++) {
      const mat = new THREE.MeshBasicMaterial({ color: c });
      addBox(x, z, 2.5, 0.16, 2.5, mat, 2.4 + k * 3.6, false);
      pulsers.push({ mat, phase: i * 0.7 + k, base: 1, color: mat.color.clone() });
    }
  });

  // ---------- center platform ----------
  const platMat = new THREE.MeshStandardMaterial({ color: 0x3a344a, roughness: 0.6, metalness: 0.2 });
  addBox(0, 0, 6, 1.0, 6, platMat);
  const platGlow = new THREE.MeshBasicMaterial({ color: 0xb6ff3b });
  addBox(0, 3.02, 6, 0.08, 0.06, platGlow, 0.94, false);
  addBox(0, -3.02, 6, 0.08, 0.06, platGlow, 0.94, false);
  addBox(3.02, 0, 0.06, 0.08, 6, platGlow, 0.94, false);
  addBox(-3.02, 0, 0.06, 0.08, 6, platGlow, 0.94, false);

  // ---------- crates (cover) ----------
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.7, metalness: 0.3 });
  const crates: [number, number, number, number][] = [
    // x, z, size, stack height
    [-8, -6, 1.4, 1], [-9.4, -6, 1.4, 2], [8, 7, 1.4, 1], [9.4, 7.2, 1.4, 1],
    [6, -10, 1.4, 1], [-6, 11, 1.4, 1], [-20, -9, 1.6, 1], [20, 9, 1.6, 1],
    [-11, 20, 1.4, 1], [11, -20, 1.4, 1], [-26, 18, 1.6, 2], [26, -18, 1.6, 2],
    [18, 22, 1.4, 1], [-18, -22, 1.4, 1], [-4, -16, 1.4, 1], [4, 16, 1.4, 1],
  ];
  crates.forEach(([x, z, s, stack]) => {
    for (let k = 0; k < stack; k++) {
      const m = addBox(x, z, s, s, s, crateMat, k * s);
      m.rotation.y = 0; // keep axis-aligned to match collision
    }
  });

  // low cover walls
  const coverMat = new THREE.MeshStandardMaterial({ color: 0x3a3447, roughness: 0.75, metalness: 0.2 });
  addBox(-12, 2, 0.6, 1.2, 5, coverMat);
  addBox(12, -2, 0.6, 1.2, 5, coverMat);
  addBox(2, -28, 6, 1.2, 0.6, coverMat);
  addBox(-2, 28, 6, 1.2, 0.6, coverMat);

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0x8a7cff, 0x2a2018, 1.0));
  const moon = new THREE.DirectionalLight(0xaab4ff, 1.4);
  moon.position.set(18, 40, 12);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  const sc = moon.shadow.camera;
  sc.left = sc.bottom = -ARENA - 2;
  sc.right = sc.top = ARENA + 2;
  sc.near = 1;
  sc.far = 100;
  moon.shadow.bias = -0.0005;
  scene.add(moon);

  const neon: [number, number, number][] = [
    [-ARENA + 4, -ARENA + 4, 0xff2e88], [ARENA - 4, ARENA - 4, 0xff2e88],
    [ARENA - 4, -ARENA + 4, 0x3df2ff], [-ARENA + 4, ARENA - 4, 0x3df2ff],
  ];
  neon.forEach(([x, z, c]) => {
    const l = new THREE.PointLight(c, 90, 36, 1.6);
    l.position.set(x, 5, z);
    scene.add(l);
  });
  const centerLight = new THREE.PointLight(0xb6ff3b, 30, 18, 1.8);
  centerLight.position.set(0, 4, 0);
  scene.add(centerLight);

  // ---------- spawn gates ----------
  const spawnPoints: THREE.Vector3[] = [];
  const ringGeo = new THREE.RingGeometry(0.9, 1.25, 32);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const r = ARENA - 3.5;
    const p = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    spawnPoints.push(p);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff1e3c, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(ringGeo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(p.x, 0.03, p.z);
    scene.add(ring);
    pulsers.push({ mat, phase: i, base: 0.6, color: mat.color.clone() });
  }

  // ---------- skybox-ish backdrop: distant silhouettes + moon ----------
  const silMat = new THREE.MeshBasicMaterial({ color: 0x0d0a16 });
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 70 + Math.random() * 25;
    const h = 8 + Math.random() * 22;
    const m = new THREE.Mesh(new THREE.BoxGeometry(6 + Math.random() * 10, h, 6 + Math.random() * 10), silMat);
    m.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
    scene.add(m);
  }
  const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(9, 40), new THREE.MeshBasicMaterial({ color: 0xffd9f0, fog: false }));
  moonDisc.position.set(-50, 85, -130);
  moonDisc.lookAt(0, 0, 0);
  scene.add(moonDisc);

  return {
    boxes,
    solids,
    spawnPoints,
    update(t: number) {
      for (const p of pulsers) {
        const k = 0.6 + 0.4 * Math.sin(t * 2.2 + p.phase);
        if (p.base < 1) p.mat.opacity = p.base * k;
        else p.mat.color.copy(p.color).multiplyScalar(0.55 + 0.45 * k);
      }
    },
  };
}

