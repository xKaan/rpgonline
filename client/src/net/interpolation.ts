/** retard de rendu des entités distantes (ms) */
export const INTERP_DELAY = 100;
const MAX_SNAPSHOTS = 8;

export interface Pose {
  x: number;
  z: number;
  facing: number;
}

interface Snapshot extends Pose {
  t: number;
}

function lerpAngle(a: number, b: number, k: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

/** Tampon de positions reçues pour une entité ; échantillonné dans le passé pour un rendu fluide. */
export class SnapshotBuffer {
  private readonly snaps: Snapshot[] = [];

  push(t: number, pose: Pose): void {
    const last = this.snaps[this.snaps.length - 1];
    if (last && last.x === pose.x && last.z === pose.z && last.facing === pose.facing) {
      last.t = t;
      return;
    }
    if (last && t <= last.t) return;
    this.snaps.push({ t, ...pose });
    if (this.snaps.length > MAX_SNAPSHOTS) this.snaps.shift();
  }

  sample(t: number): Pose | null {
    const s = this.snaps;
    if (s.length === 0) return null;
    if (t <= s[0].t) return { x: s[0].x, z: s[0].z, facing: s[0].facing };
    for (let i = s.length - 1; i > 0; i--) {
      const a = s[i - 1];
      const b = s[i];
      if (t >= a.t && t <= b.t) {
        const k = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
        return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, facing: lerpAngle(a.facing, b.facing, k) };
      }
    }
    const last = s[s.length - 1];
    return { x: last.x, z: last.z, facing: last.facing };
  }
}
