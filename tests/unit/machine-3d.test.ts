import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { LINES } from "../../prisma/seed-data/factory";
import { checkBuilt } from "@/components/ops/machine-3d/check";
import { BUDGET, RAIL, createKit } from "@/components/ops/machine-3d/kit";
import type { RealBuilder } from "@/components/ops/machine-3d/types";
import { LOOK_FAMILIES, lookFrame, lookMatches, type LookFamily, type MachineLook } from "@/knowledge/machine-looks/types";
import type { LayoutMachine } from "@/lib/ops/line-layout";
import { LINE_LAYOUT } from "@/vendor/circuitflow/factoryModels.js";

/**
 * The shared checks over every real machine look and its builder. Nothing here names a machine: a family that adds
 * a look and a builder is tested by adding them. Each family's two files are loaded on their own, so a family in the
 * middle of an edit fails its own tests and nobody else's: run one family with  -t "<family> ·".
 * Set MACHINE_LOOKS_STRICT=1 to also demand a real look for every machine on our lines (all six families landed).
 */

const CY = LINE_LAYOUT.cy as number;
const REAL_GAP = 0.08;
const seed = LINES.flatMap((l) => l.machines.map((m, i) => ({ id: `${l.code}-${i + 1}`, line: l.code, type: m.type as string, vendor: m.vendor, model: m.model })));
const name = (m: { vendor: string; model: string }) => `${m.vendor} ${m.model}`;
const ours = (look: MachineLook) => seed.filter((m) => lookMatches(look, m.type, m.vendor, m.model));

const FILES: Record<LookFamily, [() => Promise<Record<string, unknown>>, () => Promise<Record<string, unknown>>]> = {
  printers: [() => import("@/knowledge/machine-looks/printers"), () => import("@/components/ops/machine-3d/printers")],
  spi: [() => import("@/knowledge/machine-looks/spi"), () => import("@/components/ops/machine-3d/spi")],
  mounters: [() => import("@/knowledge/machine-looks/mounters"), () => import("@/components/ops/machine-3d/mounters")],
  reflow: [() => import("@/knowledge/machine-looks/reflow"), () => import("@/components/ops/machine-3d/reflow")],
  aoi: [() => import("@/knowledge/machine-looks/aoi"), () => import("@/components/ops/machine-3d/aoi")],
  handling: [() => import("@/knowledge/machine-looks/handling"), () => import("@/components/ops/machine-3d/handling")],
};
type Family = { family: LookFamily; looks: MachineLook[]; builders: Record<string, RealBuilder>; error: string | null };
const families: Family[] = await Promise.all(
  LOOK_FAMILIES.map(async (family): Promise<Family> => {
    const NAME = family.toUpperCase();
    try {
      const [l, b] = await Promise.all([FILES[family][0](), FILES[family][1]()]);
      const looks = l[`${NAME}_LOOKS`], builders = b[`${NAME}_BUILDERS`];
      if (!Array.isArray(looks)) throw new Error(`src/knowledge/machine-looks/${family}.ts must export ${NAME}_LOOKS: MachineLook[]`);
      if (!builders || typeof builders !== "object") throw new Error(`src/components/ops/machine-3d/${family}.ts must export ${NAME}_BUILDERS: Record<string, RealBuilder>`);
      return { family, looks: looks as MachineLook[], builders: builders as Record<string, RealBuilder>, error: null };
    } catch (e) {
      return { family, looks: [], builders: {}, error: e instanceof Error ? e.message : String(e) };
    }
  }),
);
const LOOKS = families.flatMap((f) => f.looks.map((look) => ({ f, look })));
const each = LOOKS.map(({ f, look }) => [`${f.family} · ${look.key}`, f, look] as const);

// The indexes and the layout import every family at once: loaded apart, so the tests above do not depend on them.
type Whole = typeof import("@/knowledge/machine-looks") & typeof import("@/components/ops/machine-3d") & typeof import("@/lib/ops/line-layout");
let W: Whole | null = null;
let wholeError: string | null = null;
try {
  W = { ...(await import("@/knowledge/machine-looks")), ...(await import("@/components/ops/machine-3d")), ...(await import("@/lib/ops/line-layout")) };
} catch (e) {
  wholeError = e instanceof Error ? e.message : String(e);
}

describe("machine looks (the facts)", () => {
  it.each(families.map((f) => [`${f.family} ·`, f] as const))("%s its two files load, keys are its own", (_n, f) => {
    expect(f.error, `the ${f.family} files`).toBeNull();
    for (const l of f.looks) expect(l.family, l.key).toBe(f.family);
    const keys = f.looks.map((l) => l.key);
    for (const key of Object.keys(f.builders)) expect(keys, `builder "${key}" has no look in src/knowledge/machine-looks/${f.family}.ts`).toContain(key);
  });

  it("keys are unique across the families", () => {
    const keys = LOOKS.map((x) => x.look.key);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });

  it.each(each)("%s: sane figures, paints and references", (_n, _f, l) => {
    expect(l.key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)+$/);
    expect(l.types.length).toBeGreaterThan(0);
    expect(() => new RegExp(l.match, "i")).not.toThrow();
    expect(l.name.length).toBeGreaterThan(3);
    const { l: len, d, h } = l.bodyMm;
    expect(len, "length").toBeGreaterThanOrEqual(300);
    expect(len, "length").toBeLessThanOrEqual(8000);
    expect(d, "depth").toBeGreaterThanOrEqual(400);
    expect(d, "depth").toBeLessThanOrEqual(3000);
    expect(h, "height").toBeGreaterThanOrEqual(700);
    expect(h, "height").toBeLessThanOrEqual(2600);
    if (l.bodyMm.source === "estimate") expect(l.bodyMm.note, "an estimate says how it was made").toBeTruthy();
    if (l.railFromFrontMm !== null) {
      expect(l.railFromFrontMm).toBeGreaterThan(0);
      expect(l.railFromFrontMm).toBeLessThan(d);
    }
    for (const v of Object.values(l.reachMm)) {
      expect(v, "reach").toBeGreaterThanOrEqual(0);
      expect(v, "reach").toBeLessThanOrEqual(1600);
    }
    expect(Object.keys(l.livery).length, "livery").toBeGreaterThan(0);
    for (const [role, hex] of Object.entries(l.livery)) expect(hex, `livery.${role}`).toMatch(/^#[0-9a-f]{6}$/i);
    expect(l.features.length, "features").toBeGreaterThan(0);
    expect(l.refs.length, "refs").toBeGreaterThan(0);
    for (const r of l.refs) {
      // A reference names a document and a page, or a public page: never a file on somebody's computer.
      expect(`${r.label} ${r.url ?? ""}`, "ref").not.toMatch(/\/Users\/|\/private\/|\/tmp\/|scratchpad|Downloads|[A-Z]:\\|file:\/\//i);
      if (r.url) expect(r.url, "ref").toMatch(/^https:\/\//);
    }
    // It draws at least one machine of ours.
    expect(ours(l).length, `${l.key} matches none of our machines`).toBeGreaterThan(0);
  });

  it("no machine on our lines is matched by two looks", () => {
    for (const m of seed) {
      const matching = LOOKS.filter(({ look }) => lookMatches(look, m.type, m.vendor, m.model)).map(({ look }) => look.key);
      expect(matching.length, `${m.line} ${name(m)} is matched by ${matching.join(" and ")}`).toBeLessThanOrEqual(1);
    }
  });

  it("cover our lines (all of them under MACHINE_LOOKS_STRICT=1)", () => {
    const missing = [...new Set(seed.filter((m) => !LOOKS.some(({ look }) => lookMatches(look, m.type, m.vendor, m.model))).map(name))];
    if (process.env.MACHINE_LOOKS_STRICT) expect(missing).toEqual([]);
    else if (missing.length) console.info(`No real look yet for: ${missing.join(" · ")}`);
    expect(LOOKS.length).toBeGreaterThan(0);
  });
});

describe("real machine builders (the contract)", () => {
  it.each(each)("%s: builds in node, stays in its box at every phase, within budget", (_n, f, look) => {
    const builder = f.builders[look.key];
    expect(builder, `no builder "${look.key}" in src/components/ops/machine-3d/${f.family}.ts`).toBeTypeOf("function");
    // Every machine of ours this look draws: the builder may vary by the model's name.
    const variants = [...new Map(ours(look).map((m) => [name(m), m])).values()];
    for (const m of variants) {
      const K = createKit(THREE);
      const built = builder(K, { look, cy: CY, vendor: m.vendor, model: m.model });
      expect(built.group.position.length(), `${name(m)}: the caller places the group`).toBe(0);
      expect(checkBuilt(K, look, built, CY), name(m)).toEqual([]);
      const s = K.stats(built.group);
      expect(s.drawCalls, `${name(m)} draw calls`).toBeLessThanOrEqual(BUDGET.drawCalls);
      expect(s.triangles, `${name(m)} triangles`).toBeLessThanOrEqual(BUDGET.triangles);
      // update() may be called any number of times: the scene graph does not grow.
      let before = 0, after = 0;
      built.group.traverse(() => before++);
      for (let i = 0; i < 20; i++) built.update(i * 0.37, true, i * 0.37);
      built.group.traverse(() => after++);
      expect(after, `${name(m)}: update() added objects`).toBe(before);
      K.dispose();
    }
  });
});

describe("the kit", () => {
  const outward = (mesh: THREE.Mesh) => {
    // On a convex part every triangle faces away from the middle, and its normals agree with its winding.
    const g = mesh.geometry, p = g.attributes.position, n = g.attributes.normal;
    g.computeBoundingBox();
    const c = g.boundingBox!.getCenter(new THREE.Vector3());
    const ix = g.index ? Array.from(g.index.array) : Array.from({ length: p.count }, (_, i) => i);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), nn = new THREE.Vector3();
    let bad = 0;
    for (let i = 0; i < ix.length; i += 3) {
      a.fromBufferAttribute(p, ix[i]);
      b.fromBufferAttribute(p, ix[i + 1]);
      d.fromBufferAttribute(p, ix[i + 2]);
      const face = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
      if (face.length() < 1e-12) continue;
      const mid = new THREE.Vector3().add(a).add(b).add(d).divideScalar(3).sub(c);
      if (face.dot(mid) <= 0) bad++;
      for (const k of [ix[i], ix[i + 1], ix[i + 2]]) if (nn.fromBufferAttribute(n, k).dot(face) <= 0) bad++;
    }
    return bad;
  };

  it("extrudes outlines the right way out, with rounded corners inside the box", () => {
    const K = createKit(THREE), g = K.group();
    const hood = K.profileX([[-0.4, 0.9], [0.4, 0.9], [0.4, 1.2, 0.05], [0.1, 1.5, 0.08], [-0.4, 1.5, 0.03]], 2, K.M.white, 0, 0, 0, g);
    const front = K.profileZ([[-0.3, 0], [0.3, 0], [0.3, 0.2], [-0.3, 0.4, 0.05]], 0.5, K.M.white, 0, 0, 0, g);
    const plan = K.profileY([[-0.3, -0.2, 0.05], [0.3, -0.2, 0.05], [0.3, 0.2], [-0.3, 0.2]], 0.7, K.M.white, 0, 0.1, 0, g);
    const round = K.rbox(1, 0.6, 0.4, 0.05, K.M.white, 0, 0, 0, g, "x");
    for (const m of [hood, front, plan, round]) expect(outward(m)).toBe(0);
    // A bent sheet keeps its thickness and thickens to the left of the path: here, downwards and inwards.
    const lip = K.bendX([[0.4, 1], [0.4, 1.3, 0.1], [-0.2, 1.3]], 0.02, 1, K.M.white, 0, 0, 0, g);
    const lb = new THREE.Box3().setFromObject(lip, true);
    expect([lb.min.z, lb.max.z, lb.min.y, lb.max.y].map((v) => +v.toFixed(4))).toEqual([-0.2, 0.4, 1, 1.3]);
    const hit = (from: number, dir: number) => new THREE.Raycaster(new THREE.Vector3(0, 1.1, from), new THREE.Vector3(0, 0, dir)).intersectObject(lip, false).map((h) => +h.point.z.toFixed(4));
    expect(hit(2, -1)).toEqual([0.4]);
    expect(hit(0, 1)).toEqual([0.38]);
    expect(outward(K.bendX([[0.4, 1], [0.4, 1.3]], 0.02, 1, K.M.white, 0, 0, 0, g))).toBe(0);
    // An arc given point by point is shaded as a curve: its normals follow the radius, not the facets.
    const dome = K.profileX([[-0.2, 0], [0.2, 0], ...K.arc(0, 0, 0.2, 0, 180, 12)], 1, K.M.white, 0, 0, 0, g);
    const dp = dome.geometry.attributes.position, dn = dome.geometry.attributes.normal;
    let radial = 0, curved = 0;
    for (let i = 0; i < dp.count; i++) {
      if (dp.getY(i) < 0.05 || Math.abs(dn.getX(i)) > 0.5) continue;
      curved++;
      if (Math.abs(dn.getZ(i) * 0.2 - dp.getZ(i)) < 0.02 && Math.abs(dn.getY(i) * 0.2 - dp.getY(i)) < 0.02) radial++;
    }
    expect(curved).toBeGreaterThan(20);
    expect(radial).toBe(curved);
    const b = (m: THREE.Mesh) => new THREE.Box3().setFromObject(m, true);
    expect(b(hood).min.toArray().map((v) => +v.toFixed(4))).toEqual([-1, 0.9, -0.4]);
    expect(b(hood).max.toArray().map((v) => +v.toFixed(4))).toEqual([1, 1.5, 0.4]);
    expect(b(plan).min.y).toBeCloseTo(0.1);
    expect(b(plan).max.y).toBeCloseTo(0.8);
    expect(b(round).getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(4))).toEqual([1, 0.6, 0.4]);
    K.dispose();
  });

  it("makes each material once, and lamps their own", () => {
    const K = createKit(THREE), g = K.group();
    expect(K.paint("#e9e6dc")).toBe(K.paint("#E9E6DC"));
    expect(K.paint("#e9e6dc")).not.toBe(K.paint("#e9e6dc", { finish: "gloss" }));
    expect(K.glass()).toBe(K.glass());
    expect(K.lit(0xff0000, 1, true)).not.toBe(K.lit(0xff0000, 1, true));
    const lamps = K.tower(g, 0, 1, 0);
    expect(lamps).toHaveLength(3);
    expect(new Set(lamps.map((l) => l.material)).size).toBe(3);
    expect(lamps[0].position.y).toBeLessThan(lamps[2].position.y);
    // A tower in another order still answers [green, amber, red]; a missing colour gets a hidden lamp.
    const odd = K.tower(g, 1, 1, 0, { order: ["red", "green"] });
    expect(odd[0].position.y).toBeGreaterThan(odd[2].position.y);
    expect(odd[1].visible).toBe(false);
    const twin = K.tower(g, 2, 1, 0, { share: lamps });
    expect(twin.map((l) => l.material)).toEqual(lamps.map((l) => l.material));
    expect(K.pilots(g, 0, 1, 0.2)).toHaveLength(3);
    K.dispose();
  });

  it("mounts fittings on any face, built outwards", () => {
    const K = createKit(THREE), root = K.group();
    const out = (face: Parameters<typeof K.on>[1]) => new THREE.Vector3(0, 0, 1).applyQuaternion(K.on(root, face).quaternion).toArray().map((v) => Math.round(v));
    expect(out("front")).toEqual([0, 0, 1]);
    expect(out("back")).toEqual([0, 0, -1]);
    expect(out("right")).toEqual([1, 0, 0]);
    expect(out("left")).toEqual([-1, 0, 0]);
    expect(out("top")).toEqual([0, 1, 0]);
    // An e-stop on the right-hand end stands out along +x and nowhere else.
    const g = K.group();
    K.estop(g, 0.5, 1, 0, { face: "right" });
    const b = K.stats(g).box;
    expect(b.min.x).toBeCloseTo(0.5, 3);
    expect(b.max.x).toBeGreaterThan(0.53);
    // Lettering lies 1.5 mm off its surface and reads left to right as seen from outside.
    const label = K.decal(g, "YAMAHA", 0.3, 0.05, 0, 1, 0.4, { color: "#d0021b" });
    expect(label.position.z).toBeCloseTo(0.4015, 4);
    const back = K.decal(g, "REAR", 0.3, 0.05, 0, 1, -0.4, { face: "back" });
    expect(back.position.z).toBeCloseTo(-0.4015, 4);
    expect(new THREE.Vector3(1, 0, 0).applyQuaternion(back.quaternion).x).toBeCloseTo(-1);
    K.dispose();
  });

  it("lays the shared conveyor through the whole body, belts at pass height", () => {
    const K = createKit(THREE), g = K.group();
    const r = K.conveyorRails(g, 1.4, CY);
    expect(r.x0).toBeCloseTo(-0.7 - RAIL.overhang);
    expect(r.x1).toBeCloseTo(0.7 + RAIL.overhang);
    const b = K.stats(g).box;
    expect(b.max.y).toBeCloseTo(CY + RAIL.lip, 4);
    expect(b.max.z).toBeCloseTo(RAIL.gap / 2 + RAIL.railT, 4);
    // Two neighbours REAL_GAP apart: their rails meet.
    expect(2 * RAIL.overhang).toBeCloseTo(REAL_GAP);
    // An end wall leaves the board a real way in.
    const w = K.group();
    K.endWall(w, "left", -0.7, { zFront: 0.5, zBack: -0.5, y0: 0.8, y1: 1.3, cy: CY, mat: K.M.white, frame: null });
    const ray = new THREE.Raycaster(new THREE.Vector3(-2, CY + 0.02, 0), new THREE.Vector3(1, 0, 0));
    w.updateMatrixWorld(true);
    expect(ray.intersectObject(w, true)).toHaveLength(0);
    ray.set(new THREE.Vector3(-2, CY + 0.2, 0), new THREE.Vector3(1, 0, 0));
    expect(ray.intersectObject(w, true).length).toBeGreaterThan(0);
    K.dispose();
  });

  it("draws a bank of forty feeders with their reels in a handful of meshes", () => {
    const K = createKit(THREE), g = K.group();
    const bank = K.feederBank(g, 0, 0.9, 0.5, { count: 40 });
    const s = K.stats(g);
    expect(s.drawCalls).toBeLessThanOrEqual(8);
    expect(s.triangles).toBeLessThan(12_000);
    expect(bank.width).toBeCloseTo(40 * 0.017);
    expect(s.box.max.z).toBeLessThanOrEqual(0.5 + bank.out + 1e-6);
    expect(s.box.min.z).toBeGreaterThanOrEqual(0.5 - 1e-6);
    // A rear bank runs the other way.
    const rear = K.group();
    K.feederBank(rear, 0, 0.9, -0.5, { count: 8, dir: -1 });
    expect(K.stats(rear).box.max.z).toBeLessThanOrEqual(-0.5 + 1e-6);
    K.dispose();
  });

  it("seals what stands still into one mesh per material and leaves the moving parts moving", () => {
    const K = createKit(THREE), g = K.group();
    const body = K.paint("#e9e6dc");
    for (let i = 0; i < 30; i++) K.box(0.1, 0.1, 0.1, body, i * 0.11, 0.05, 0, g);
    for (let i = 0; i < 10; i++) K.cyl(0.02, 0.1, K.M.steel, i * 0.11, 0.15, 0, g);
    const mirrored = K.group(g, 0, 0.4, 0);
    mirrored.scale.x = -1;
    K.profileZ([[0, 0], [0.2, 0], [0, 0.1]], 0.1, body, 0, 0, 0, mirrored);
    const lamps = K.tower(g, 0, 0.2, 0);
    const head = K.group(g, 0, 0.5, 0);
    for (let i = 0; i < 12; i++) K.cyl(0.005, 0.05, K.M.steel, i * 0.01, 0, 0, head);
    K.box(0.2, 0.05, 0.05, K.M.dark, 0.05, 0.05, 0, head);
    const hidden = K.box(0.1, 0.1, 0.1, body, 0, 5, 0, g);
    hidden.visible = false;
    const before = K.stats(g);
    const sealed = K.seal(g, [head]);
    const after = K.stats(g);
    expect(before.drawCalls).toBeGreaterThan(55);
    // body, steel, the tower's dark and pole, three lamps; the head: steel and dark.
    expect(sealed.drawCalls).toBe(after.drawCalls);
    expect(after.drawCalls).toBeLessThanOrEqual(10);
    expect(after.triangles).toBe(before.triangles);
    for (const k of ["min", "max"] as const) expect(after.box[k].distanceTo(before.box[k])).toBeLessThan(1e-5);
    // Lamps keep their own meshes and materials; the hidden part was not merged in and stays hidden.
    for (const l of lamps) expect(l.parent, "a lamp left the scene").toBeTruthy();
    expect(hidden.visible).toBe(false);
    // The mirrored part still faces out.
    const merged = g.children.find((c) => (c as THREE.Mesh).isMesh && (c as THREE.Mesh).material === body) as THREE.Mesh;
    const p = merged.geometry.attributes.position, n = merged.geometry.attributes.normal, ix = merged.geometry.index!;
    let flipped = 0;
    for (let i = 0; i < ix.count; i += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, ix.getX(i + k)));
      const face = b.sub(a).cross(c.sub(a));
      if (face.dot(new THREE.Vector3().fromBufferAttribute(n, ix.getX(i))) < 0) flipped++;
    }
    expect(flipped).toBe(0);
    // The head still moves as one.
    head.position.x = 3;
    expect(K.stats(g).box.max.x).toBeGreaterThan(3);
    K.dispose();
  });

  it("is safe without a browser: lettering, screens and smoke fall back", () => {
    const K = createKit(THREE), g = K.group();
    const a = K.decal(g, "TW-VP860N", 0.4, 0.06, 0, 1, 0), b = K.warning(g, 0.1, 0, 1.2, 0), c = K.nameplate(g, ["MAKER", "MODEL"], 0.1, 0.06, 0, 1.4, 0);
    // All lettering shares one material: one draw call after sealing.
    expect(new Set([a.material, b.material, c.material]).size).toBe(1);
    const s = K.screen(g, 0, 1.6, 0);
    expect(() => s.draw({ name: "Printer", state: "Running", board: "—", cycle: "—", done: "—" })).not.toThrow();
    const arm = K.monitorArm(g, 0.5, 1.2, 0.3);
    expect(arm.out).toBeGreaterThan(0.3);
    expect(() => K.smoke(g, 0, 2, 0).update(1, 1)).not.toThrow();
    expect(() => K.dispose()).not.toThrow();
  });
});


describe("the indexes", () => {
  it("load", () => expect(wholeError).toBeNull());

  it.skipIf(!W)("list every family's looks and builders, and resolve our machines", () => {
    const { MACHINE_LOOKS, REAL_BUILDERS, findLook, realMachine } = W!;
    expect(MACHINE_LOOKS.map((l) => l.key).sort()).toEqual(LOOKS.map((x) => x.look.key).sort());
    expect(Object.keys(REAL_BUILDERS).sort()).toEqual(families.flatMap((f) => Object.keys(f.builders)).sort());
    for (const m of seed) {
      const look = LOOKS.find((x) => lookMatches(x.look, m.type, m.vendor, m.model))?.look ?? null;
      expect(findLook(m.type, m.vendor, m.model)?.key ?? null, name(m)).toBe(look?.key ?? null);
      // A real machine needs both: a look and its builder.
      expect(realMachine(m.type, m.vendor, m.model)?.look.key ?? null, name(m)).toBe(look && REAL_BUILDERS[look.key] ? look.key : null);
    }
    expect(findLook("PICK_AND_PLACE", "Nobody", "Nothing 1")).toBeNull();
    expect(realMachine("OTHER", "Bench", "ESD bench")).toBeNull();
  });
});

describe.skipIf(!W)("line layout", () => {
  const { GENERIC_GAP, GENERIC_LINK, itemSpan, layoutLine, findLook } = W ?? ({} as Whole);
  it("stands real machines the kit's gap apart", () => expect(W!.REAL_GAP).toBe(REAL_GAP));

  const M = (id: string, type: string, vendor = "Acme", model = id): LayoutMachine => ({ id, type, vendor, model });
  const fake = (l: number, d = 1000, rail: number | null = null): MachineLook => ({ key: `fake-${l}`, family: "handling", types: [], match: "x", name: "Fake", bodyMm: { l, d, h: 1500, source: "estimate", note: "test" }, railFromFrontMm: rail, reachMm: { front: 0, back: 0, top: 0 }, livery: { body: "#ffffff" }, features: ["x"], refs: [{ label: "x", source: "sheet" }] });
  const noOverlap = (items: ReturnType<Whole["layoutLine"]>["items"]) => {
    const spans = items.map(itemSpan);
    for (let i = 1; i < spans.length; i++) expect(spans[i][0], `item ${i} starts before item ${i - 1} ends`).toBeGreaterThanOrEqual(spans[i - 1][1] - 1e-9);
  };

  it("keeps today's footprints and rules for machines with no real look", () => {
    const line = [M("p", "STENCIL_PRINTER"), M("s", "SPI"), M("c", "OTHER", "Ecopmin", "1 m link conveyor"), M("o", "REFLOW_OVEN"), M("x", "XRAY"), M("b", "FCT")];
    const { items, length } = layoutLine(line, () => null);
    expect(items.map((i) => i.kind)).toEqual(["generic", "link", "generic", "link", "generic", "generic", "generic"]);
    // printer 2.2 · link 0.5 · SPI 1.6 · sheet conveyor 1.2 · oven 6.4 · gap · X-ray 2.0 · gap · bench 1.3
    expect(length).toBeCloseTo(2.2 + GENERIC_LINK + 1.6 + 1.2 + 6.4 + GENERIC_GAP + 2.0 + GENERIC_GAP + 1.3);
    expect(items.filter((i) => i.kind !== "link").map((i) => i.m!.id)).toEqual(["p", "s", "o", "x", "b"]);
    noOverlap(items);
  });

  it("stands real machines side by side by their body length, conveyors included", () => {
    const looks: Record<string, MachineLook> = { a: fake(1200), c: fake(600, 700, 190), b: fake(1374, 1857, 900), d: fake(5200, 1400) };
    const line = [M("a", "STENCIL_PRINTER"), M("c", "OTHER", "Ecopmin", "0.6 m link conveyor"), M("b", "PICK_AND_PLACE"), M("d", "REFLOW_OVEN")];
    const { items, length } = layoutLine(line, (m) => looks[m.id]);
    expect(items.map((i) => i.kind)).toEqual(["real", "real", "real", "real"]);
    expect(items.map((i) => i.m!.id)).toEqual(["a", "c", "b", "d"]);
    expect(length).toBeCloseTo(1.2 + 0.6 + 1.374 + 5.2 + 3 * REAL_GAP);
    noOverlap(items);
    const spans = items.map(itemSpan);
    for (let i = 1; i < spans.length; i++) expect(spans[i][0] - spans[i - 1][1]).toBeCloseTo(REAL_GAP);
    // Depth follows where the conveyor runs through the body.
    const b = items[2];
    expect(b.kind === "real" && [b.z0, b.z1].map((v) => +v.toFixed(3))).toEqual([0.9 - 1.857, 0.9]);
    const a = items[0];
    expect(a.kind === "real" && [a.z0, a.z1]).toEqual([-0.5, 0.5]);
  });

  it("joins real and generic machines with a link, and gives stand-alone ones their gap", () => {
    const looks: Record<string, MachineLook> = { r1: fake(1000), r2: fake(1000) };
    const { items, length } = layoutLine([M("g1", "STENCIL_PRINTER"), M("r1", "SPI"), M("g2", "PICK_AND_PLACE"), M("r2", "AOI"), M("x", "XRAY")], (m) => looks[m.id] ?? null);
    expect(items.map((i) => i.kind)).toEqual(["generic", "link", "real", "link", "generic", "link", "real", "generic"]);
    expect(length).toBeCloseTo(2.2 + GENERIC_LINK + 1 + GENERIC_LINK + 2.6 + GENERIC_LINK + 1 + GENERIC_GAP + 2.0);
    noOverlap(items);
  });

  it("lays out our three lines: order kept, nothing overlaps, the length adds up", () => {
    for (const line of LINES) {
      const machines = seed.filter((m) => m.line === line.code);
      const { items, length } = layoutLine(machines);
      const placed = items.filter((i) => i.m).map((i) => i.m!.id);
      expect(placed, line.code).toEqual(machines.map((m) => m.id));
      noOverlap(items);
      const spans = items.map(itemSpan);
      expect(spans[0][0]).toBe(0);
      expect(length, line.code).toBeCloseTo(spans[spans.length - 1][1]);
      // Every real machine stands at its look's length, on the conveyor's centreline.
      for (const it of items) {
        if (it.kind !== "real") continue;
        const f = lookFrame(it.look);
        expect(it.w).toBe(f.l);
        expect(it.z0).toBeLessThan(0);
        expect(it.z1).toBeGreaterThan(0);
        expect(findLook(it.m.type, it.m.vendor, it.m.model)).toBe(it.look);
      }
    }
  });
});
