import * as THREE from 'three';
import {
  ENCHANTER_POS,
  FORGE_POS,
  FORGE_REACH,
  NO_INPUT,
  ROLL_DURATION,
  SPAWN_POS,
  WEAPON_TYPES,
  attackInterval,
  computeStats,
  generateMap,
  isBonusId,
  newMotion,
  stonesOf,
  type CharacterDetail,
  type MotionOptions,
  type PlayerView,
  type WeaponType,
} from '@rpg/shared';
import { connectRun } from '../net/runConnection';
import { Predictor } from '../net/prediction';
import { CharacterModel } from '../three/characterModel';
import { h } from '../ui/dom';
import { ATTACK_ANIMATIONS, ROLL_ANIMATION, chooseAnimation } from './animations';
import { CAMERA_DISTANCE, TARGET_HEIGHT, aimFacing, cameraOffset, clampPitch } from './camera';
import { createEntityLayer } from './entities';
import { openForgePanel } from './forgePanel';
import { createHud } from './hud';
import { createInput } from './input';
import { openBonusPanel, openMessagePanel, openRunOverPanel } from './runPanels';
import { buildWorld } from './world';

const MOUSE_SENSITIVITY = 0.0025;
const CONTROLS_HELP =
  'ZQSD : se déplacer · Souris : viser · Clic : attaquer (maintenir avec l’arc) · Espace : roulade · 1-7 : armes · E : forge (pendant le répit) · Entrée : lancer la vague · Échap : pause';

export interface GameOptions {
  character: CharacterDetail;
  token: string;
  onQuit(): void;
  onRestart(): void;
}

type Modal = 'forge' | 'bonus' | 'over' | 'lost' | null;

const motionOpts = (me: PlayerView): MotionOptions => ({ speedMult: me.speedMult, rollCooldown: me.rollCooldownMax });

export async function startGame(root: HTMLElement, opts: GameOptions): Promise<() => void> {
  let character = opts.character;
  const conn = await connectRun(opts.token, character.id);

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
  const entities = createEntityLayer(scene);

  let model: CharacterModel;
  try {
    model = await CharacterModel.create(character.appearance);
  } catch (e) {
    conn.leave();
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

  const predictor = new Predictor(newMotion(SPAWN_POS.x, SPAWN_POS.z), map.obstacles);
  let yaw = 0;
  let pitch = 0.35;
  let attackCooldown = 0;
  let attackTime = 0;
  let charging = false;
  let modal: Modal = null;
  let closeModal: (() => void) | null = null;
  let answeredOffer = '';
  let dead = false;

  const me = (): PlayerView | undefined => conn.state.players?.get(conn.sessionId);

  const pauseOverlay = h(
    'div',
    { class: 'overlay' },
    h(
      'div',
      { class: 'panel' },
      h('h2', {}, character.name),
      h('button', { onclick: () => input.lock() }, 'Jouer'),
      h('button', { class: 'secondary', onclick: () => opts.onQuit() }, 'Abandonner la run'),
      h('p', { class: 'hint' }, CONTROLS_HELP),
    ),
  );
  container.append(pauseOverlay);
  const refreshOverlay = () => {
    pauseOverlay.hidden = input.isLocked() || modal !== null;
  };
  input.onLockChange((locked) => {
    conn.pause(!locked);
    if (!locked && charging) {
      charging = false;
      conn.attack(yaw, false);
    }
    refreshOverlay();
  });
  conn.pause(true);

  const setModal = (m: Modal, close: (() => void) | null) => {
    closeModal?.();
    modal = m;
    closeModal = close;
    if (m) input.unlock();
    refreshOverlay();
  };
  const endModal = (relock: boolean) => {
    modal = null;
    closeModal = null;
    refreshOverlay();
    if (relock) input.lock();
  };

  /** le perso vu par la forge : armes connues + porte-monnaie de l'état serveur */
  const forgeCharacter = (): CharacterDetail => {
    const p = me();
    return p ? { ...character, gold: p.gold, materials: p.materials, stones: stonesOf(p) } : character;
  };

  const openForge = () =>
    setModal(
      'forge',
      openForgePanel(container, {
        character: forgeCharacter(),
        api: conn.forge,
        onChange: (c) => {
          character = c;
          hud.setWeapons(character, weapon);
        },
        onClose: () => endModal(true),
      }),
    );

  conn.onRunOver((summary) => {
    dead = true;
    setModal('over', openRunOverPanel(container, summary, { onRestart: opts.onRestart, onQuit: opts.onQuit }));
  });
  conn.onDisconnect(() => {
    if (modal === 'over') return;
    setModal('lost', openMessagePanel(container, 'Connexion perdue', 'La run est perdue, mais le loot ramassé est sauvegardé.', opts.onQuit));
  });

  conn.onStateChange(() => {
    entities.sync(conn.state, performance.now());
    const p = me();
    if (!p) return;
    predictor.reconcile(p, motionOpts(p));
    if (p.dead && !dead) {
      dead = true;
      model.play('Death_A', { once: true, restart: true });
    }
    const offer = [...p.offer];
    const key = `${conn.state.wave}:${offer.join(',')}`;
    if (offer.length > 0 && key !== answeredOffer && modal === null && conn.state.phase === 'break') {
      answeredOffer = key;
      setModal(
        'bonus',
        openBonusPanel(container, offer, (id) => {
          conn.chooseBonus(id);
          endModal(true);
        }),
      );
    }
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

  const nearForge = () => {
    const x = predictor.motion.x;
    const z = predictor.motion.z;
    return Math.hypot(x - FORGE_POS.x, z - FORGE_POS.z) < FORGE_REACH || Math.hypot(x - ENCHANTER_POS.x, z - ENCHANTER_POS.z) < FORGE_REACH;
  };

  const switchWeapon = (t: WeaponType) => {
    if (t === weapon) return;
    weapon = t;
    charging = false;
    conn.setWeapon(t);
    void model.setWeapon(t);
    hud.setWeapons(character, weapon);
  };

  const currentInterval = (p: PlayerView) => {
    const level = character.weapons.find((w) => w.type === weapon)?.level ?? 1;
    return attackInterval(weapon, level, computeStats([...p.bonuses].filter(isBonusId)));
  };

  const clock = new THREE.Clock();
  let frame = 0;
  const tick = () => {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.1);
    const now = performance.now();
    const p = me();
    const playing = input.isLocked() && !dead && p !== undefined;

    const mouse = input.consumeMouse();
    if (playing) {
      yaw -= mouse.dx * MOUSE_SENSITIVITY;
      pitch = clampPitch(pitch + mouse.dy * MOUSE_SENSITIVITY);
    }
    WEAPON_TYPES.forEach((t, i) => {
      if (input.consumePressed(`Digit${i + 1}`) && playing) switchWeapon(t);
    });
    const inBreak = conn.state.phase === 'break';
    if (input.consumePressed('KeyE') && playing && inBreak && nearForge()) openForge();
    if (input.consumePressed('Enter') && playing && inBreak) conn.ready();

    const wasRolling = predictor.motion.rollTime > 0;
    const move = playing ? input.moveInput() : NO_INPUT;
    if (playing) conn.sendInput(predictor.step(move, yaw, dt, motionOpts(p)));
    predictor.decay(dt);
    const rolling = predictor.motion.rollTime > 0;
    if (rolling && !wasRolling) {
      charging = false;
      model.play(ROLL_ANIMATION, { once: true, restart: true, duration: ROLL_DURATION });
    }

    attackCooldown = Math.max(0, attackCooldown - dt);
    attackTime = Math.max(0, attackTime - dt);
    const fire = (anim: string) => {
      attackCooldown = currentInterval(p!);
      attackTime = Math.min(attackCooldown, 0.6);
      model.play(anim, { once: true, restart: true, duration: attackTime });
    };
    if (input.consumeAttack() && playing) {
      conn.attack(yaw, true);
      if (weapon === 'bow') charging = true;
      else if (attackCooldown === 0 && !rolling) fire(ATTACK_ANIMATIONS[weapon]);
    }
    if (input.consumeRelease() && charging) {
      charging = false;
      conn.attack(yaw, false);
      if (attackCooldown === 0 && !rolling) fire(ATTACK_ANIMATIONS.bow);
    }

    if (!dead) {
      const attacking = attackTime > 0;
      const moving = move.forward || move.back || move.left || move.right;
      if (charging && !rolling) model.play('2H_Ranged_Aiming', {});
      else {
        const anim = chooseAnimation({ rolling, attacking, moving, weapon });
        model.play(anim.name, { once: anim.once });
      }
      model.root.rotation.y = (attacking || charging) && !rolling ? aimFacing(yaw) : predictor.motion.facing;
    }
    const x = predictor.renderX;
    const z = predictor.renderZ;
    model.root.position.set(x, 0, z);
    model.update(dt);
    world.update(dt);
    entities.update(dt, now, camera);

    const off = cameraOffset(yaw, pitch, CAMERA_DISTANCE);
    camera.position.set(x + off.x, TARGET_HEIGHT + off.y, z + off.z);
    camera.lookAt(x, TARGET_HEIGHT, z);

    if (p) hud.update(conn.state, p, entities.boss);
    hud.setPrompt(playing && inBreak && nearForge() ? 'E : forge et enchantements' : null);
    renderer.render(scene, camera);
  };
  tick();

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', resize);
    closeModal?.();
    conn.leave();
    input.dispose();
    hud.destroy();
    entities.dispose();
    model.dispose();
    renderer.dispose();
    container.remove();
  };
}
