import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { WeaponType } from '@rpg/shared';

const GLTF_FILES: Partial<Record<WeaponType, string>> = {
  sword: 'sword_1handed.gltf',
  axe: 'axe_2handed.gltf',
  crossbow: 'crossbow_2handed.gltf',
};

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();

const wood = new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 0.8, flatShading: true });
const metal = new THREE.MeshStandardMaterial({ color: '#b8c0c8', metalness: 0.6, roughness: 0.35, flatShading: true });
const dark = new THREE.MeshStandardMaterial({ color: '#3a3a40', metalness: 0.4, roughness: 0.5, flatShading: true });
const cord = new THREE.MeshStandardMaterial({ color: '#e8e0c8', roughness: 0.9 });

function piece(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** Armes absentes du pack KayKit : low-poly, poignée à l'origine, lame vers +Y. */
function buildProcedural(type: WeaponType): THREE.Object3D {
  const g = new THREE.Group();
  switch (type) {
    case 'shovel':
      g.add(piece(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), wood, 0, 0.55));
      g.add(piece(new THREE.BoxGeometry(0.42, 0.5, 0.05), metal, 0, 1.45));
      g.add(piece(new THREE.BoxGeometry(0.26, 0.07, 0.07), wood, 0, -0.2));
      break;
    case 'spear':
      g.add(piece(new THREE.CylinderGeometry(0.045, 0.045, 2.2, 6), wood, 0, 0.7));
      g.add(piece(new THREE.ConeGeometry(0.12, 0.4, 6), metal, 0, 2));
      break;
    case 'mace': {
      g.add(piece(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6), wood, 0, 0.35));
      g.add(piece(new THREE.IcosahedronGeometry(0.25, 0), dark, 0, 1));
      const spike = new THREE.ConeGeometry(0.06, 0.22, 4);
      const dirs: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1], [0.7, 0.7, 0], [-0.7, 0.7, 0]];
      for (const [x, y, z] of dirs) {
        const s = piece(spike, metal, x * 0.3, 1 + y * 0.3, z * 0.3);
        s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, y, z).normalize());
        g.add(s);
      }
      break;
    }
    case 'bow': {
      // demi-tore tourné : bombé vers +X, extrémités en y = ±0,8 ; le milieu (la poignée) à l'origine
      const arc = piece(new THREE.TorusGeometry(0.8, 0.04, 6, 16, Math.PI), wood, -0.8, 0);
      arc.rotation.z = -Math.PI / 2;
      g.add(arc);
      g.add(piece(new THREE.CylinderGeometry(0.008, 0.008, 1.6, 4), cord, -0.8, 0));
      break;
    }
    default:
      g.add(piece(new THREE.BoxGeometry(0.1, 1, 0.1), metal, 0, 0.5));
  }
  return g;
}

export async function createWeaponModel(type: WeaponType): Promise<THREE.Object3D> {
  const file = GLTF_FILES[type];
  if (!file) return buildProcedural(type);
  let p = cache.get(file);
  if (!p) {
    p = loader.loadAsync(`/assets/weapons/${file}`);
    cache.set(file, p);
  }
  const scene = (await p).scene.clone();
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return scene;
}
