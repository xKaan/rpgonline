import type { CharacterDetail, Element, ForgeMessage, ForgeReply, WeaponType } from '@rpg/shared';
import { ApiError } from '../api';

const TIMEOUT_MS = 5000;

export interface ForgeApi {
  upgradeWeapon(characterId: number, type: WeaponType): Promise<CharacterDetail>;
  enchantWeapon(characterId: number, type: WeaponType, slot: 0 | 1, element: Element): Promise<CharacterDetail>;
}

/** Forge via la room : chaque requête attend sa réponse (`requestId`), avec un délai maximal. */
export function createRoomForgeApi(send: (msg: ForgeMessage) => void, onReply: (cb: (r: ForgeReply) => void) => void): ForgeApi {
  let nextId = 1;
  const waiting = new Map<number, { resolve(c: CharacterDetail): void; reject(e: Error): void; timer: ReturnType<typeof setTimeout> }>();

  onReply((r) => {
    const w = waiting.get(r.requestId);
    if (!w) return;
    waiting.delete(r.requestId);
    clearTimeout(w.timer);
    if (r.ok) w.resolve(r.character);
    else w.reject(new ApiError(400, r.error, r.message));
  });

  const request = (weapon: WeaponType, action: ForgeMessage['action']) =>
    new Promise<CharacterDetail>((resolve, reject) => {
      const requestId = nextId++;
      const timer = setTimeout(() => {
        waiting.delete(requestId);
        reject(new ApiError(0, 'NETWORK', 'Impossible de joindre le serveur'));
      }, TIMEOUT_MS);
      waiting.set(requestId, { resolve, reject, timer });
      send({ requestId, weapon, action });
    });

  return {
    upgradeWeapon: (_id, type) => request(type, { kind: 'upgrade' }),
    enchantWeapon: (_id, type, slot, element) => request(type, { kind: 'enchant', slot, element }),
  };
}
