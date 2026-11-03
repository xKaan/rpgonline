import type { WeaponType } from '@rpg/shared';

export const ATTACK_ANIMATIONS: Record<WeaponType, string> = {
  sword: '1H_Melee_Attack_Slice_Horizontal',
  shovel: '2H_Melee_Attack_Slice',
  axe: '2H_Melee_Attack_Chop',
  spear: '2H_Melee_Attack_Stab',
  mace: '2H_Melee_Attack_Spin',
  bow: '2H_Ranged_Shoot',
  crossbow: '2H_Ranged_Shoot',
};

export const ROLL_ANIMATION = 'Dodge_Forward';

export interface AnimState {
  rolling: boolean;
  attacking: boolean;
  moving: boolean;
  weapon: WeaponType;
}

export function chooseAnimation(s: AnimState): { name: string; once: boolean } {
  if (s.rolling) return { name: ROLL_ANIMATION, once: true };
  if (s.attacking) return { name: ATTACK_ANIMATIONS[s.weapon], once: true };
  if (s.moving) return { name: 'Running_A', once: false };
  return { name: s.weapon === 'sword' ? 'Idle' : '2H_Melee_Idle', once: false };
}
