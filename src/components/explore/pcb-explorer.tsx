"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { FINISHES, PCB_STACKS, VIA_INFO, pcbStack, type FinishKey, type StackVia, type ViaKind } from "@/knowledge/explore/pcb";
import { layoutStack, thicknessMm, viaSpan, type PlacedLayer } from "@/lib/explore/stack-layout";
import { createRng } from "@/lib/rng";
import { cn } from "@/lib/utils";
import { ControlGroup, EXTRUDE, ExploreCanvas, Segmented, Slider, Toggle, ViewButtons, useEased, useReducedMotion, type Vec3 } from "./scene";

const W = 40;
const D = 26;
/** Drill diameters are scaled up so vias read at board scale. */
const VIA_SCALE = 6;

const COLOR = { copper: "#c27c43", core: "#cbbb80", prepreg: "#d9cd98", mask: "#1c6a3a", silk: "#f3f3ef", hole: "#26221e" };
const SELECT = new THREE.Color("#5a2f96");

type Rect = { x: number; y: number; w: number; h: number };
type Round = { x: number; y: number; r: number };
type Selection = { kind: "layer"; key: string } | { kind: "via"; via: ViaKind } | null;
type View = "angled" | "edge" | "top";
const NO_RECTS: Rect[] = [];

const VIEWS: Record<View, Vec3> = { angled: [36, -58, 38], edge: [0, -80, 5], top: [0, -0.01, 78] };

// ───────────────────────────── Board artwork ─────────────────────────────

/** Component footprints on one outer side: rectangular pads, round BGA pads and silk outlines. */
function footprints(side: "top" | "bottom") {
  const pads: Rect[] = [];
  const balls: Round[] = [];
  const silk: Rect[] = [];
  const outline = (x: number, y: number, w: number, h: number) => {
    const t = 0.18;
    silk.push({ x, y: y + h / 2, w, h: t }, { x, y: y - h / 2, w, h: t }, { x: x - w / 2, y, w: t, h }, { x: x + w / 2, y, w: t, h });
  };
  if (side === "top") {
    // QFP-32, 0.8 mm pitch (front half: cut away in section view)
    const [qx, qy] = [-9, -6.5];
    for (let i = 0; i < 8; i++) {
      const o = (i - 3.5) * 0.8;
      pads.push({ x: qx + o, y: qy + 4.6, w: 0.45, h: 1.4 }, { x: qx + o, y: qy - 4.6, w: 0.45, h: 1.4 }, { x: qx - 4.6, y: qy + o, w: 1.4, h: 0.45 }, { x: qx + 4.6, y: qy + o, w: 1.4, h: 0.45 });
    }
    outline(qx, qy, 7.2, 7.2);
    // 0603 passives
    for (const x of [5, 8.5, 12]) {
      pads.push({ x: x - 0.8, y: -9, w: 0.9, h: 0.95 }, { x: x + 0.8, y: -9, w: 0.9, h: 0.95 });
      outline(x, -9, 3, 1.8);
    }
    // SOIC-8 and BGA in the back half, which stays in view when cut
    const [sx, sy] = [9, 7];
    for (let i = 0; i < 4; i++) {
      const o = (i - 1.5) * 1.27;
      pads.push({ x: sx + o, y: sy + 2.7, w: 0.6, h: 1.5 }, { x: sx + o, y: sy - 2.7, w: 0.6, h: 1.5 });
    }
    outline(sx, sy, 5.2, 4.2);
    // BGA, 1.0 mm pitch
    const [bx, by] = [-10, 7.5];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) balls.push({ x: bx + (i - 2.5), y: by + (j - 2.5), r: 0.25 });
    outline(bx, by, 7, 7);
  } else {
    for (const [x, y] of [[-12, 8], [-6, 8], [6, -9], [12, -9]] as const) {
      pads.push({ x: x - 0.8, y, w: 0.9, h: 0.95 }, { x: x + 0.8, y, w: 0.9, h: 0.95 });
      outline(x, y, 3, 1.8);
    }
  }
  return { pads, balls, silk };
}

/** Parallel trace groups; inner layers alternate direction like a real routing plan. */
function traces(layerNo: number, side: "top" | "bottom" | "inner"): Rect[] {
  const rng = createRng(`traces-${layerNo}`);
  const out: Rect[] = [];
  const horizontal = side === "inner" ? layerNo % 2 === 1 : rng.chance(0.5);
  const groups = side === "inner" ? 5 : 3;
  for (let g = 0; g < groups; g++) {
    const n = rng.int(3, 6);
    if (horizontal) {
      const len = rng.between(10, 24);
      const [cx, cy] = [rng.between(-W / 2 + len / 2 + 1, W / 2 - len / 2 - 1), rng.between(-D / 2 + 3, D / 2 - 3)];
      for (let k = 0; k < n; k++) out.push({ x: cx, y: cy + (k - (n - 1) / 2) * 0.75, w: len, h: 0.28 });
    } else {
      const len = rng.between(8, 18);
      const [cx, cy] = [rng.between(-W / 2 + 3, W / 2 - 3), rng.between(-D / 2 + len / 2 + 1, D / 2 - len / 2 - 1)];
      for (let k = 0; k < n; k++) out.push({ x: cx + (k - (n - 1) / 2) * 0.75, y: cy, w: 0.28, h: len });
    }
  }
  return out;
}

/** Where each via of the stack sits: one of each kind on the cut line (y = 0) plus a field of through vias. */
function viaSites(vias: StackVia[]) {
  const sites: { via: StackVia; x: number; y: number }[] = [];
  const kinds = vias.length;
  vias.forEach((v, i) => {
    const x = -15 + (30 * (i + 0.5)) / kinds;
    sites.push({ via: v, x, y: 0 });
    if (v.kind === "through") for (const [dx, dy] of [[-3, -3], [3, -3.5], [-2, 4], [4, 3]]) sites.push({ via: v, x: x + dx, y: dy });
  });
  return sites;
}

// ───────────────────────────── Meshes ─────────────────────────────

function Boxes({ items, z, t, color, metal, selected }: { items: Rect[]; z: number; t: number; color: string; metal?: boolean; selected?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((st) => st.invalidate);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    items.forEach((b, i) => {
      m.compose(new THREE.Vector3(b.x, b.y, z + t / 2), q, new THREE.Vector3(b.w, b.h, t));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [items, z, t, invalidate]);
  if (!items.length) return null;
  return (
    <instancedMesh key={items.length} ref={ref} args={[undefined, undefined, items.length]}>
      <boxGeometry />
      <meshStandardMaterial color={color} metalness={metal ? 0.55 : 0} roughness={metal ? 0.35 : 0.7} emissive={selected ? SELECT : undefined} emissiveIntensity={selected ? 0.35 : 0} />
    </instancedMesh>
  );
}

function Rounds({ items, z, t, color, selected }: { items: Round[]; z: number; t: number; color: string; selected?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((st) => st.invalidate);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    items.forEach((b, i) => {
      m.compose(new THREE.Vector3(b.x, b.y, z + t / 2), q, new THREE.Vector3(b.r, t, b.r));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [items, z, t, invalidate]);
  if (!items.length) return null;
  return (
    <instancedMesh key={items.length} ref={ref} args={[undefined, undefined, items.length]}>
      <cylinderGeometry args={[1, 1, 1, 20]} />
      <meshStandardMaterial color={color} metalness={0.55} roughness={0.35} emissive={selected ? SELECT : undefined} emissiveIntensity={selected ? 0.35 : 0} />
    </instancedMesh>
  );
}

/** A full sheet with rectangular/round openings, extruded to thickness t. */
function Sheet({ holes, roundHoles, z, t, color, opacity = 1, metal, selected, inset = 0 }: { holes: Rect[]; roundHoles: Round[]; z: number; t: number; color: string; opacity?: number; metal?: boolean; selected?: boolean; inset?: number }) {
  const geometry = useMemo(() => {
    const s = new THREE.Shape();
    const [hw, hd] = [W / 2 - inset, D / 2 - inset];
    s.moveTo(-hw, -hd);
    s.lineTo(hw, -hd);
    s.lineTo(hw, hd);
    s.lineTo(-hw, hd);
    s.closePath();
    for (const h of holes) {
      const p = new THREE.Path();
      p.moveTo(h.x - h.w / 2, h.y - h.h / 2);
      p.lineTo(h.x - h.w / 2, h.y + h.h / 2);
      p.lineTo(h.x + h.w / 2, h.y + h.h / 2);
      p.lineTo(h.x + h.w / 2, h.y - h.h / 2);
      p.closePath();
      s.holes.push(p);
    }
    for (const r of roundHoles) {
      const p = new THREE.Path();
      p.absarc(r.x, r.y, r.r, 0, Math.PI * 2, true);
      s.holes.push(p);
    }
    return new THREE.ExtrudeGeometry(s, { ...EXTRUDE, depth: t, curveSegments: 18 });
  }, [holes, roundHoles, t, inset]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={[0, 0, z]}>
      <meshStandardMaterial
        color={color}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity >= 1}
        metalness={metal ? 0.55 : 0}
        roughness={metal ? 0.35 : 0.6}
        side={THREE.DoubleSide}
        emissive={selected ? SELECT : undefined}
        emissiveIntensity={selected ? 0.3 : 0}
      />
    </mesh>
  );
}

/** Plated barrel with annular pads at both ends; microvias are filled copper cones. */
function Via({ x, y, via, z0, z1, padT, selected, onSelect }: { x: number; y: number; via: StackVia; z0: number; z1: number; padT: number; selected: boolean; onSelect: () => void }) {
  const r = (via.drillMm * VIA_SCALE) / 2;
  const h = z1 - z0;
  const ring = useMemo(() => {
    const s = new THREE.Shape();
    s.absarc(0, 0, r * 1.9, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, via.kind === "micro" ? 0.001 : r * 0.62, 0, Math.PI * 2, true);
    s.holes.push(hole);
    return new THREE.ExtrudeGeometry(s, { ...EXTRUDE, depth: padT, curveSegments: 24 });
  }, [r, padT, via.kind]);
  useEffect(() => () => ring.dispose(), [ring]);
  const mat = <meshStandardMaterial color={COLOR.copper} metalness={0.6} roughness={0.3} side={THREE.DoubleSide} emissive={selected ? SELECT : undefined} emissiveIntensity={selected ? 0.45 : 0} />;
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return;
    e.stopPropagation();
    onSelect();
  };
  const upright = new THREE.Euler(Math.PI / 2, 0, 0);
  return (
    <group position={[x, y, 0]} onClick={click}>
      {via.kind === "micro" ? (
        <mesh position={[0, 0, (z0 + z1) / 2]} rotation={upright} scale={[1, h, 1]}>
          <cylinderGeometry args={via.from < via.to ? [r * 1.25, r * 0.7, 1, 20] : [r * 0.7, r * 1.25, 1, 20]} />
          {mat}
        </mesh>
      ) : (
        <>
          <mesh position={[0, 0, (z0 + z1) / 2]} rotation={upright} scale={[1, h, 1]}>
            <cylinderGeometry args={[r, r, 1, 24, 1, true]} />
            {mat}
          </mesh>
          <mesh position={[0, 0, (z0 + z1) / 2]} rotation={upright} scale={[1, h + 0.02, 1]}>
            <cylinderGeometry args={[r * 0.62, r * 0.62, 1, 20, 1, true]} />
            <meshStandardMaterial color={COLOR.hole} side={THREE.BackSide} />
          </mesh>
        </>
      )}
      <mesh geometry={ring} position={[0, 0, z1 - padT]}>
        {mat}
      </mesh>
      <mesh geometry={ring} position={[0, 0, z0]}>
        {mat}
      </mesh>
    </group>
  );
}

// ───────────────────────────── Explorer ─────────────────────────────

export default function PcbExplorer({ initial }: { initial?: string }) {
  const reduced = useReducedMotion();
  const [key, setKey] = useState(pcbStack(initial).key);
  const [explodeTarget, setExplode] = useState(0.35);
  const explode = useEased(explodeTarget, reduced);
  const [cut, setCut] = useState(true);
  const [showDielectric, setShowDielectric] = useState(true);
  const [showMask, setShowMask] = useState(true);
  const [showVias, setShowVias] = useState(true);
  const [finish, setFinish] = useState<FinishKey>("enig");
  const [view, setView] = useState<View>("angled");
  const [selected, setSelected] = useState<Selection>(null);

  const stack = pcbStack(key);
  const layout = useMemo(() => layoutStack(stack, explode), [stack, explode]);
  const total = layout.copper.size;
  const art = useMemo(() => {
    const fp = { top: footprints("top"), bottom: footprints("bottom") };
    const maskHoles = (side: "top" | "bottom") => ({
      rects: fp[side].pads.map((p) => ({ ...p, w: p.w + 0.2, h: p.h + 0.2 })),
      rounds: fp[side].balls.map((b) => ({ ...b, r: b.r + 0.1 })),
    });
    return { ...fp, mask: { top: maskHoles("top"), bottom: maskHoles("bottom") } };
  }, []);
  const sites = useMemo(() => viaSites(stack.vias), [stack]);
  /** Per copper layer: its routing (signal layers) or its antipads (planes). */
  const copperArt = useMemo(() => {
    const n = stack.layers.filter((l) => l.kind === "copper").length;
    return new Map(
      Array.from({ length: n }, (_, i) => {
        const no = i + 1;
        const crossing = sites.filter((s) => Math.min(s.via.from, s.via.to) <= no && Math.max(s.via.from, s.via.to) >= no);
        return [no, { traces: traces(no, no === 1 ? "top" : no === n ? "bottom" : "inner"), antipads: crossing.map((s) => ({ x: s.x, y: s.y, r: (s.via.drillMm * VIA_SCALE) / 2 + 0.55 })) }] as const;
      }),
    );
  }, [stack, sites]);
  const finishColor = FINISHES.find((f) => f.key === finish)!.color;
  const pick = (layerKey: string) => (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return;
    e.stopPropagation();
    setSelected({ kind: "layer", key: layerKey });
  };

  const selLayer = selected?.kind === "layer" ? layout.layers.find((l) => l.key === selected.key) : undefined;
  const info = selected?.kind === "via" ? VIA_INFO[selected.via] : selLayer ? { label: selLayer.label, detail: selLayer.detail } : null;

  function renderLayer(l: PlacedLayer) {
    const t = l.z1 - l.z0;
    const sel = selected?.kind === "layer" && selected.key === l.key;
    if (l.kind === "core" || l.kind === "prepreg") {
      if (!showDielectric) return null;
      return (
        <mesh key={l.key} position={[0, 0, (l.z0 + l.z1) / 2]} onClick={pick(l.key)}>
          <boxGeometry args={[W, D, t]} />
          <meshStandardMaterial color={l.kind === "core" ? COLOR.core : COLOR.prepreg} transparent opacity={0.78} depthWrite={false} roughness={0.85} emissive={sel ? SELECT : undefined} emissiveIntensity={sel ? 0.3 : 0} />
        </mesh>
      );
    }
    const side = l.key.endsWith("top") ? "top" : "bottom";
    if (l.kind === "mask" || l.kind === "silk") {
      if (!showMask) return null;
      if (l.kind === "silk") {
        return (
          <group key={l.key} onClick={pick(l.key)}>
            <Boxes items={art[side].silk} z={l.z0} t={t} color={COLOR.silk} selected={sel} />
          </group>
        );
      }
      return (
        <group key={l.key} onClick={pick(l.key)}>
          <Sheet holes={art.mask[side].rects} roundHoles={art.mask[side].rounds} z={l.z0} t={t} color={COLOR.mask} opacity={0.86} selected={sel} />
        </group>
      );
    }
    // Copper
    const no = l.copper!;
    const outer = no === 1 ? "top" : no === total ? "bottom" : null;
    const fp = outer ? art[outer] : null;
    const cu = copperArt.get(no)!;
    return (
      <group key={l.key} onClick={pick(l.key)}>
        {l.role === "plane" ? (
          <Sheet
            holes={NO_RECTS}
            roundHoles={cu.antipads}
            z={l.z0}
            t={t}
            color={COLOR.copper}
            metal
            inset={0.6}
            selected={sel}
          />
        ) : (
          <Boxes items={cu.traces} z={l.z0} t={t} color={COLOR.copper} metal selected={sel} />
        )}
        {fp ? (
          <>
            <Boxes items={fp.pads} z={l.z0} t={t * 1.4} color={finishColor} metal selected={sel} />
            <Rounds items={fp.balls} z={l.z0} t={t * 1.4} color={finishColor} selected={sel} />
          </>
        ) : null}
      </group>
    );
  }

  const labelZ = selLayer ? (selLayer.z0 + selLayer.z1) / 2 : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="relative h-[420px] overflow-hidden rounded-xl border bg-muted/60 sm:h-[560px]">
        <ExploreCanvas cut={cut} camera={VIEWS[view]} label={`${stack.label} PCB stack-up in 3D`}>
          <group onPointerMissed={() => setSelected(null)}>
            {layout.layers.map(renderLayer)}
            {showVias
              ? sites.map((s, i) => {
                  const [z0, z1] = viaSpan(layout, s.via);
                  return (
                    <Via
                      key={i}
                      x={s.x}
                      y={s.y}
                      via={s.via}
                      z0={z0}
                      z1={z1}
                      padT={0.26}
                      selected={selected?.kind === "via" && selected.via === s.via.kind}
                      onSelect={() => setSelected({ kind: "via", via: s.via.kind })}
                    />
                  );
                })
              : null}
            {selLayer ? (
              <Html position={[W / 2 + 0.5, cut ? 0 : -D / 2, labelZ]} style={{ pointerEvents: "none" }}>
                <div className="ml-2 -translate-y-1/2 rounded-md border bg-card px-2 py-1 text-xs whitespace-nowrap">
                  {selLayer.label} · <span className="num">{selLayer.um} µm</span>
                </div>
              </Html>
            ) : null}
          </group>
        </ExploreCanvas>
        <ViewButtons value={view} onChange={setView} options={[{ value: "angled", label: "Angled" }, { value: "edge", label: "Edge-on" }, { value: "top", label: "Top" }]} />
        <p className="pointer-events-none absolute right-3 bottom-2 text-[11px] text-muted-foreground">Drag to turn · scroll to zoom · click a layer</p>
      </div>

      <div className="space-y-5 rounded-xl border bg-card p-5">
        <ControlGroup title="Stack-up">
          <Segmented
            label="Stack-up"
            value={key}
            onChange={(k) => {
              setKey(k);
              setSelected(null);
            }}
            options={PCB_STACKS.map((s) => ({ value: s.key, label: s.label }))}
          />
          <p className="text-sm leading-relaxed text-muted-foreground">{stack.summary}</p>
          <p className="num text-xs text-muted-foreground">
            {total} copper layers · ≈ {thicknessMm(stack).toFixed(2)} mm finished
          </p>
        </ControlGroup>
        <Slider label="Separate layers" value={explodeTarget} onChange={setExplode} />
        <ControlGroup title="Show">
          <div className="grid grid-cols-2 gap-2">
            <Toggle checked={cut} onChange={setCut}>Cut-away</Toggle>
            <Toggle checked={showVias} onChange={setShowVias}>Vias</Toggle>
            <Toggle checked={showDielectric} onChange={setShowDielectric}>Dielectric</Toggle>
            <Toggle checked={showMask} onChange={setShowMask}>Mask & silk</Toggle>
          </div>
        </ControlGroup>
        <ControlGroup title="Surface finish">
          <Segmented label="Surface finish" value={finish} onChange={setFinish} options={FINISHES.map((f) => ({ value: f.key, label: f.label }))} />
          <p className="text-xs leading-relaxed text-muted-foreground">{FINISHES.find((f) => f.key === finish)!.detail}</p>
        </ControlGroup>

        <ControlGroup title="Layers, top to bottom">
          <ul className="-mx-2 max-h-64 overflow-y-auto">
            {stack.layers.map((l) => {
              const on = selected?.kind === "layer" && selected.key === l.key;
              const swatch = l.kind === "copper" ? COLOR.copper : l.kind === "mask" ? COLOR.mask : l.kind === "silk" ? "#e5e5e0" : l.kind === "core" ? COLOR.core : COLOR.prepreg;
              return (
                <li key={l.key}>
                  <button
                    type="button"
                    onClick={() => setSelected(on ? null : { kind: "layer", key: l.key })}
                    aria-pressed={on}
                    className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring", on ? "bg-primary/10" : "hover:bg-muted/60")}
                  >
                    <span aria-hidden className="size-3 shrink-0 rounded-sm border border-black/10" style={{ background: swatch }} />
                    <span className="min-w-0 flex-1 truncate">
                      {l.label}
                      {l.role ? <span className="text-muted-foreground"> · {l.role}</span> : null}
                    </span>
                    <span className="num text-muted-foreground">{l.um} µm</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </ControlGroup>

        <ControlGroup title="Vias in this stack">
          <ul className="flex flex-wrap gap-1.5">
            {[...new Set(stack.vias.map((v) => v.kind))].map((k) => {
              const v = stack.vias.find((x) => x.kind === k)!;
              const on = selected?.kind === "via" && selected.via === k;
              return (
                <li key={k}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSelected(on ? null : { kind: "via", via: k })}
                    className={cn("h-7 rounded-md border px-2 text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring", on ? "border-primary/40 bg-primary/10" : "hover:bg-muted")}
                  >
                    {VIA_INFO[k].label} <span className="num text-muted-foreground">L{Math.min(v.from, v.to)}–L{Math.max(v.from, v.to)}</span>
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
            <ul className="space-y-1.5 text-muted-foreground">
              {stack.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
