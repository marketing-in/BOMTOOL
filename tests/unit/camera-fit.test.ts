import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { VIEW_LABEL, fitDistance, viewDirection } from "@/lib/board/camera";

const UP = new THREE.Vector3(0, 0, 1);

/** Every corner of the box, projected by a real three.js camera, lands inside the frame. */
function allCornersVisible(dir: THREE.Vector3, box: { w: number; h: number; depth: number }, fov: number, aspect: number) {
  const d = fitDistance(dir, UP, box, fov, aspect);
  const cam = new THREE.PerspectiveCamera(fov, aspect, 0.1, 10000);
  cam.position.copy(dir.clone().normalize().multiplyScalar(d));
  cam.up.copy(UP);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  let worst = 0;
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        const v = new THREE.Vector3((sx * box.w) / 2, (sy * box.h) / 2, (sz * box.depth) / 2).project(cam);
        worst = Math.max(worst, Math.abs(v.x), Math.abs(v.y));
      }
  return { d, worst };
}

// The viewer's top view: a hair off the pole, toward -y, as OrbitControls leaves it.
const TOP = new THREE.Vector3(0, -1e-4, 1);

describe("fitDistance", () => {
  it("fits a flat board seen from the top, with the margin to spare", () => {
    const { d, worst } = allCornersVisible(TOP, { w: 100, h: 80, depth: 2 }, 32, 1.2);
    expect(worst).toBeLessThanOrEqual(1);
    // A 10% margin means the widest corner sits at about 1/1.1 of the frame.
    expect(worst).toBeGreaterThan(0.85);
    expect(d).toBeGreaterThan(100);
  });

  it("matches three.js when looking exactly down the up axis", () => {
    const { worst } = allCornersVisible(new THREE.Vector3(0, 0, 1), { w: 100, h: 80, depth: 2 }, 32, 1.2);
    expect(worst).toBeLessThanOrEqual(1);
    expect(worst).toBeGreaterThan(0.85);
  });

  it("backs off for a tall box seen from an angle", () => {
    const iso = new THREE.Vector3(0.55, -0.75, 0.6);
    const flat = allCornersVisible(iso, { w: 160, h: 110, depth: 2 }, 32, 1.2);
    const tall = allCornersVisible(iso, { w: 160, h: 110, depth: 90 }, 32, 1.2);
    expect(flat.worst).toBeLessThanOrEqual(1);
    expect(tall.worst).toBeLessThanOrEqual(1);
    expect(tall.d).toBeGreaterThan(flat.d);
  });

  it("accounts for a narrow (portrait) canvas", () => {
    const wide = allCornersVisible(TOP, { w: 100, h: 80, depth: 2 }, 32, 1.6);
    const phone = allCornersVisible(TOP, { w: 100, h: 80, depth: 2 }, 32, 0.5);
    expect(phone.worst).toBeLessThanOrEqual(1);
    expect(phone.d).toBeGreaterThan(wide.d * 1.5);
  });
});

describe("viewer camera presets", () => {
  it("looks down for Top, up for Bottom, at the front edge for Side", () => {
    expect(viewDirection("top").dir.z).toBeGreaterThan(0.99);
    expect(viewDirection("bottom").dir.z).toBeLessThan(-0.99);
    expect(viewDirection("bottom").up.z).toBe(-1);
    const side = viewDirection("side").dir;
    expect(side.y).toBeLessThan(-0.9);
    expect(side.z).toBeGreaterThan(0.1);
    expect(side.z).toBeLessThan(0.4);
  });
  it("names every preset and returns unit vectors", () => {
    for (const v of ["iso", "top", "side", "bottom"] as const) {
      expect(VIEW_LABEL[v]).toBeTruthy();
      expect(viewDirection(v).dir.length()).toBeCloseTo(1, 6);
    }
    expect(VIEW_LABEL.iso).toBe("Angled");
  });
});
