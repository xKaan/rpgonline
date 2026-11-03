import * as THREE from 'three';
import { ENEMIES, ENEMY_KINDS, type EnemyKind, type EntityMap, type RunStateView } from '@rpg/shared';
import { INTERP_DELAY, SnapshotBuffer } from '../net/interpolation';
import { createMonsterModel, type MonsterModel } from '../three/monsterModels';

/** Clés ajoutées et retirées entre deux synchronisations. */
export function diffKeys(previous: Iterable<string>, next: EntityMap<unknown>): { added: string[]; removed: string[] } {
  const prev = new Set(previous);
  const added: string[] = [];
  next.forEach((_, key) => {
    if (!prev.delete(key)) added.push(key);
  });
  return { added, removed: [...prev] };
}

const isEnemyKind = (k: string): k is EnemyKind => (ENEMY_KINDS as readonly string[]).includes(k);

const HAZARD_COLORS: Record<string, string> = {
  spawn: '#b46bff',
  slam: '#ff4a2a',
  rock: '#ff8a1a',
  spin: '#ffd23a',
  fire: '#ff5a00',
  shock: '#5ad1ff',
};
const STONE_COLORS: Record<string, string> = { fire: '#ff5a2a', lightning: '#ffe14a', poison: '#6bdc4a', ice: '#7fd6ff' };

interface MonsterEntry {
  model: MonsterModel;
  buffer: SnapshotBuffer;
  bar: THREE.Group;
  fill: THREE.Mesh;
  lastHp: number;
  boss: boolean;
}

interface SimpleEntry {
  obj: THREE.Object3D;
  buffer?: SnapshotBuffer;
}

function hpBar(width: number): { bar: THREE.Group; fill: THREE.Mesh } {
  const bar = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.12), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.6, depthTest: false }));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.08), new THREE.MeshBasicMaterial({ color: '#e5484d', depthTest: false }));
  fill.position.z = 0.001;
  bg.renderOrder = 10;
  fill.renderOrder = 11;
  bar.add(bg, fill);
  return { bar, fill };
}

function hazardMesh(kind: string, radius: number): THREE.Object3D {
  const color = HAZARD_COLORS[kind] ?? '#ffffff';
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.92, radius, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
  );
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: kind === 'fire' ? 0.45 : 0.25, side: THREE.DoubleSide, depthWrite: false }),
  );
  disc.name = 'fill';
  for (const m of [ring, disc]) {
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.03;
    g.add(m);
  }
  return g;
}

const projectileGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.8, 5);
projectileGeo.rotateX(Math.PI / 2);
const projectileMats: Record<string, THREE.Material> = {
  arrow: new THREE.MeshStandardMaterial({ color: '#d9b26b' }),
  bolt: new THREE.MeshStandardMaterial({ color: '#8f9399', metalness: 0.6 }),
  enemyArrow: new THREE.MeshStandardMaterial({ color: '#ff5555', emissive: '#aa0000' }),
};

function lootMesh(kind: string, element: string): THREE.Object3D {
  if (kind === 'gold') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 10), new THREE.MeshStandardMaterial({ color: '#ffcc33', metalness: 0.8, roughness: 0.3, emissive: '#664400' }));
    m.rotation.x = Math.PI / 2;
    const g = new THREE.Group();
    g.add(m);
    return g;
  }
  if (kind === 'material') return new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: '#9a7b55', flatShading: true }));
  const c = STONE_COLORS[element] ?? '#ffffff';
  return new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.8, flatShading: true }));
}

function chestMesh(): THREE.Object3D {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#8b5a2b', flatShading: true });
  const gold = new THREE.MeshStandardMaterial({ color: '#ffcc33', metalness: 0.7, roughness: 0.3 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1, 0.55, 0.7), wood);
  base.position.y = 0.28;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.25, 0.72), wood);
  lid.position.y = 0.68;
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.05), gold);
  lock.position.set(0, 0.5, 0.37);
  for (const m of [base, lid, lock]) {
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

function disposeObject(o: THREE.Object3D): void {
  o.removeFromParent();
  o.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if (!mesh.isMesh || mesh.geometry === projectileGeo) return;
    mesh.geometry.dispose();
    const m = mesh.material as THREE.Material;
    if (!Object.values(projectileMats).includes(m)) m.dispose();
  });
}

export interface BossInfo {
  label: string;
  hp: number;
  maxHp: number;
}

/** Affiche monstres, projectiles, zones, loot et coffres à partir de l'état de la room. */
export function createEntityLayer(scene: THREE.Scene) {
  const monsters = new Map<string, MonsterEntry>();
  const projectiles = new Map<string, SimpleEntry>();
  const hazards = new Map<string, SimpleEntry>();
  const loot = new Map<string, SimpleEntry>();
  const chests = new Map<string, SimpleEntry>();
  let boss: BossInfo | null = null;

  const syncSimple = <T extends { x: number; z: number }>(
    store: Map<string, SimpleEntry>,
    source: EntityMap<T>,
    create: (v: T) => THREE.Object3D,
    now: number,
    interpolate: boolean,
  ) => {
    const { added, removed } = diffKeys(store.keys(), source);
    for (const key of removed) {
      disposeObject(store.get(key)!.obj);
      store.delete(key);
    }
    for (const key of added) {
      const v = source.get(key)!;
      const obj = create(v);
      obj.position.set(v.x, 0, v.z);
      scene.add(obj);
      store.set(key, { obj, buffer: interpolate ? new SnapshotBuffer() : undefined });
    }
    source.forEach((v, key) => {
      const e = store.get(key)!;
      if (e.buffer) e.buffer.push(now, { x: v.x, z: v.z, facing: 0 });
      else e.obj.position.set(v.x, e.obj.position.y, v.z);
    });
  };

  return {
    /** à appeler à chaque patch reçu ; `now` en ms */
    sync(state: RunStateView, now: number) {
      if (!state.monsters) return;
      const { added, removed } = diffKeys(monsters.keys(), state.monsters);
      for (const key of removed) {
        monsters.get(key)!.model.dispose();
        monsters.delete(key);
      }
      for (const key of added) {
        const m = state.monsters.get(key)!;
        if (!isEnemyKind(m.kind)) continue;
        const model = createMonsterModel(m.kind, m.shiny !== '');
        model.root.position.set(m.x, 0, m.z);
        const st = ENEMIES[m.kind];
        const { bar, fill } = hpBar(st.boss ? 2.4 : 1);
        bar.position.y = (st.boss ? 4.2 : st.radius * 3.4) * (m.shiny ? 1.3 : 1);
        model.root.add(bar);
        scene.add(model.root);
        monsters.set(key, { model, buffer: new SnapshotBuffer(), bar, fill, lastHp: m.hp, boss: st.boss });
      }
      boss = null;
      state.monsters.forEach((m, key) => {
        const e = monsters.get(key);
        if (!e) return;
        e.buffer.push(now, { x: m.x, z: m.z, facing: m.facing });
        if (m.hp < e.lastHp - 0.01) e.model.flash();
        e.lastHp = m.hp;
        const ratio = m.maxHp > 0 ? Math.max(0, m.hp / m.maxHp) : 0;
        e.fill.scale.x = Math.max(0.001, ratio);
        e.fill.position.x = -(1 - ratio) * ((e.fill.geometry as THREE.PlaneGeometry).parameters.width / 2);
        e.bar.visible = ratio < 1 && !e.boss;
        e.model.root.userData.action = m.action;
        if (e.boss && isEnemyKind(m.kind)) boss = { label: ENEMIES[m.kind].label + (m.shiny ? ' ✨' : ''), hp: m.hp, maxHp: m.maxHp };
      });

      syncSimple(projectiles, state.projectiles, (p) => {
        const mesh = new THREE.Mesh(projectileGeo, projectileMats[p.kind] ?? projectileMats.arrow);
        mesh.position.y = 1.2;
        const g = new THREE.Group();
        g.add(mesh);
        g.rotation.y = Math.atan2(p.dirX, p.dirZ);
        return g;
      }, now, true);
      syncSimple(hazards, state.hazards, (h) => hazardMesh(h.kind, h.radius), now, false);
      state.hazards.forEach((h, key) => {
        const fill = hazards.get(key)?.obj.getObjectByName('fill');
        if (fill && h.kind !== 'fire' && h.duration > 0) fill.scale.setScalar(Math.max(0.05, 1 - h.time / h.duration));
      });
      syncSimple(loot, state.loot, (l) => lootMesh(l.kind, l.element), now, false);
      syncSimple(chests, state.chests, () => chestMesh(), now, false);
    },

    /** à appeler à chaque image ; `now` en ms */
    update(dt: number, now: number, camera: THREE.Camera) {
      const renderTime = now - INTERP_DELAY;
      const t = now / 1000;
      for (const e of monsters.values()) {
        const pose = e.buffer.sample(renderTime);
        if (pose) {
          const moved = Math.hypot(pose.x - e.model.root.position.x, pose.z - e.model.root.position.z) > 0.002;
          e.model.root.position.set(pose.x, 0, pose.z);
          e.model.root.rotation.y = pose.facing;
          e.model.animate(t, { moving: moved, action: String(e.model.root.userData.action ?? 'idle') });
        }
        e.model.update(dt);
        e.bar.quaternion.copy(camera.quaternion);
        e.bar.quaternion.premultiply(e.model.root.quaternion.clone().invert());
      }
      for (const e of projectiles.values()) {
        const pose = e.buffer?.sample(renderTime);
        if (pose) e.obj.position.set(pose.x, 0, pose.z);
      }
      for (const e of loot.values()) {
        e.obj.rotation.y += dt * 2;
        e.obj.position.y = 0.4 + Math.sin(t * 3 + e.obj.id) * 0.1;
      }
    },

    get boss(): BossInfo | null {
      return boss;
    },

    dispose() {
      for (const e of monsters.values()) e.model.dispose();
      for (const store of [projectiles, hazards, loot, chests]) for (const e of store.values()) disposeObject(e.obj);
      monsters.clear();
    },
  };
}

export type EntityLayer = ReturnType<typeof createEntityLayer>;
