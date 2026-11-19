"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { CHIP_PACKAGES, ELEMENT_INFO, chipPackage, type ChipPackage, type PackageElement } from "@/knowledge/explore/chips";
import { cn } from "@/lib/utils";
import { FullViewStage } from "@/components/ui/full-view";
import { ControlGroup, EXTRUDE, ExploreCanvas, Segmented, Slider, Toggle, ViewButtons, useEased, useReducedMotion, type Vec3 } from "./scene";

const SELECT = new THREE.Color("#5a2f96");
type View = "angled" | "side" | "under";

/** Box: centre x/y, z from z0 to z1. */
type Box = { x: number; y: number; z0: number; z1: number; w: number; d: number };
type Ball = { x: number; y: number; z: number; r: number };
type Wire = { a: Vec3; b: Vec3 };

/** How far each element moves when the package is pulled apart (× explode). */
const LIFT: Record<PackageElement, number> = {
  lid: 3.2,
  tim: 2.4,
  mold: 2.2,
  wire: 1.2,
  die: 1.2,
  attach: 0.9,
  rdl: -0.6,
  bump: 0.6,
  underfill: 0.6,
  leadframe: 0,
  lead: 0,
  epad: 0,
  substrate: 0,
  ball: -1.4,
};

/** A gull-wing lead at position x on one side of the body (side 1 = +y). */
type GullWing = { x: number; side: 1 | -1 };
type Geometry = { span: number; boxes: Partial<Record<PackageElement, Box[]>>; balls: Partial<Record<PackageElement, Ball[]>>; wires: Wire[]; gullwings?: GullWing[] };

function grid(n: number, pitch: number, z: number, r: number, skip?: (i: number, j: number) => boolean): Ball[] {
  const out: Ball[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (!skip?.(i, j)) out.push({ x: (i - (n - 1) / 2) * pitch, y: (j - (n - 1) / 2) * pitch, z, r });
  return out;
}

/** Bond wires from pads around the die edge to targets on a larger ring. */
function ringWires(perSide: number, dieHalf: number, dieTop: number, targetHalf: number, targetZ: number, spread: number): Wire[] {
  const out: Wire[] = [];
  for (let k = 0; k < perSide; k++) {
    const t = (k - (perSide - 1) / 2) / Math.max(1, perSide - 1);
    const [pd, pt] = [t * dieHalf * 1.6, t * spread];
    out.push(
      { a: [pd, dieHalf * 0.9, dieTop], b: [pt, targetHalf, targetZ] },
      { a: [pd, -dieHalf * 0.9, dieTop], b: [pt, -targetHalf, targetZ] },
      { a: [dieHalf * 0.9, pd, dieTop], b: [targetHalf, pt, targetZ] },
      { a: [-dieHalf * 0.9, pd, dieTop], b: [-targetHalf, pt, targetZ] },
    );
  }
  return out;
}

/** Geometry of each package, in millimetres, sitting on z = 0. */
function build(key: ChipPackage["key"]): Geometry {
  switch (key) {
    case "soic": {
      const gullwings: GullWing[] = [];
      const wires: Wire[] = [];
      for (let i = 0; i < 4; i++) {
        const x = (i - 1.5) * 1.27;
        for (const s of [1, -1] as const) {
          gullwings.push({ x, side: s });
          wires.push({ a: [x * 0.45, s * 0.5, 1.13], b: [x, s * 1.15, 0.85] });
        }
      }
      return {
        span: 7,
        boxes: {
          leadframe: [{ x: 0, y: 0, z0: 0.65, z1: 0.85, w: 2.4, d: 1.9 }],
          attach: [{ x: 0, y: 0, z0: 0.85, z1: 0.88, w: 1.6, d: 1.3 }],
          die: [{ x: 0, y: 0, z0: 0.88, z1: 1.13, w: 1.5, d: 1.2 }],
          mold: [{ x: 0, y: 0, z0: 0.15, z1: 1.55, w: 4.9, d: 3.9 }],
        },
        balls: {},
        wires,
        gullwings,
      };
    }
    case "qfn": {
      const pads: Box[] = [];
      for (let i = 0; i < 8; i++) {
        const o = (i - 3.5) * 0.5;
        pads.push(
          { x: o, y: 2.3, z0: 0, z1: 0.2, w: 0.25, d: 0.4 },
          { x: o, y: -2.3, z0: 0, z1: 0.2, w: 0.25, d: 0.4 },
          { x: 2.3, y: o, z0: 0, z1: 0.2, w: 0.4, d: 0.25 },
          { x: -2.3, y: o, z0: 0, z1: 0.2, w: 0.4, d: 0.25 },
        );
      }
      return {
        span: 6.5,
        boxes: {
          epad: [{ x: 0, y: 0, z0: 0, z1: 0.2, w: 3.3, d: 3.3 }],
          leadframe: pads,
          attach: [{ x: 0, y: 0, z0: 0.2, z1: 0.23, w: 2.7, d: 2.7 }],
          die: [{ x: 0, y: 0, z0: 0.23, z1: 0.43, w: 2.6, d: 2.6 }],
          mold: [{ x: 0, y: 0, z0: 0, z1: 0.85, w: 5, d: 5 }],
        },
        balls: {},
        wires: ringWires(8, 1.3, 0.43, 2.2, 0.2, 3.5),
      };
    }
    case "bga": {
      return {
        span: 15,
        boxes: {
          substrate: [{ x: 0, y: 0, z0: 0.42, z1: 0.78, w: 13, d: 13 }],
          attach: [{ x: 0, y: 0, z0: 0.78, z1: 0.81, w: 6.2, d: 6.2 }],
          die: [{ x: 0, y: 0, z0: 0.81, z1: 1.06, w: 6, d: 6 }],
          mold: [{ x: 0, y: 0, z0: 0.78, z1: 1.5, w: 13, d: 13 }],
        },
        balls: { ball: grid(12, 1.0, 0.25, 0.27) },
        wires: ringWires(10, 3, 1.06, 4.4, 0.78, 7.5),
      };
    }
    case "fcbga": {
      const lidWalls: Box[] = [
        { x: 0, y: 6.9, z0: 1.22, z1: 1.9, w: 14.4, d: 0.6 },
        { x: 0, y: -6.9, z0: 1.22, z1: 1.9, w: 14.4, d: 0.6 },
        { x: 6.9, y: 0, z0: 1.22, z1: 1.9, w: 0.6, d: 13.2 },
        { x: -6.9, y: 0, z0: 1.22, z1: 1.9, w: 0.6, d: 13.2 },
      ];
      return {
        span: 17,
        boxes: {
          substrate: [{ x: 0, y: 0, z0: 0.42, z1: 1.22, w: 15, d: 15 }],
          underfill: [{ x: 0, y: 0, z0: 1.22, z1: 1.36, w: 8.6, d: 8.6 }],
          die: [{ x: 0, y: 0, z0: 1.36, z1: 1.8, w: 8, d: 8 }],
          tim: [{ x: 0, y: 0, z0: 1.8, z1: 1.86, w: 8, d: 8 }],
          lid: [{ x: 0, y: 0, z0: 1.86, z1: 2.36, w: 14.4, d: 14.4 }, ...lidWalls],
        },
        balls: { ball: grid(14, 1.0, 0.25, 0.28), bump: grid(20, 0.38, 1.29, 0.09) },
        wires: [],
      };
    }
    case "wlcsp": {
      const rdl: Box[] = [];
      const balls = grid(6, 0.4, 0.13, 0.13);
      // RDL traces from edge pads in to each ball site of the outer ring.
      for (const b of balls) if (Math.abs(b.x) > 0.9 || Math.abs(b.y) > 0.9) rdl.push(Math.abs(b.x) >= Math.abs(b.y) ? { x: b.x + Math.sign(b.x) * 0.2, y: b.y, z0: 0.24, z1: 0.27, w: 0.4, d: 0.06 } : { x: b.x, y: b.y + Math.sign(b.y) * 0.2, z0: 0.24, z1: 0.27, w: 0.06, d: 0.4 });
      return {
        span: 4,
        boxes: { die: [{ x: 0, y: 0, z0: 0.27, z1: 0.67, w: 2.9, d: 2.9 }], rdl },
        balls: { ball: balls },
        wires: [],
      };
    }
  }
}

// ───────────────────────────── Meshes ─────────────────────────────

function material(el: PackageElement, selected: boolean, xray: boolean) {
  const info = ELEMENT_INFO[el];
  const metal = ["leadframe", "lead", "epad", "wire", "ball", "bump", "lid", "rdl"].includes(el);
  const translucent = (el === "mold" && xray) || el === "underfill";
  return (
    <meshStandardMaterial
      color={info.color}
      metalness={metal ? 0.6 : el === "die" ? 0.35 : 0}
      roughness={metal ? 0.3 : el === "die" ? 0.25 : 0.7}
      transparent={translucent}
      opacity={el === "mold" && xray ? 0.22 : el === "underfill" ? 0.55 : 1}
      depthWrite={!translucent}
      side={THREE.DoubleSide}
      emissive={selected ? SELECT : undefined}
      emissiveIntensity={selected ? 0.4 : 0}
    />
  );
}

function Boxes({ items, lift, children }: { items: Box[]; lift: number; children: ReactNode }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((st) => st.invalidate);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    items.forEach((b, i) => {
      m.compose(new THREE.Vector3(b.x, b.y, (b.z0 + b.z1) / 2 + lift), q, new THREE.Vector3(b.w, b.d, b.z1 - b.z0));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [items, lift, invalidate]);
  return (
    <instancedMesh key={items.length} ref={ref} args={[undefined, undefined, items.length]}>
      <boxGeometry />
      {children}
    </instancedMesh>
  );
}

function Spheres({ items, lift, children }: { items: Ball[]; lift: number; children: ReactNode }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((st) => st.invalidate);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    items.forEach((b, i) => {
      m.compose(new THREE.Vector3(b.x, b.y, b.z + lift), q, new THREE.Vector3(b.r, b.r, b.r * 0.92));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [items, lift, invalidate]);
  return (
    <instancedMesh key={items.length} ref={ref} args={[undefined, undefined, items.length]}>
      <sphereGeometry args={[1, 16, 12]} />
      {children}
    </instancedMesh>
  );
}

/** Leads bent in the gull-wing shape: inner finger in the mould, shoulder, bend and foot on the pad. */
function GullWings({ items, lift, children }: { items: GullWing[]; lift: number; children: ReactNode }) {
  const geometry = useMemo(() => {
    // Profile in (u = distance from the body centre, v = height), 0.2 mm thick.
    const s = new THREE.Shape();
    s.moveTo(1.0, 0.65);
    s.lineTo(2.05, 0.65);
    s.lineTo(2.3, 0);
    s.lineTo(3.05, 0);
    s.lineTo(3.05, 0.2);
    s.lineTo(2.45, 0.2);
    s.lineTo(2.2, 0.85);
    s.lineTo(1.0, 0.85);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { ...EXTRUDE, depth: 0.42 });
    g.translate(0, 0, -0.21);
    // (u, v, extrusion) → world (y, z, x)
    g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)));
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((st) => st.invalidate);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    items.forEach((l, i) => {
      m.compose(new THREE.Vector3(l.x, 0, lift), q, new THREE.Vector3(1, l.side, 1));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [items, lift, invalidate]);
  return (
    <instancedMesh key={items.length} ref={ref} args={[geometry, undefined, items.length]}>
      {children}
    </instancedMesh>
  );
}

/** Ball bond rises from the die pad, arcs over and lands as a stitch on the lead. */
function Wires({ wires, dieLift, children }: { wires: Wire[]; dieLift: number; children: ReactNode }) {
  const geometry = useMemo(() => {
    const parts = wires.map(({ a, b }) => {
      const start = new THREE.Vector3(a[0], a[1], a[2] + dieLift);
      const end = new THREE.Vector3(...b);
      const top = Math.max(start.z, end.z) + 0.35;
      const curve = new THREE.CatmullRomCurve3([start, new THREE.Vector3(start.x, start.y, top), new THREE.Vector3((start.x * 0.4 + end.x * 0.6), (start.y * 0.4 + end.y * 0.6), top - 0.05), end]);
      return new THREE.TubeGeometry(curve, 14, 0.028, 5, false);
    });
    return parts;
  }, [wires, dieLift]);
  useEffect(() => () => geometry.forEach((g) => g.dispose()), [geometry]);
  return (
    <>
      {geometry.map((g, i) => (
        <mesh key={i} geometry={g}>
          {children}
        </mesh>
      ))}
    </>
  );
}

// ───────────────────────────── Explorer ─────────────────────────────

export default function PackageExplorer({ initial }: { initial?: string }) {
  const reduced = useReducedMotion();
  const [key, setKey] = useState(chipPackage(initial).key);
  const [explodeTarget, setExplode] = useState(0.3);
  const explode = useEased(explodeTarget, reduced);
  const [cut, setCut] = useState(true);
  const [xray, setXray] = useState(true);
  const [view, setView] = useState<View>("angled");
  const [selected, setSelected] = useState<PackageElement | null>(null);

  const pkg = chipPackage(key);
  const g = useMemo(() => build(pkg.key), [pkg.key]);
  const s = g.span;
  // "Side" looks along the package's length, so lead profiles (gull-wing, J-lead) read clearly.
  const views: Record<View, Vec3> = { angled: [s * 0.75, -s * 1.1, s * 0.85], side: [s * 1.6, -s * 0.35, s * 0.2], under: [s * 0.7, -s * 1.0, -s * 0.85] };
  // Lifts scale with package size; 0.7 keeps a fully pulled-apart package in frame.
  const lift = (el: PackageElement) => LIFT[el] * explode * (s / 7) * 0.7;
  const pick = (el: PackageElement) => (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return;
    e.stopPropagation();
    setSelected(el);
  };
  const info = selected ? ELEMENT_INFO[selected] : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <FullViewStage className="h-[420px] overflow-hidden rounded-xl border bg-muted/60 sm:h-[560px]">
        <ExploreCanvas cut={cut} camera={views[view]} target={[0, 0, 0.6]} label={`${pkg.label} package cut-away in 3D`}>
          <group onPointerMissed={() => setSelected(null)}>
            {pkg.elements.map((el) => {
              const sel = selected === el;
              if (el === "wire") {
                return (
                  <group key={el} onClick={pick(el)}>
                    <Wires wires={g.wires} dieLift={lift("die")}>{material(el, sel, xray)}</Wires>
                  </group>
                );
              }
              const boxes = g.boxes[el];
              const balls = g.balls[el];
              return (
                <group key={el} onClick={pick(el)}>
                  {el === "lead" && g.gullwings ? <GullWings items={g.gullwings} lift={lift(el)}>{material(el, sel, xray)}</GullWings> : null}
                  {boxes?.length ? <Boxes items={boxes} lift={lift(el)}>{material(el, sel, xray)}</Boxes> : null}
                  {balls?.length ? <Spheres items={balls} lift={lift(el)}>{material(el, sel, xray)}</Spheres> : null}
                </group>
              );
            })}
          </group>
        </ExploreCanvas>
        <ViewButtons value={view} onChange={setView} options={[{ value: "angled", label: "Angled" }, { value: "side", label: "Side" }, { value: "under", label: "Underside" }]} />
        <p className="pointer-events-none absolute right-3 bottom-2 text-[11px] text-muted-foreground">Drag to turn · scroll to zoom · click a part</p>
      </FullViewStage>

      <div className="space-y-5 rounded-xl border bg-card p-5">
        <ControlGroup title="Package">
          <Segmented
            label="Package"
            value={key}
            onChange={(k) => {
              setKey(k);
              setSelected(null);
            }}
            options={CHIP_PACKAGES.map((p) => ({ value: p.key, label: p.label }))}
          />
          <p className="text-sm leading-relaxed text-muted-foreground">{pkg.summary}</p>
        </ControlGroup>
        <Slider label="Pull apart" value={explodeTarget} onChange={setExplode} />
        <ControlGroup title="Show">
          <div className="grid grid-cols-2 gap-2">
            <Toggle checked={cut} onChange={setCut}>Cut-away</Toggle>
            <Toggle checked={xray} onChange={setXray}>X-ray mould</Toggle>
          </div>
        </ControlGroup>
        <ControlGroup title="What’s inside">
          <ul className="-mx-2">
            {pkg.elements.map((el) => {
              const on = selected === el;
              return (
                <li key={el}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSelected(on ? null : el)}
                    className={cn("flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring", on ? "bg-primary/10" : "hover:bg-muted/60")}
                  >
                    <span aria-hidden className="size-3 shrink-0 rounded-sm border border-black/10" style={{ background: ELEMENT_INFO[el].color }} />
                    {ELEMENT_INFO[el].label}
                  </button>
                </li>
              );
            })}
          </ul>
        </ControlGroup>
        <div className="border-t pt-4 text-sm leading-relaxed" aria-live="polite">
          {info ? (
            <>
              <div className="font-medium">{info.label}</div>
              <p className="mt-1 text-muted-foreground">{info.detail}</p>
            </>
          ) : (
            <>
              <div className="font-medium">On our lines</div>
              <ul className="mt-1 space-y-1.5 text-muted-foreground">
                {pkg.ems.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
