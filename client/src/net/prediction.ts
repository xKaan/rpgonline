import {
  MAX_INPUT_DT,
  decodeKeys,
  encodeKeys,
  stepMotion,
  type InputMessage,
  type MotionOptions,
  type MoveInput,
  type Obstacle,
  type PlayerMotion,
} from '@rpg/shared';

/** au-delà, on téléporte au lieu de lisser */
const SNAP_DISTANCE = 3;
/** constante de temps du lissage des corrections (s) */
const SMOOTH_TIME = 0.1;
const MAX_PENDING = 240;

export interface ServerMotion extends PlayerMotion {
  ackSeq: number;
}

/**
 * Prédiction locale du joueur : chaque entrée est appliquée tout de suite avec le même `stepMotion`
 * que le serveur, puis rejouée par-dessus chaque état serveur à partir de la dernière entrée acquittée.
 */
export class Predictor {
  motion: PlayerMotion;
  /** écart visuel restant après une correction, résorbé progressivement */
  offsetX = 0;
  offsetZ = 0;
  private pending: InputMessage[] = [];
  private seq = 0;

  constructor(
    start: PlayerMotion,
    private readonly obstacles: readonly Obstacle[],
  ) {
    this.motion = start;
  }

  /** Applique une entrée localement ; renvoie le message à envoyer au serveur. */
  step(input: MoveInput, yaw: number, dt: number, opts: MotionOptions): InputMessage {
    const msg: InputMessage = { seq: ++this.seq, dt: Math.min(dt, MAX_INPUT_DT), yaw, keys: encodeKeys(input) };
    this.motion = stepMotion(this.motion, input, yaw, msg.dt, this.obstacles, opts);
    this.pending.push(msg);
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    return msg;
  }

  reconcile(server: ServerMotion, opts: MotionOptions): void {
    this.pending = this.pending.filter((p) => p.seq > server.ackSeq);
    let m: PlayerMotion = {
      x: server.x,
      z: server.z,
      facing: server.facing,
      rollTime: server.rollTime,
      rollCooldown: server.rollCooldown,
      rollDirX: server.rollDirX,
      rollDirZ: server.rollDirZ,
    };
    for (const p of this.pending) m = stepMotion(m, decodeKeys(p.keys), p.yaw, p.dt, this.obstacles, opts);
    const ex = this.motion.x + this.offsetX - m.x;
    const ez = this.motion.z + this.offsetZ - m.z;
    if (Math.hypot(ex, ez) > SNAP_DISTANCE) {
      this.offsetX = 0;
      this.offsetZ = 0;
    } else {
      this.offsetX = ex;
      this.offsetZ = ez;
    }
    this.motion = m;
  }

  /** Résorbe l'écart visuel ; à appeler à chaque image. */
  decay(dt: number): void {
    const k = Math.exp(-dt / SMOOTH_TIME);
    this.offsetX *= k;
    this.offsetZ *= k;
  }

  get renderX(): number {
    return this.motion.x + this.offsetX;
  }

  get renderZ(): number {
    return this.motion.z + this.offsetZ;
  }

  get pendingCount(): number {
    return this.pending.length;
  }
}
