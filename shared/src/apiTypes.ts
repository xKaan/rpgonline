import type { Appearance } from './character';
import type { Element } from './enchantments';
import type { WeaponState } from './forge';

export interface AuthResult {
  token: string;
  username: string;
}

export interface Me {
  id: number;
  username: string;
}

export interface CharacterSummary {
  id: number;
  name: string;
  appearance: Appearance;
  bestWave: number;
}

export interface CharacterDetail extends CharacterSummary {
  gold: number;
  materials: number;
  stones: Record<Element, number>;
  weapons: WeaponState[];
}
