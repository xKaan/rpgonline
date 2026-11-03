import * as THREE from 'three';
import type { Appearance, BaseModel } from '@rpg/shared';
import { CharacterModel } from './characterModel';

export interface Preview {
  show(a: Appearance): Promise<void>;
  dispose(): void;
}

export function createPreview(container: HTMLElement): Preview {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#445566', 1.6));
  const sun = new THREE.DirectionalLight('#fff3d6', 2);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.4, 32), new THREE.MeshStandardMaterial({ color: '#2d3a4a' }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.set(0, 2, 6.5);
  camera.lookAt(0, 1.2, 0);

  let model: CharacterModel | null = null;
  let base: BaseModel | null = null;
  let request = 0;

  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  const clock = new THREE.Clock();
  let frame = 0;
  const tick = () => {
    frame = requestAnimationFrame(tick);
    const dt = clock.getDelta();
    if (model) {
      model.root.rotation.y += dt * 0.5;
      model.update(dt);
    }
    renderer.render(scene, camera);
  };
  tick();

  return {
    async show(a) {
      const r = ++request;
      if (model && base === a.base) {
        model.applyAppearance(a);
        return;
      }
      const next = await CharacterModel.create(a);
      if (r !== request) {
        next.dispose();
        return;
      }
      const rotation = model?.root.rotation.y ?? 0.4;
      model?.dispose();
      model = next;
      base = a.base;
      model.root.rotation.y = rotation;
      scene.add(model.root);
      model.play('Idle');
      await model.setWeapon('sword');
    },
    dispose() {
      request++;
      cancelAnimationFrame(frame);
      observer.disconnect();
      model?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
