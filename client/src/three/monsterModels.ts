import * as THREE from 'three';
import { ENEMIES, SHINY, isBoss, type EnemyKind } from '@rpg/shared';

const mats = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const key = color + JSON.stringify(extra);
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, flatShading: true, ...extra });
    mats.set(key, m);
  }
  return m;
}

const SHINY_MAT = () => mat('#ffd34d', { metalness: 0.8, roughness: 0.25, emissive: '#b8860b', emissiveIntensity: 0.6 });

export interface MonsterModel {
  root: THREE.Group;
  /** `t` = temps global (s) */
  animate(t: number, s: { moving: boolean; action: string }): void;
  /** clignote en blanc (coup reçu) */
  flash(): void;
  update(dt: number): void;
  dispose(): void;
}

interface Rig {
  body: THREE.Object3D;
  legs: THREE.Object3D[];
  arm?: THREE.Object3D;
  height: number;
}

function part(geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** jambe articulée à la hanche : le pivot est en haut */
function leg(parent: THREE.Object3D, x: number, y: number, z: number, length: number, width: number, material: THREE.Material): THREE.Object3D {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  part(new THREE.BoxGeometry(width, length, width), material, 0, -length / 2, 0, pivot);
  parent.add(pivot);
  return pivot;
}

function goblin(root: THREE.Group, king: boolean): Rig {
  const skin = mat(king ? '#4f8a2e' : '#6fae3b');
  const cloth = mat(king ? '#7a2fa8' : '#7a5230');
  const body = new THREE.Group();
  body.position.y = 0.55;
  root.add(body);
  part(new THREE.BoxGeometry(0.55, 0.55, 0.4), cloth, 0, 0.1, 0, body);
  part(new THREE.BoxGeometry(0.55, 0.45, 0.5), skin, 0, 0.6, 0.02, body);
  part(new THREE.ConeGeometry(0.1, 0.4, 4), skin, -0.36, 0.65, 0, body).rotation.z = Math.PI / 2;
  part(new THREE.ConeGeometry(0.1, 0.4, 4), skin, 0.36, 0.65, 0, body).rotation.z = -Math.PI / 2;
  part(new THREE.BoxGeometry(0.08, 0.08, 0.04), mat('#ffef5a', { emissive: '#ffaa00', emissiveIntensity: 1 }), -0.12, 0.65, 0.27, body);
  part(new THREE.BoxGeometry(0.08, 0.08, 0.04), mat('#ffef5a', { emissive: '#ffaa00', emissiveIntensity: 1 }), 0.12, 0.65, 0.27, body);
  if (king) {
    const crown = part(new THREE.CylinderGeometry(0.22, 0.26, 0.2, 6), mat('#ffcc33', { metalness: 0.7, roughness: 0.3 }), 0, 0.95, 0, body);
    crown.castShadow = false;
  }
  const arm = new THREE.Group();
  arm.position.set(0.36, 0.25, 0);
  part(new THREE.BoxGeometry(0.14, 0.45, 0.14), skin, 0, -0.2, 0, arm);
  part(new THREE.BoxGeometry(0.06, 0.5, 0.12), mat('#c9ccd1', { metalness: 0.6 }), 0, -0.35, 0.25, arm).rotation.x = Math.PI / 2;
  body.add(arm);
  const legs = [leg(root, -0.15, 0.4, 0, 0.4, 0.17, cloth), leg(root, 0.15, 0.4, 0, 0.4, 0.17, cloth)];
  return { body, legs, arm, height: 1.6 };
}

function archer(root: THREE.Group): Rig {
  const bone = mat('#e8e2cf');
  const body = new THREE.Group();
  body.position.y = 0.9;
  root.add(body);
  part(new THREE.BoxGeometry(0.35, 0.55, 0.2), bone, 0, 0.1, 0, body);
  for (let i = 0; i < 3; i++) part(new THREE.BoxGeometry(0.42, 0.05, 0.24), bone, 0, -0.05 + i * 0.13, 0, body);
  part(new THREE.SphereGeometry(0.22, 6, 5), bone, 0, 0.62, 0, body);
  part(new THREE.BoxGeometry(0.07, 0.07, 0.03), mat('#ff3b3b', { emissive: '#ff0000', emissiveIntensity: 1.5 }), -0.08, 0.64, 0.2, body);
  part(new THREE.BoxGeometry(0.07, 0.07, 0.03), mat('#ff3b3b', { emissive: '#ff0000', emissiveIntensity: 1.5 }), 0.08, 0.64, 0.2, body);
  const arm = new THREE.Group();
  arm.position.set(-0.28, 0.3, 0.1);
  const bow = part(new THREE.TorusGeometry(0.4, 0.03, 4, 10, Math.PI), mat('#6b4423'), 0, 0, 0.25, arm);
  bow.rotation.set(0, Math.PI / 2, Math.PI / 2);
  body.add(arm);
  const legs = [leg(root, -0.1, 0.65, 0, 0.65, 0.08, bone), leg(root, 0.1, 0.65, 0, 0.65, 0.08, bone)];
  return { body, legs, arm, height: 1.8 };
}

function golem(root: THREE.Group, ancient: boolean): Rig {
  const stone = mat(ancient ? '#5d6b55' : '#8a8d92');
  const glow = mat(ancient ? '#7dffb0' : '#5ad1ff', { emissive: ancient ? '#30ff90' : '#22aaff', emissiveIntensity: 2 });
  const body = new THREE.Group();
  body.position.y = 1.0;
  root.add(body);
  part(new THREE.DodecahedronGeometry(0.75, 0), stone, 0, 0.2, 0, body);
  part(new THREE.BoxGeometry(0.6, 0.45, 0.55), stone, 0, 0.95, 0.05, body);
  part(new THREE.BoxGeometry(0.4, 0.08, 0.04), glow, 0, 1.0, 0.33, body);
  if (ancient) {
    for (const x of [-0.5, 0.5]) part(new THREE.ConeGeometry(0.15, 0.5, 4), mat('#3f6b3a'), x, 1.35, 0, body);
    part(new THREE.TorusGeometry(0.55, 0.05, 4, 12), glow, 0, 0.25, 0, body).rotation.x = Math.PI / 2;
  }
  const arm = new THREE.Group();
  arm.position.set(0.8, 0.6, 0);
  part(new THREE.BoxGeometry(0.4, 0.9, 0.4), stone, 0, -0.45, 0, arm);
  body.add(arm);
  const arm2 = new THREE.Group();
  arm2.position.set(-0.8, 0.6, 0);
  part(new THREE.BoxGeometry(0.4, 0.9, 0.4), stone, 0, -0.45, 0, arm2);
  body.add(arm2);
  const legs = [leg(root, -0.35, 0.6, 0, 0.6, 0.35, stone), leg(root, 0.35, 0.6, 0, 0.6, 0.35, stone)];
  return { body, legs, arm, height: 2.6 };
}

function spider(root: THREE.Group): Rig {
  const shell = mat('#2b2233');
  const body = new THREE.Group();
  body.position.y = 0.35;
  root.add(body);
  part(new THREE.SphereGeometry(0.35, 7, 5), shell, 0, 0, -0.2, body).scale.set(1, 0.75, 1.2);
  part(new THREE.SphereGeometry(0.2, 6, 4), shell, 0, 0, 0.25, body);
  part(new THREE.SphereGeometry(0.05, 4, 3), mat('#ff2b2b', { emissive: '#ff0000', emissiveIntensity: 2 }), -0.08, 0.08, 0.42, body);
  part(new THREE.SphereGeometry(0.05, 4, 3), mat('#ff2b2b', { emissive: '#ff0000', emissiveIntensity: 2 }), 0.08, 0.08, 0.42, body);
  const legs: THREE.Object3D[] = [];
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1;
    const z = 0.2 - (i % 4) * 0.15;
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.15, 0.35, z);
    const l = part(new THREE.BoxGeometry(0.55, 0.05, 0.05), shell, side * 0.27, -0.12, 0, pivot);
    l.rotation.z = side * -0.5;
    root.add(pivot);
    legs.push(pivot);
  }
  return { body, legs, height: 0.9 };
}

function build(kind: EnemyKind, root: THREE.Group): Rig {
  switch (kind) {
    case 'goblin':
      return goblin(root, false);
    case 'goblin_king':
      return goblin(root, true);
    case 'archer':
      return archer(root);
    case 'golem':
      return golem(root, false);
    case 'ancient_golem':
      return golem(root, true);
    case 'spider':
      return spider(root);
  }
}

/** échelle visuelle : rayon de collision du type rapporté à son rayon « modèle » */
const MODEL_RADIUS: Record<EnemyKind, number> = { goblin: 0.45, archer: 0.45, golem: 0.9, spider: 0.4, goblin_king: 0.45, ancient_golem: 0.9 };

export function createMonsterModel(kind: EnemyKind, shiny: boolean): MonsterModel {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const rig = build(kind, inner);
  inner.scale.setScalar((ENEMIES[kind].radius / MODEL_RADIUS[kind]) * (shiny ? SHINY.scale : 1));

  const meshes: THREE.Mesh[] = [];
  inner.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  if (shiny) {
    const gold = SHINY_MAT();
    for (const m of meshes) {
      const emissive = (m.material as THREE.MeshStandardMaterial).emissiveIntensity > 0.9;
      if (!emissive) m.material = gold;
    }
    const sparkles = new THREE.Points(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute(Array.from({ length: 60 }, () => (Math.random() - 0.5) * 2 * (isBoss(kind) ? 2.5 : 1.2)), 3),
      ),
      new THREE.PointsMaterial({ color: '#fff3a0', size: 0.08 }),
    );
    sparkles.position.y = rig.height / 2;
    root.add(sparkles);
  }
  const originals = meshes.map((m) => m.material);
  const white = mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 1 });
  let flashTime = 0;

  return {
    root,
    animate(t, s) {
      const speed = kind === 'spider' ? 18 : kind.includes('golem') ? 5 : 10;
      const swing = s.moving ? Math.sin(t * speed) * 0.6 : 0;
      rig.legs.forEach((l, i) => {
        if (kind === 'spider') l.rotation.x = s.moving ? Math.sin(t * speed + i) * 0.4 : 0;
        else l.rotation.x = i % 2 === 0 ? swing : -swing;
      });
      rig.body.position.y = (rig.body.userData.baseY ??= rig.body.position.y) + (s.moving ? Math.abs(Math.sin(t * speed)) * 0.05 : 0);
      inner.rotation.y = 0;
      inner.position.set(0, 0, 0);
      rig.arm?.rotation.set(0, 0, 0);
      switch (s.action) {
        case 'attack':
          if (rig.arm) rig.arm.rotation.x = -1.4;
          inner.position.z = 0.15;
          break;
        case 'windup':
          inner.position.x = Math.sin(t * 60) * 0.05;
          if (rig.arm) rig.arm.rotation.x = -2.6;
          break;
        case 'spin':
          inner.rotation.y = t * 14;
          if (rig.arm) rig.arm.rotation.z = -1.4;
          break;
        case 'throw':
          if (rig.arm) rig.arm.rotation.x = -3;
          break;
      }
    },
    flash() {
      flashTime = 0.1;
      for (const m of meshes) m.material = white;
    },
    update(dt) {
      if (flashTime <= 0) return;
      flashTime -= dt;
      if (flashTime <= 0) meshes.forEach((m, i) => (m.material = originals[i]));
    },
    dispose() {
      root.removeFromParent();
      root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints) (o as THREE.Mesh).geometry.dispose();
      });
    },
  };
}
