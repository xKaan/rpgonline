import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { Appearance, BaseModel, WeaponType } from '@rpg/shared';
import { MODEL_FILES, classifyPart, isPartVisible } from './parts';
import { createWeaponModel } from './weaponModels';

const loader = new GLTFLoader();
const cache = new Map<BaseModel, Promise<GLTF>>();
const FADE = 0.15;
/** placement des armes dans `handslot.r`, identique aux armes intégrées des persos KayKit */
const WEAPON_OFFSET_Y = 0.0333;
const WEAPON_BONE = 'handslot.r';

function loadBase(base: BaseModel): Promise<GLTF> {
  let p = cache.get(base);
  if (!p) {
    p = loader.loadAsync(`/assets/characters/${MODEL_FILES[base]}`);
    cache.set(base, p);
  }
  return p;
}

export interface PlayOptions {
  once?: boolean;
  /** relance l'animation même si elle joue déjà */
  restart?: boolean;
  /** accélère l'animation pour qu'elle tienne dans cette durée (s) ; ne la ralentit jamais */
  duration?: number;
}

export class CharacterModel {
  readonly root: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly weaponSlot: THREE.Object3D;
  private readonly baseMaterials = new Map<THREE.Mesh, THREE.Material>();
  private current: THREE.AnimationAction | null = null;
  private weapon: THREE.Object3D | null = null;
  private weaponRequest = 0;

  private constructor(gltf: GLTF) {
    this.root = cloneSkinned(gltf.scene);
    this.mixer = new THREE.AnimationMixer(this.root);
    for (const clip of gltf.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
    // GLTFLoader nettoie les noms de nœuds (« handslot.r » devient « handslotr »)
    const slot = this.root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(WEAPON_BONE));
    if (!slot) console.warn(`Os « ${WEAPON_BONE} » introuvable : l'arme sera attachée à la racine du modèle`);
    this.weaponSlot = slot ?? this.root;
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      this.baseMaterials.set(mesh, mesh.material as THREE.Material);
    });
  }

  static async create(appearance: Appearance): Promise<CharacterModel> {
    const model = new CharacterModel(await loadBase(appearance.base));
    model.applyAppearance(appearance);
    return model;
  }

  /** Visibilité des pièces et teinte de la tenue ; le modèle de base ne change pas ici. */
  applyAppearance(a: Appearance): void {
    const tint = new THREE.Color(a.outfitColor);
    for (const [mesh, baseMat] of this.baseMaterials) {
      const kind = classifyPart(mesh.name);
      mesh.visible = isPartVisible(kind, a);
      if (mesh.material !== baseMat) (mesh.material as THREE.Material).dispose();
      if (kind === 'outfit' || kind === 'cape') {
        const tinted = (baseMat as THREE.MeshStandardMaterial).clone();
        tinted.color.copy(tint);
        mesh.material = tinted;
      } else {
        mesh.material = baseMat;
      }
    }
  }

  /** Remplace l'arme en main ; seule la dernière demande est appliquée si plusieurs se chevauchent. */
  async setWeapon(type: WeaponType): Promise<void> {
    const request = ++this.weaponRequest;
    const obj = await createWeaponModel(type);
    if (request !== this.weaponRequest) return;
    if (this.weapon) this.weaponSlot.remove(this.weapon);
    obj.position.set(0, WEAPON_OFFSET_Y, 0);
    obj.rotation.set(0, Math.PI, 0);
    this.weaponSlot.add(obj);
    this.weapon = obj;
  }

  play(name: string, opts: PlayOptions = {}): void {
    const next = this.actions.get(name);
    if (!next || (next === this.current && !opts.restart)) return;
    next.reset();
    next.setLoop(opts.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = !!opts.once;
    const clipDuration = next.getClip().duration;
    next.timeScale = opts.duration ? Math.max(1, clipDuration / opts.duration) : 1;
    if (this.current && this.current !== next) {
      this.current.fadeOut(FADE);
      next.fadeIn(FADE);
    } else {
      next.setEffectiveWeight(1);
    }
    next.play();
    this.current = next;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    for (const [mesh, baseMat] of this.baseMaterials) {
      if (mesh.material !== baseMat) (mesh.material as THREE.Material).dispose();
    }
    this.root.removeFromParent();
  }
}
