import { lookFrame, type MachineLook } from "@/knowledge/machine-looks/types";
import { BUDGET, type Kit } from "./kit";
import type { RealBuilt } from "./types";

/**
 * The contract every real machine is held to, as checks that run in the unit tests (node). Returns what is wrong,
 * in words; [] = fine.
 */

/** The animation phases every machine is checked at: seconds of running time. */
export const PHASES = [0, 1.5, 3, 7.3, 9.2];

const mm = (v: number) => `${Math.round(v * 1000)} mm`;

/** Is everything inside the look's box right now? (Call after update().) */
export function outside(K: Kit, look: MachineLook, built: RealBuilt, when: string): string[] {
  const { box } = lookFrame(look);
  const b = K.stats(built.group).box;
  const eps = 1e-4;
  const out: string[] = [];
  if (b.isEmpty()) return [`${when}: nothing is drawn`];
  if (b.min.x < box.x0 - eps) out.push(`${when}: sticks out of the entry end by ${mm(box.x0 - b.min.x)} (x ${b.min.x.toFixed(3)} < ${box.x0.toFixed(3)})`);
  if (b.max.x > box.x1 + eps) out.push(`${when}: sticks out of the exit end by ${mm(b.max.x - box.x1)} (x ${b.max.x.toFixed(3)} > ${box.x1.toFixed(3)})`);
  if (b.min.z < box.z0 - eps) out.push(`${when}: reaches ${mm(box.z0 - b.min.z)} too far back (z ${b.min.z.toFixed(3)} < ${box.z0.toFixed(3)}): raise reachMm.back or pull it in`);
  if (b.max.z > box.z1 + eps) out.push(`${when}: reaches ${mm(b.max.z - box.z1)} too far to the front (z ${b.max.z.toFixed(3)} > ${box.z1.toFixed(3)}): raise reachMm.front or pull it in`);
  if (b.min.y < box.y0 - eps) out.push(`${when}: goes ${mm(box.y0 - b.min.y)} under the floor`);
  if (b.max.y > box.y1 + eps) out.push(`${when}: stands ${mm(b.max.y - box.y1)} too tall (y ${b.max.y.toFixed(3)} > ${box.y1.toFixed(3)}): raise reachMm.top or lower it`);
  return out;
}

/** The checks that do not depend on the phase: the body is the published size, the lamps, the board path, the budgets. */
export function still(K: Kit, look: MachineLook, built: RealBuilt, cy: number): string[] {
  const f = lookFrame(look);
  const out: string[] = [];
  const s = K.stats(built.group);
  const b = s.box;
  const tol = 0.03;
  if (Math.abs(built.height - f.h) > 0.001) out.push(`height is ${built.height}, the body's is ${f.h}`);
  if (!b.isEmpty()) {
    // The model fills the published body: it reaches both ends, the front, the back, the floor and the top.
    if (b.min.x > -f.l / 2 + tol || b.max.x < f.l / 2 - tol) out.push(`the body is ${mm(f.l)} long, the model spans x ${b.min.x.toFixed(3)} … ${b.max.x.toFixed(3)}`);
    if (b.max.z < f.zFront - tol) out.push(`the front face is at z ${f.zFront.toFixed(3)}, the model only reaches ${b.max.z.toFixed(3)}`);
    if (b.min.z > f.zBack + tol) out.push(`the back face is at z ${f.zBack.toFixed(3)}, the model only reaches ${b.min.z.toFixed(3)}`);
    if (b.min.y > 0.005) out.push(`nothing stands on the floor (lowest point y ${b.min.y.toFixed(3)})`);
    if (b.max.y < f.h - tol) out.push(`the body is ${mm(f.h)} tall, the model only reaches ${b.max.y.toFixed(3)}`);
  }
  if (built.lamps.length !== 3) out.push(`lamps: ${built.lamps.length}, wanted [green, amber, red]`);
  else {
    const mats = built.lamps.map((l) => l.material);
    if (new Set(mats).size !== 3) out.push("the three lamps share a material: each needs its own");
    if (mats.some((m) => Array.isArray(m) || !("emissiveIntensity" in m))) out.push("a lamp's material has no emissive");
  }
  if (typeof built.screen?.draw !== "function") out.push("screen.draw is missing");
  // The board path: the kit's rails from one end face to the other at pass height.
  let rails: { x0: number; x1: number; y: number } | null = null;
  built.group.traverse((o) => {
    if (o.userData.kit === "rails") rails = o.userData.rails;
  });
  const r = rails as { x0: number; x1: number; y: number } | null;
  if (!r) out.push("no conveyor: call K.conveyorRails(group, bodyLength, cy)");
  else {
    if (r.x0 > -f.l / 2 + 1e-6 || r.x1 < f.l / 2 - 1e-6) out.push(`the rails run x ${r.x0.toFixed(3)} … ${r.x1.toFixed(3)}, the body is ±${(f.l / 2).toFixed(3)}`);
    if (Math.abs(r.y - cy) > 1e-6) out.push(`the belts are at y ${r.y}, the pass height is ${cy}`);
  }
  if (s.drawCalls > BUDGET.drawCalls) out.push(`${s.drawCalls} draw calls after sealing (budget ${BUDGET.drawCalls})`);
  if (s.triangles > BUDGET.triangles) out.push(`${s.triangles} triangles (budget ${BUDGET.triangles})`);
  return out;
}

/** Everything: the still checks, then the box at every phase, busy and idle. Leaves the machine at t = 0, idle. */
export function checkBuilt(K: Kit, look: MachineLook, built: RealBuilt, cy: number): string[] {
  const out = still(K, look, built, cy);
  for (const busy of [true, false])
    for (const t of PHASES) {
      built.update(busy ? t : 0, busy, t);
      out.push(...outside(K, look, built, `t = ${t} ${busy ? "busy" : "idle"}`));
    }
  built.update(0, false, 0);
  return out;
}
