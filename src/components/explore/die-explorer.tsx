"use client";

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { DIE_LAYERS, type DieLayer } from "@/knowledge/explore/chips";
import { createRng } from "@/lib/rng";
import { cn } from "@/lib/utils";
import { ControlGroup, ExploreCanvas, Slider, Toggle, ViewButtons, useEased, useReducedMotion, type Vec3 } from "./scene";

/** A small square of the die, drawn far out of scale: real wires are nanometres wide. */
const W = 24;
const D = 16;
const SELECT = new THREE.Color("#3b82f6");
type View = "angled" | "side" | "top";
const VIEWS: Record<View, Vec3> = { angled: [32, -48, 40], side: [0, -60, 12], top: [0, -0.01, 64] };

type Box = { x: number; y: number; z0: number; z1: number; w: number; d: number };
type Layer = { key: string; color: string; boxes: Box[]; translucent?: number; metal?: boolean };

const COLOR = { si: "#3e4757", nwell: "#5a6a8c", pwell: "#7a6690", oxide: "#e3e9f1", poly: "#b4552e", tungsten: "#9aa3ad", copper: "#c27c43", al: "#cfd4da", sin: "#8fd0bf", ild: "#a9c3e6" };

/** Builds the die bottom-up. Returns drawn layers per DIE_LAYERS key, plus vias and dielectric per metal level. */
function build() {
  const rng = createRng("die");
  const layers = new Map<string, Layer[]>();
  const add = (key: string, l: Layer) => layers.set(key, [...(layers.get(key) ?? []), l]);
  let z = 0;

  add("si", { key: "si", color: COLOR.si, boxes: [{ x: 0, y: 0, z0: 0, z1: 4, w: W, d: D }] });
  z = 4;
  add("wells", { key: "wells", color: COLOR.nwell, boxes: [{ x: -W / 4, y: 0, z0: z, z1: z + 0.7, w: W / 2, d: D }] });
  add("wells", { key: "wells", color: COLOR.pwell, boxes: [{ x: W / 4, y: 0, z0: z, z1: z + 0.7, w: W / 2, d: D }] });
  // Isolation trenches between transistor rows.
  add("sti", { key: "sti", color: COLOR.oxide, translucent: 0.8, boxes: [-9, -3, 3, 9].map((x) => ({ x, y: 0, z0: z + 0.05, z1: z + 0.75, w: 0.9, d: D })) });
  z += 0.7;

  // Gates: thin lines across each transistor row; contacts between them.
  const gates: Box[] = [];
  const contacts: Box[] = [];
  for (const cx of [-12, -6, 0, 6]) {
    for (let k = 0; k < 3; k++) {
      const x = cx + 1.5 + k * 1.5;
      gates.push({ x, y: 0, z0: z, z1: z + 0.6, w: 0.35, d: D * 0.8 });
      for (const y of [-5, 0, 5]) contacts.push({ x: x + 0.75, y, z0: z, z1: z + 1.3, w: 0.35, d: 0.35 });
    }
  }
  add("gates", { key: "gates", color: COLOR.poly, boxes: gates });
  add("contacts", { key: "contacts", color: COLOR.tungsten, boxes: contacts, metal: true });
  z += 1.3;

  // Metal stack: alternating direction, pitch and thickness grow toward the top.
  const metals = DIE_LAYERS.filter((l) => l.kind === "metal");
  let prev: Box[] = [];
  metals.forEach((m, i) => {
    const pitch = m.pitchNm! / 90;
    const t = pitch >= 8 ? 1.4 : pitch >= 2 ? 0.7 : 0.4;
    const along = i % 2 === 0 ? "x" : "y";
    const span = along === "x" ? D : W;
    const lines: Box[] = [];
    for (let p = -span / 2 + pitch / 2; p < span / 2; p += pitch) {
      // Break each track into a few segments, like real routing.
      let s = along === "x" ? -W / 2 : -D / 2;
      const end = -s;
      while (s < end - 1) {
        const len = Math.min(end - s, rng.between(3, 10));
        const w = pitch * 0.45;
        if (rng.chance(0.85)) lines.push(along === "x" ? { x: s + len / 2, y: p, z0: z + 0.5, z1: z + 0.5 + t, w: len - 0.3, d: w } : { x: p, y: s + len / 2, z0: z + 0.5, z1: z + 0.5 + t, w, d: len - 0.3 });
        s += len;
      }
    }
    // Vias down to the layer below where tracks cross.
    const vias: Box[] = [];
    if (prev.length) {
      for (let k = 0; k < 28; k++) {
        const a = rng.pick(lines);
        const size = Math.min(a.w, a.d) * 0.9;
        const x = along === "x" ? a.x + rng.between(-a.w / 2.5, a.w / 2.5) : a.x;
        const y = along === "x" ? a.y : a.y + rng.between(-a.d / 2.5, a.d / 2.5);
        vias.push({ x, y, z0: z, z1: z + 0.5, w: size, d: size });
      }
    }
    add(m.key, { key: m.key, color: COLOR.ild, translucent: 0.12, boxes: [{ x: 0, y: 0, z0: z, z1: z + 0.5 + t, w: W, d: D }] });
    add(m.key, { key: m.key, color: COLOR.copper, boxes: lines, metal: true });
    if (vias.length) add(m.key, { key: m.key, color: COLOR.copper, boxes: vias, metal: true });
    prev = lines;
    z += 0.5 + t;
  });

  // Bond pads and passivation (with openings over the pads).
  const pads: Box[] = [-7.5, 7.5].map((x) => ({ x, y: 0, z0: z + 0.3, z1: z + 1.3, w: 7, d: 7 }));
  add("pad", { key: "pad", color: COLOR.al, boxes: pads, metal: true });
  const ring = (x: number): Box[] => [
    { x, y: 5.75, z0: z + 1.3, z1: z + 2.1, w: 8, d: 4.5 },
    { x, y: -5.75, z0: z + 1.3, z1: z + 2.1, w: 8, d: 4.5 },
  ];
  add("pass", { key: "pass", color: COLOR.sin, translucent: 0.45, boxes: [...ring(-8), ...ring(8), { x: 0, y: 0, z0: z + 1.3, z1: z + 2.1, w: 8, d: D }] });
  return layers;
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

export default function DieExplorer() {
  const reduced = useReducedMotion();
  const [explodeTarget, setExplode] = useState(0.25);
  const explode = useEased(explodeTarget, reduced);
  const [cut, setCut] = useState(false);
  const [showIld, setShowIld] = useState(true);
  const [view, setView] = useState<View>("angled");
  const [selected, setSelected] = useState<string | null>(null);
  const layers = useMemo(build, []);
  const info: DieLayer | undefined = DIE_LAYERS.find((l) => l.key === selected);
  const pick = (key: string) => (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return;
    e.stopPropagation();
    setSelected(key);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="relative h-[420px] overflow-hidden rounded-lg border bg-gradient-to-b from-muted/30 to-muted/70 sm:h-[560px]">
        <ExploreCanvas cut={cut} camera={VIEWS[view]} target={[0, 0, 10]} label="Layers inside a silicon die in 3D">
          <group onPointerMissed={() => setSelected(null)}>
            {DIE_LAYERS.map((dl, i) => {
              const lift = i * explode * 1.6;
              const sel = selected === dl.key;
              return (
                <group key={dl.key} onClick={pick(dl.key)}>
                  {(layers.get(dl.key) ?? []).map((l, j) =>
                    l.translucent && l.translucent < 0.2 && !showIld ? null : (
                      <Boxes key={j} items={l.boxes} lift={lift}>
                        <meshStandardMaterial
                          color={l.color}
                          metalness={l.metal ? 0.6 : 0.1}
                          roughness={l.metal ? 0.3 : 0.6}
                          transparent={!!l.translucent}
                          opacity={l.translucent ?? 1}
                          depthWrite={!l.translucent}
                          emissive={sel ? SELECT : undefined}
                          emissiveIntensity={sel ? 0.45 : 0}
                        />
                      </Boxes>
                    ),
                  )}
                </group>
              );
            })}
          </group>
        </ExploreCanvas>
        <ViewButtons value={view} onChange={setView} options={[{ value: "angled", label: "Angled" }, { value: "side", label: "Side" }, { value: "top", label: "Top" }]} />
        <p className="pointer-events-none absolute right-3 bottom-2 text-[11px] text-muted-foreground">Not to scale — a few micrometres of a real die</p>
      </div>

      <div className="space-y-5 rounded-lg border bg-card p-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Transistors are made in the top micrometre of the silicon (front end); up to a dozen copper wiring layers are built on top (back end), finished with bond pads and a sealing passivation.
        </p>
        <Slider label="Separate layers" value={explodeTarget} onChange={setExplode} />
        <ControlGroup title="Show">
          <div className="grid grid-cols-2 gap-2">
            <Toggle checked={cut} onChange={setCut}>Cut-away</Toggle>
            <Toggle checked={showIld} onChange={setShowIld}>Dielectric</Toggle>
          </div>
        </ControlGroup>
        <ControlGroup title="Layers, top to bottom">
          <ul className="space-y-px overflow-hidden rounded-md border">
            {[...DIE_LAYERS].reverse().map((l) => {
              const on = selected === l.key;
              return (
                <li key={l.key}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSelected(on ? null : l.key)}
                    className={cn("flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring", on ? "bg-primary/10" : "hover:bg-muted/60")}
                  >
                    <span className="min-w-0 flex-1 truncate">{l.label}</span>
                    {l.pitchNm ? <span className="num text-muted-foreground">{l.pitchNm} nm</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </ControlGroup>
        <div className="rounded-md bg-muted/50 p-3 text-sm leading-relaxed" aria-live="polite">
          {info ? (
            <>
              <div className="font-medium">{info.label}</div>
              <p className="mt-1 text-muted-foreground">{info.detail}</p>
            </>
          ) : (
            <p className="text-muted-foreground">Click a layer to see what it does — and how assembly can damage it (ESD, bond-pad cratering, cracked passivation).</p>
          )}
        </div>
      </div>
    </div>
  );
}
