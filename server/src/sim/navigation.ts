import { MAP_HALF_SIZE, type Obstacle, type Vec2 } from '@rpg/shared';

const CELL = 1;
const SIZE = Math.ceil((MAP_HALF_SIZE * 2) / CELL);
const UNREACHABLE = 0xffff;
const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/**
 * Champ de flux sur une grille de 1 m : distance (BFS) jusqu'au joueur le plus proche,
 * recalculé de temps en temps et partagé par tous les monstres.
 */
export class FlowField {
  private readonly blocked = new Uint8Array(SIZE * SIZE);
  private readonly dist = new Uint16Array(SIZE * SIZE).fill(UNREACHABLE);
  private readonly queue = new Int32Array(SIZE * SIZE);

  constructor(obstacles: readonly Obstacle[], clearance = 0.4) {
    for (let cz = 0; cz < SIZE; cz++) {
      for (let cx = 0; cx < SIZE; cx++) {
        const x = cellCenter(cx);
        const z = cellCenter(cz);
        if (obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.radius + clearance)) this.blocked[cz * SIZE + cx] = 1;
      }
    }
  }

  compute(targets: readonly Vec2[]): void {
    this.dist.fill(UNREACHABLE);
    let head = 0;
    let tail = 0;
    for (const t of targets) {
      const i = cellIndex(t.x, t.z);
      if (this.dist[i] === 0) continue;
      this.dist[i] = 0;
      this.queue[tail++] = i;
    }
    while (head < tail) {
      const i = this.queue[head++];
      const cx = i % SIZE;
      const cz = (i - cx) / SIZE;
      const d = this.dist[i] + 1;
      for (let k = 0; k < 4; k++) {
        const nx = cx + NEIGHBOURS[k][0];
        const nz = cz + NEIGHBOURS[k][1];
        if (nx < 0 || nz < 0 || nx >= SIZE || nz >= SIZE) continue;
        const n = nz * SIZE + nx;
        if (this.blocked[n] || this.dist[n] <= d) continue;
        this.dist[n] = d;
        this.queue[tail++] = n;
      }
    }
  }

  isBlocked(x: number, z: number): boolean {
    return this.blocked[cellIndex(x, z)] === 1;
  }

  /** Direction normalisée vers la cellule voisine la plus proche de la cible, ou `null` si inconnue. */
  direction(x: number, z: number): Vec2 | null {
    const i = cellIndex(x, z);
    const cx = i % SIZE;
    const cz = (i - cx) / SIZE;
    let best = this.dist[i];
    let bx = 0;
    let bz = 0;
    for (const [dx, dz] of NEIGHBOURS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= SIZE || nz >= SIZE) continue;
      const n = nz * SIZE + nx;
      if (this.blocked[n]) continue;
      // pas de diagonale qui coupe un coin bloqué
      if (dx !== 0 && dz !== 0 && (this.blocked[cz * SIZE + nx] || this.blocked[nz * SIZE + cx])) continue;
      if (this.dist[n] < best) {
        best = this.dist[n];
        bx = dx;
        bz = dz;
      }
    }
    if (bx === 0 && bz === 0) return null;
    const tx = cellCenter(cx + bx) - x;
    const tz = cellCenter(cz + bz) - z;
    const len = Math.hypot(tx, tz) || 1;
    return { x: tx / len, z: tz / len };
  }
}

function cellCenter(c: number): number {
  return -MAP_HALF_SIZE + (c + 0.5) * CELL;
}

function cellIndex(x: number, z: number): number {
  const clamp = (v: number) => Math.min(SIZE - 1, Math.max(0, Math.floor((v + MAP_HALF_SIZE) / CELL)));
  return clamp(z) * SIZE + clamp(x);
}
