import * as THREE from 'three';
import { ENCHANTER_POS, FORGE_POS, MAP_HALF_SIZE, SAFE_RADIUS, type Decoration, type GameMap } from '@rpg/shared';

const SKY = '#9fd3f0';

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: Decoration[], y: (d: Decoration) => number, scale = 1) {
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  items.forEach((d, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.rotation);
    s.setScalar(d.scale * scale);
    p.set(d.x, y(d), d.z);
    mesh.setMatrixAt(i, m.compose(p, q, s));
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildForge(): THREE.Group {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: '#7b7f87', flatShading: true });
  const iron = new THREE.MeshStandardMaterial({ color: '#2f3238', metalness: 0.5, roughness: 0.5 });
  const ember = new THREE.MeshStandardMaterial({ color: '#ff7a1a', emissive: '#ff5a00', emissiveIntensity: 2 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  };
  add(new THREE.BoxGeometry(3, 1, 2.4), stone, 0, 0.5, 0);
  add(new THREE.BoxGeometry(1.2, 3.2, 1.2), stone, -0.9, 1.6, -0.6);
  add(new THREE.BoxGeometry(0.9, 0.25, 0.7), ember, -0.9, 1.05, 0.15);
  add(new THREE.BoxGeometry(0.9, 0.45, 0.45), iron, 0.8, 1.25, 0.3);
  add(new THREE.BoxGeometry(0.4, 0.3, 0.3), iron, 0.8, 0.85, 0.3);
  const light = new THREE.PointLight('#ff8a3a', 8, 7);
  light.position.set(-0.9, 1.6, 0.6);
  g.add(light);
  return g;
}

function buildEnchanter(): { group: THREE.Group; crystal: THREE.Mesh } {
  const g = new THREE.Group();
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.8, 1, 8),
    new THREE.MeshStandardMaterial({ color: '#5a5f6b', flatShading: true }),
  );
  pedestal.position.y = 0.5;
  pedestal.castShadow = true;
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.45, 0),
    new THREE.MeshStandardMaterial({ color: '#b07cff', emissive: '#7a3cff', emissiveIntensity: 1.5, flatShading: true }),
  );
  crystal.position.y = 1.7;
  const light = new THREE.PointLight('#a070ff', 5, 6);
  light.position.y = 1.7;
  g.add(pedestal, crystal, light);
  return { group: g, crystal };
}

export function buildWorld(scene: THREE.Scene, map: GameMap): { update(dt: number): void } {
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 45, 110);

  scene.add(new THREE.HemisphereLight('#ffffff', '#4a6b3a', 1.2));
  const sun = new THREE.DirectionalLight('#fff3d6', 2.2);
  sun.position.set(20, 35, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const extent = MAP_HALF_SIZE + 5;
  Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 120 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_HALF_SIZE * 2 + 80, MAP_HALF_SIZE * 2 + 80),
    new THREE.MeshStandardMaterial({ color: '#6fa35a' }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const plaza = new THREE.Mesh(new THREE.CircleGeometry(SAFE_RADIUS - 2, 40), new THREE.MeshStandardMaterial({ color: '#b49a6c' }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.01;
  plaza.receiveShadow = true;
  scene.add(plaza);

  const trunkMat = new THREE.MeshStandardMaterial({ color: '#7a4f2a', flatShading: true });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#3f8a3a', flatShading: true });
  const rockMat = new THREE.MeshStandardMaterial({ color: '#8d8f94', flatShading: true });
  scene.add(instanced(new THREE.CylinderGeometry(0.2, 0.3, 1.4, 6), trunkMat, map.trees, (d) => 0.7 * d.scale));
  scene.add(instanced(new THREE.ConeGeometry(1.3, 2.8, 7), leafMat, map.trees, (d) => 2.6 * d.scale));
  scene.add(instanced(new THREE.DodecahedronGeometry(0.8, 0), rockMat, map.rocks, (d) => 0.35 * d.scale));

  const forge = buildForge();
  forge.position.set(FORGE_POS.x, 0, FORGE_POS.z);
  scene.add(forge);

  const enchanter = buildEnchanter();
  enchanter.group.position.set(ENCHANTER_POS.x, 0, ENCHANTER_POS.z);
  scene.add(enchanter.group);

  let time = 0;
  return {
    update(dt) {
      time += dt;
      enchanter.crystal.rotation.y = time;
      enchanter.crystal.position.y = 1.7 + Math.sin(time * 2) * 0.12;
    },
  };
}
