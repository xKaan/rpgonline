import type { Appearance, BaseModel } from '@rpg/shared';

export const MODEL_FILES: Record<BaseModel, string> = {
  knight: 'Knight.glb',
  barbarian: 'Barbarian.glb',
  mage: 'Mage.glb',
  rogue: 'Rogue.glb',
  rogue_hooded: 'Rogue_Hooded.glb',
};

export type PartKind = 'skin' | 'outfit' | 'headgear' | 'cape' | 'prop';

/** Classe un maillage KayKit d'après son nom de nœud (ex. « Knight_Body », « Mage_Hat », « 1H_Sword »). */
export function classifyPart(nodeName: string): PartKind {
  if (/_Head(_Hooded)?$/.test(nodeName)) return 'skin';
  if (/_(Body|ArmLeft|ArmRight|LegLeft|LegRight)$/.test(nodeName)) return 'outfit';
  if (/_(Hat|Helmet)$/.test(nodeName)) return 'headgear';
  if (/_Cape$/.test(nodeName)) return 'cape';
  return 'prop';
}

export function isPartVisible(kind: PartKind, a: Appearance): boolean {
  switch (kind) {
    case 'skin':
    case 'outfit':
      return true;
    case 'headgear':
      return a.headgear;
    case 'cape':
      return a.cape;
    case 'prop':
      return false;
  }
}
