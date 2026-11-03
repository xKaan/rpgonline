import * as THREE from 'three';
import {
  ENCHANTER_POS,
  FORGE_POS,
  NO_INPUT,
  ROLL_DURATION,
  SPAWN_POS,
  WEAPON_TYPES,
  generateMap,
  newMotion,
  stepMotion,
  weaponAttacksPerSec,
  type CharacterDetail,
  type WeaponType,
} from '@rpg/shared';
import type { Api } from '../api';
import { CharacterModel } from '../three/characterModel';
import { h } from '../ui/dom';
import { ATTACK_ANIMATIONS, ROLL_ANIMATION, chooseAnimation } from './animations';
import { CAMERA_DISTANCE, TARGET_HEIGHT, aimFacing, cameraOffset, clampPitch } from './camera';
import { openForgePanel } from './forgePanel';
import { createHud } from './hud';
import { createInput } from './input';
import { buildWorld } from './world';

const MOUSE_SENSITIVITY = 0.0025;
const FORGE_REACH = 4.5;
const CONTROLS_HELP = 'ZQSD : se déplacer · Souris : viser · Clic : attaquer · Espace : roulade · 1-7 : armes · E : forge · Échap : pause';

export interface GameOptions {
  character: CharacterDetail;
  api: Api;
  onQuit(): void;
}

export async function startGame(root: HTMLElement, opts: GameOptions): Promise<() => void> {
  let character = opts.character;
  const container = h('div', { class: 'game' });
  root.append(container);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
  const map = generateMap();
  const world = buildWorld(scene, map);

  let model: CharacterModel;
  try {
    model = await CharacterModel.create(character.appearance);
  } catch (e) {
    renderer.dispose();
    container.remove();
    throw e;
  }
  scene.add(model.root);
  let weapon: WeaponType = 'sword';
  await model.setWeapon(weapon);

  const input = createInput(renderer.domElement);
  const hud = createHud(container);
  hud.setWeapons(character, weapon);

  let motion = newMotion(SPAWN_POS.x, SPAWN_POS.z);
  let yaw = 0;
  let pitch = 0.35;
  let attackCooldown = 0;
  let attackTime = 0;
  let closeForge: (() => void) | null = null;

  const overlay = h(
    'div',
    { class: 'overlay' },
    h(
      'div',
      { class: 'panel' },
      h('h2', {}, character.name),
      h('button', { onclick: () => input.lock() }, 'Jouer'),
      h('button', { class: 'secondary', onclick: () => opts.onQuit() }, 'Retour aux personnages'),
      h('p', { class: 'hint' }, CONTROLS_HELP),
    ),
  );
  container.append(overlay);
  input.onLockChange((locked) => {
    overlay.hidden = locked || closeForge !== null;
  });

  const resize = () => {
    const w = container.clientWidth;
    const hgt = container.clientHeight;
    renderer.setSize(w, hgt);
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const nearForge = () =>
    Math.hypot(motion.x - FORGE_POS.x, motion.z - FORGE_POS.z) < FORGE_REACH ||
    Math.hypot(motion.x - ENCHANTER_POS.x, motion.z - ENCHANTER_POS.z) < FORGE_REACH;

  const openForge = () => {
    closeForge = openForgePanel(container, {
      character,
      api: opts.api,
      onChange: (c) => {
        character = c;
        hud.setWeapons(character, weapon);
      },
      onClose: () => {
        closeForge = null;
        overlay.hidden = false;
        input.lock();
      },
    });
    overlay.hidden = true;
    input.unlock();
  };

  const switchWeapon = (t: WeaponType) => {
    if (t === weapon) return;
    weapon = t;
    void model.setWeapon(t);
    hud.setWeapons(character, weapon);
  };

  const clock = new THREE.Clock();
  let frame = 0;
  const tick = () => {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.1);
    const playing = input.isLocked();

    const mouse = input.consumeMouse();
    if (playing) {
      yaw -= mouse.dx * MOUSE_SENSITIVITY;
      pitch = clampPitch(pitch + mouse.dy * MOUSE_SENSITIVITY);
    }
    WEAPON_TYPES.forEach((t, i) => {
      if (input.consumePressed(`Digit${i + 1}`) && playing) switchWeapon(t);
    });
    if (input.consumePressed('KeyE') && playing && nearForge()) openForge();

    const move = playing ? input.moveInput() : NO_INPUT;
    const wasRolling = motion.rollTime > 0;
    motion = stepMotion(motion, move, yaw, dt, map.obstacles);
    const rolling = motion.rollTime > 0;
    if (rolling && !wasRolling) model.play(ROLL_ANIMATION, { once: true, restart: true, duration: ROLL_DURATION });

    attackCooldown = Math.max(0, attackCooldown - dt);
    attackTime = Math.max(0, attackTime - dt);
    if (input.consumeAttack() && playing && attackCooldown === 0 && !rolling) {
      const level = character.weapons.find((w) => w.type === weapon)?.level ?? 1;
      attackCooldown = 1 / weaponAttacksPerSec(weapon, level);
      attackTime = attackCooldown;
      model.play(ATTACK_ANIMATIONS[weapon], { once: true, restart: true, duration: attackCooldown });
    }
    const attacking = attackTime > 0;
    const moving = move.forward || move.back || move.left || move.right;
    const anim = chooseAnimation({ rolling, attacking, moving, weapon });
    model.play(anim.name, { once: anim.once });

    model.root.position.set(motion.x, 0, motion.z);
    model.root.rotation.y = attacking && !rolling ? aimFacing(yaw) : motion.facing;
    model.update(dt);
    world.update(dt);

    const off = cameraOffset(yaw, pitch, CAMERA_DISTANCE);
    camera.position.set(motion.x + off.x, TARGET_HEIGHT + off.y, motion.z + off.z);
    camera.lookAt(motion.x, TARGET_HEIGHT, motion.z);

    hud.setPrompt(playing && nearForge() ? 'E : forge et enchantements' : null);
    renderer.render(scene, camera);
  };
  tick();

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', resize);
    closeForge?.();
    input.dispose();
    hud.destroy();
    model.dispose();
    renderer.dispose();
    container.remove();
  };
}
