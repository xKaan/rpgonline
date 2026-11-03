import { Client, type Room } from '@colyseus/sdk';
import {
  DEFAULT_GAME_PORT,
  MSG,
  RUN_ROOM,
  type BonusId,
  type ForgeReply,
  type InputMessage,
  type RunOverMessage,
  type RunStateView,
  type WeaponType,
} from '@rpg/shared';
import { ApiError } from '../api';
import { createRoomForgeApi, type ForgeApi } from './forgeApi';

export function gameEndpoint(): string {
  const configured = import.meta.env.VITE_GAME_URL as string | undefined;
  return configured ?? `${location.protocol}//${location.hostname}:${DEFAULT_GAME_PORT}`;
}

export interface RunConnection {
  readonly sessionId: string;
  readonly state: RunStateView;
  readonly forge: ForgeApi;
  sendInput(msg: InputMessage): void;
  attack(yaw: number, pressed: boolean): void;
  setWeapon(type: WeaponType): void;
  chooseBonus(id: BonusId): void;
  pause(paused: boolean): void;
  ready(): void;
  onStateChange(cb: () => void): void;
  onRunOver(cb: (m: RunOverMessage) => void): void;
  /** fermeture non demandée (serveur arrêté, réseau coupé) */
  onDisconnect(cb: () => void): void;
  leave(): void;
}

/** Rejoint une nouvelle run ; les refus du serveur deviennent des `ApiError` affichables. */
export async function connectRun(token: string, characterId: number, endpoint = gameEndpoint()): Promise<RunConnection> {
  let room: Room<unknown, RunStateView>;
  try {
    room = (await new Client(endpoint).create(RUN_ROOM, { token, characterId })) as Room<unknown, RunStateView>;
  } catch (e) {
    const err = e as { code?: number; message?: string };
    if (typeof err.code === 'number' && err.code >= 400 && err.code < 500) throw new ApiError(err.code, 'JOIN_REFUSED', err.message ?? 'Connexion refusée');
    throw new ApiError(0, 'NETWORK', 'Impossible de joindre le serveur de jeu');
  }

  let leaving = false;
  const disconnectListeners: (() => void)[] = [];
  room.onLeave(() => {
    if (!leaving) for (const cb of disconnectListeners) cb();
  });
  const forge = createRoomForgeApi(
    (msg) => room.send(MSG.forge, msg),
    (cb) => room.onMessage(MSG.forgeReply, (r: ForgeReply) => cb(r)),
  );

  return {
    sessionId: room.sessionId,
    get state() {
      return room.state;
    },
    forge,
    sendInput: (msg) => room.send(MSG.input, msg),
    attack: (yaw, pressed) => room.send(MSG.attack, { yaw, pressed }),
    setWeapon: (type) => room.send(MSG.weapon, { type }),
    chooseBonus: (id) => room.send(MSG.bonus, { id }),
    pause: (paused) => room.send(MSG.pause, { paused }),
    ready: () => room.send(MSG.ready),
    onStateChange: (cb) => {
      room.onStateChange(() => cb());
    },
    onRunOver: (cb) => {
      room.onMessage(MSG.runOver, (m: RunOverMessage) => cb(m));
    },
    onDisconnect: (cb) => disconnectListeners.push(cb),
    leave: () => {
      leaving = true;
      void room.leave().catch(() => undefined);
    },
  };
}
