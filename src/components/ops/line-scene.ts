import * as THREE from "three";
import { lookFrame } from "@/knowledge/machine-looks";
import { layoutLine, type LineItem } from "@/lib/ops/line-layout";
import { createLineModels, LINE_LAYOUT } from "@/vendor/circuitflow/factoryModels.js";
import { realMachine } from "./machine-3d";
import { createKit, type ScreenInfo } from "./machine-3d/kit";

/**
 * The 3D content of the Lines view, apart from the page around it: the machines of one line built and stood in
 * place, the lights, and where the camera looks from. The page (line-3d.tsx) draws from here.
 */

/** One machine of the line as the view needs it. */
export type Machine3D = { id: string; type: string; vendor: string; short: string; model: string; color: string; position: number };

/** 3D: turn the line freely. 2D: the floor plan from above, to scale. */
export type ViewMode = "3d" | "2d";

/** The colour behind the line on the page in light mode (bg-muted/60 over the card). */
export const STAGE_BACKGROUND = "#f5f5f4";

/** Conveyor pass height: the top of the belts (m). */
export const PASS_HEIGHT = LINE_LAYOUT.cy as number;

type GenericBuilt = { group: THREE.Group; lamps: THREE.Mesh[]; screen: { draw: (s: Record<string, string>) => void }; update: (t: number, busy: boolean, clock?: number) => void };
type Models = {
  machine: (id: string, o: { x: number; w: number; d: number; cy: number; roof?: boolean }) => GenericBuilt;
  link: (x0: number, x1: number, cy: number) => THREE.Group;
  dispose: () => void;
};

/** A machine standing on the line. x, w: its middle and length along the line; z0 … z1: its footprint from back to front, with what sticks out of the body. */
export type Unit = {
  id: string;
  m: Machine3D;
  /** Drawn as the real machine (false: the generic model). */
  real: boolean;
  group: THREE.Group;
  x: number;
  w: number;
  z0: number;
  z1: number;
  /** Highest point (m). */
  top: number;
  lamps: THREE.Mesh[];
  screen: { draw: (info: ScreenInfo) => void };
  update: (t: number, busy: boolean, clock: number) => void;
};

export type LineScene = {
  /** Everything of the line; its children are in line coordinates (x from 0 to length). */
  root: THREE.Group;
  units: Unit[];
  items: LineItem<Machine3D>[];
  length: number;
  /** What a click is tested against, and whose machine each object is. */
  targets: THREE.Object3D[];
  owner: Map<THREE.Object3D, string>;
  /** Bounding box of the solid parts, in the scene. */
  box: THREE.Box3;
  dispose: () => void;
};

/** The box of what is solid and shown: no sprites, no vapour, no hit boxes. */
export function solidBox(o: THREE.Object3D): THREE.Box3 {
  const b = new THREE.Box3();
  o.updateWorldMatrix(true, true);
  o.traverse((c) => {
    if (!(c as THREE.Mesh).isMesh || (c as unknown as THREE.Sprite).isSprite || c.userData.fx) return;
    for (let p: THREE.Object3D | null = c; p && p !== o.parent; p = p.parent) if (!p.visible) return;
    b.expandByObject(c, true);
  });
  return b;
}

/**
 * Build one line: every machine with a real look by its builder (one kit for the whole line), everything else by the
 * generic circuitflow models. Lamps and screens are set for a running or a waiting line.
 */
export function buildLine(machines: Machine3D[], running: boolean): LineScene {
  const models = createLineModels(THREE) as unknown as Models;
  const kit = createKit(THREE);
  const cy = PASS_HEIGHT;
  const root = new THREE.Group();
  const real = new Map(machines.map((m) => [m.id, realMachine(m.type, m.vendor, m.model)]));
  const { items, length } = layoutLine(machines, (m) => real.get(m.id)?.look ?? null);
  root.position.x = -length / 2;

  const units: Unit[] = [];
  const targets: THREE.Object3D[] = [];
  const owner = new Map<THREE.Object3D, string>();
  const hitMaterial = new THREE.MeshBasicMaterial();
  const hitGeometry = new THREE.BoxGeometry(1, 1, 1);

  const generic = (it: Extract<LineItem<Machine3D>, { kind: "real" | "generic" }>, id: string, w: number, d: number): Unit => {
    const built = models.machine(id, { x: it.x, w: w - 0.08, d, cy, roof: false });
    root.add(built.group);
    built.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) owner.set(o, it.m.id);
    });
    targets.push(built.group);
    return { id: it.m.id, m: it.m, real: false, group: built.group, x: it.x, w, z0: -d / 2, z1: d / 2, top: 0, lamps: built.lamps, screen: built.screen, update: built.update };
  };

  for (const it of items) {
    if (it.kind === "link") {
      root.add(models.link(it.x0, it.x1, cy));
      continue;
    }
    let unit: Unit | null = null;
    if (it.kind === "real") {
      try {
        const built = real.get(it.m.id)!.build(kit, cy);
        built.group.position.set(it.x, 0, 0);
        root.add(built.group);
        const f = lookFrame(it.look);
        // Clicks are tested against one box per real machine (its body and what stands in front and behind), not its thousands of triangles.
        const hit = new THREE.Mesh(hitGeometry, hitMaterial);
        hit.scale.set(f.l, f.h, f.box.z1 - f.box.z0);
        hit.position.set(it.x, f.h / 2, (f.box.z0 + f.box.z1) / 2);
        hit.visible = false;
        root.add(hit);
        owner.set(hit, it.m.id);
        targets.push(hit);
        unit = { id: it.m.id, m: it.m, real: true, group: built.group, x: it.x, w: it.w, z0: f.box.z0, z1: f.box.z1, top: 0, lamps: built.lamps, screen: built.screen, update: built.update };
      } catch (e) {
        // A builder that fails must not blank the line: draw the generic machine in its place.
        console.error(`Real model of ${it.m.vendor} ${it.m.model} failed; drawing the generic one.`, e);
      }
    }
    unit ??= it.kind === "generic" ? generic(it, it.spec.id, it.spec.w, it.spec.d) : generic(it, (LEGACY[it.m.type] ?? "spi") as string, it.w, LINE_LAYOUT.depth as number);
    unit.screen.draw({ name: it.m.short, state: running ? "Running" : "Waiting", board: "—", cycle: "—", done: "—" });
    unit.lamps.forEach((l, i) => ((l.material as THREE.MeshStandardMaterial).emissiveIntensity = i === (running ? 0 : 1) ? 1.6 : 0));
    units.push(unit);
  }
  root.updateMatrixWorld(true);
  for (const u of units) u.top = solidBox(u.group).max.y;

  return {
    root,
    units,
    items,
    length,
    targets,
    owner,
    box: solidBox(root),
    dispose: () => {
      root.traverse((o) => {
        if ((o as THREE.Mesh).geometry && !(o as unknown as THREE.Sprite).isSprite) (o as THREE.Mesh).geometry.dispose();
      });
      hitMaterial.dispose();
      hitGeometry.dispose();
      kit.dispose();
      models.dispose();
    },
  };
}

/** The generic model that stands in when a real builder fails. */
const LEGACY: Record<string, string> = { STENCIL_PRINTER: "printer", SPI: "spi", PICK_AND_PLACE: "pnp", REFLOW_OVEN: "reflow", AOI: "aoi", LASER_MARKER: "spi", BOARD_LOADER: "loader", OTHER: "spi" };

/** The page's lights and the shadow-catching floor, for a line of this length centred on the origin. */
export function lightLine(scene: THREE.Scene, length: number): { sun: THREE.DirectionalLight; dispose: () => void } {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(length + 6, 8), new THREE.ShadowMaterial({ opacity: 0.18 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  // Bright enough that a machine's paint reads as its paint: a face towards the operator comes out at about its own
  // colour, tops a little lighter, the ends in shade.
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb5b2aa, 2.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(length * 0.2, 9, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const half = length / 2 + 2;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: 4, bottom: -4, near: 0.1, far: 30 });
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  // A soft light from behind, so the back and the ends keep their shape when the view is turned. No shadow.
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(-6, 5, -8);
  scene.add(fill);
  return {
    sun,
    dispose: () => {
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
    },
  };
}

/** Where the camera stands to look at the line's centre: 3D from the operator's side and above, 2D straight down. */
export function cameraPosition(mode: ViewMode, center: THREE.Vector3, length: number): THREE.Vector3 {
  return mode === "2d" ? new THREE.Vector3(center.x, 40, center.z + 0.0001) : new THREE.Vector3(center.x + length * 0.12, 9, center.z + 14);
}

/** Scene units per pixel at which the whole line fits a w × h panel with its margin. */
export function fitScale(mode: ViewMode, size: THREE.Vector3, w: number, h: number): number {
  const spanX = (mode === "2d" ? size.x : size.x * 0.95) * 1.08;
  const spanY = (mode === "2d" ? size.z : size.y + size.z * 0.6) * 1.35;
  return Math.max(spanX / w, spanY / h);
}

/** Where a machine's number tag hangs: over it in 3D, behind it on the plan. */
export function tagPoint(u: Unit, mode: ViewMode, rootX: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(u.x + rootX, mode === "2d" ? 0 : u.top + 0.35, mode === "2d" ? u.z0 - 0.45 : 0);
}
