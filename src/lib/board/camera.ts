import * as THREE from "three";

export type FitBox = { w: number; h: number; depth: number };

/**
 * How far along `dir` a perspective camera must sit (looking at the origin) so an axis-aligned
 * w × h × depth box centred on the origin fits the view, with `margin` to spare.
 * Projects all eight corners, so it is exact for any angle — flat boards and tall boxes alike.
 */
export function fitDistance(dir: THREE.Vector3, up: THREE.Vector3, box: FitBox, fovDeg: number, aspect: number, margin = 1.1): number {
  const z = dir.clone().normalize();
  const x = new THREE.Vector3().crossVectors(up, z);
  // Looking straight along `up`: nudge the way three.js's lookAt does, so the axes match the real camera.
  if (x.lengthSq() < 1e-10) {
    if (Math.abs(up.z) === 1) z.x += 1e-4;
    else z.z += 1e-4;
    x.crossVectors(up, z.normalize());
  }
  x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  const tanV = Math.tan(THREE.MathUtils.degToRad(fovDeg / 2)) / margin;
  const tanH = tanV * Math.max(0.1, aspect);
  const p = new THREE.Vector3();
  let d = 0;
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        p.set((sx * box.w) / 2, (sy * box.h) / 2, (sz * box.depth) / 2);
        const along = p.dot(z);
        d = Math.max(d, along + Math.abs(p.dot(x)) / tanH, along + Math.abs(p.dot(y)) / tanV);
      }
  return d;
}

/** The viewer's camera presets. Angled is the default three-quarter view; Side looks at the front edge, a little raised. */
export type CameraView = "iso" | "top" | "side" | "bottom";

export const VIEW_LABEL: Record<CameraView, string> = { iso: "Angled", top: "Top", side: "Side", bottom: "Bottom" };

/** Where the camera looks from (unit vector towards the camera) and which way is up, for a z-up board. */
export function viewDirection(view: CameraView): { dir: THREE.Vector3; up: THREE.Vector3 } {
  // Top and bottom sit a hair off the pole, where OrbitControls would leave them anyway.
  const d: [number, number, number] = view === "top" ? [0, -1e-4, 1] : view === "bottom" ? [0, 1e-4, -1] : view === "side" ? [0, -1, 0.22] : [0.55, -0.75, 0.6];
  return { dir: new THREE.Vector3(...d).normalize(), up: new THREE.Vector3(0, 0, view === "bottom" ? -1 : 1) };
}
