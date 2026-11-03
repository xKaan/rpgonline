export const CAMERA_DISTANCE = 6;
export const TARGET_HEIGHT = 2;
export const PITCH_MIN = -0.2;
export const PITCH_MAX = 1.1;

/** Position de la caméra relative à la cible ; yaw 0 = derrière le joueur côté +Z, regardant vers −Z. */
export function cameraOffset(yaw: number, pitch: number, distance: number): { x: number; y: number; z: number } {
  return {
    x: Math.sin(yaw) * Math.cos(pitch) * distance,
    y: Math.sin(pitch) * distance,
    z: Math.cos(yaw) * Math.cos(pitch) * distance,
  };
}

export function clampPitch(pitch: number): number {
  return Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch));
}

/** rotation.y qui fait regarder le modèle dans la direction visée par la caméra */
export function aimFacing(yaw: number): number {
  return yaw + Math.PI;
}
