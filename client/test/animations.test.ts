import { describe, it, expect } from 'vitest';
import { WEAPON_TYPES } from '@rpg/shared';
import { ATTACK_ANIMATIONS, ROLL_ANIMATION, chooseAnimation } from '../src/game/animations';

const base = { rolling: false, attacking: false, moving: false, weapon: 'sword' as const };

describe('chooseAnimation', () => {
  it('priorité : roulade > attaque > course > repos', () => {
    expect(chooseAnimation({ ...base, rolling: true, attacking: true, moving: true })).toEqual({ name: ROLL_ANIMATION, once: true });
    expect(chooseAnimation({ ...base, attacking: true, moving: true })).toEqual({ name: ATTACK_ANIMATIONS.sword, once: true });
    expect(chooseAnimation({ ...base, moving: true })).toEqual({ name: 'Running_A', once: false });
    expect(chooseAnimation(base)).toEqual({ name: 'Idle', once: false });
    expect(chooseAnimation({ ...base, weapon: 'axe' })).toEqual({ name: '2H_Melee_Idle', once: false });
  });

  it('a une animation d’attaque pour chaque arme', () => {
    for (const w of WEAPON_TYPES) expect(ATTACK_ANIMATIONS[w]).toMatch(/Attack|Shoot/);
  });
});
