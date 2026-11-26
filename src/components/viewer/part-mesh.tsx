"use client";

import { useEffect, useMemo, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { SHAPE_MODEL, type BodySpec } from "@/lib/board/bodies";
import { buildBody as buildBodyImpl } from "@/vendor/circuitflow/partModels.js";
import { splitMarking } from "@/lib/board/marking";
import { RoundedBox } from "@react-three/drei";
import { ShapedBody } from "./part-shapes";

const METAL = "#c9ccd2";
const GOLD = "#d4af37";
/** Chip resistor body colour (src/lib/board/bodies.ts). */
const RES_BLACK = "#2a2a2a";

let WEDGE: THREE.BufferGeometry | null = null;
/**
 * A solder fillet: a ramp from the pad up the face of a terminal. One unit wedge (1 long in x, 1 wide in y, 1 high
 * at x = 0), scaled and turned for every joint.
 */
function wedge(): THREE.BufferGeometry {
  if (WEDGE) return WEDGE;
  const g = new THREE.BufferGeometry();
  // prettier-ignore
  const v = [0,-0.5,0, 1,-0.5,0, 0,-0.5,1,   0,0.5,0, 0,0.5,1, 1,0.5,0,   1,-0.5,0, 1,0.5,0, 0,0.5,1,  1,-0.5,0, 0,0.5,1, 0,-0.5,1];
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  WEDGE = g;
  return g;
}

/** Package kinds that carry a laser marking big enough to read. */
const MARKED: BodySpec["kind"][] = ["gullwing", "quad", "leadless", "array", "power"];
const MARK_ASPECT = 512 / 160;

/** One texture per marking text, shared by every part that carries it. */
const MARKS = new Map<string, THREE.CanvasTexture>();
function markingTexture(text: string): THREE.CanvasTexture | null {
  const hit = MARKS.get(text);
  if (hit) return hit;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const g = canvas.getContext("2d");
  if (!g) return null;
  const lines = splitMarking(text);
  let size = lines.length > 1 ? 66 : 92;
  const font = () => `600 ${size}px ui-monospace, Consolas, monospace`;
  g.font = font();
  while (size > 24 && Math.max(...lines.map((l) => g.measureText(l).width)) > 470) {
    size -= 4;
    g.font = font();
  }
  g.fillStyle = "rgba(205, 205, 198, 0.85)";
  g.textAlign = "center";
  g.textBaseline = "middle";
  lines.forEach((l, i) => g.fillText(l, 256, 80 + (i - (lines.length - 1) / 2) * size * 1.1));
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  MARKS.set(text, t);
  return t;
}

type StudioMaterial = (color: number, metalness?: number, roughness?: number) => THREE.MeshStandardMaterial;
const buildBody = buildBodyImpl as (three: typeof THREE, part: Record<string, unknown>, scale: number, tools: { mat: StudioMaterial; partPads: () => unknown[] }) => { mesh: THREE.Mesh; h: number };

/** The studio's models are built at its own scale (their decal offsets are sized for it), then brought up to millimetres. */
const STUDIO_SCALE = 0.1;

/**
 * A body drawn by the board studio's own model (a finned heatsink, a wound transformer, a Mini-Fit header …), so
 * the box-build view shows a part exactly as the board view does. Turned from the studio's y-up frame to this
 * view's z-up one and seated on the board. Null for a shape the studio has no model for.
 */
function studioBody(body: BodySpec, tint: string | null, marking: string | null, sink?: { device?: boolean; channel?: boolean }): THREE.Mesh | null {
  const model = body.shape ? SHAPE_MODEL[body.shape] : undefined;
  if (!model) return null;
  const mat: StudioMaterial = (color, metalness = 0.1, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const part = { ref: "", value: "", mpn: marking ?? "", package: "", type: "other", w: body.length, d: body.width, h: body.height, model, pins: body.pins, pitch: body.pitch, color: body.color, ...sink };
  const { mesh, h } = buildBody(THREE, part, STUDIO_SCALE, { mat, partPads: () => [] });
  // A risk colour goes on the body itself; leads, pins and tape keep their own.
  if (tint) for (const m of [mesh.material].flat()) (m as THREE.MeshStandardMaterial).color.set(tint);
  mesh.scale.setScalar(1 / STUDIO_SCALE);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.z = h / STUDIO_SCALE / 2;
  return mesh;
}

const materialsOf = (o: THREE.Object3D) => [(o as THREE.Mesh).material].flat().filter((m): m is THREE.MeshStandardMaterial => !!m && "emissive" in m);

/** Renders one component body from its BodySpec. Origin = centre of the footprint on the board surface. */
export function PartBody({
  body,
  color,
  emissive,
  marking,
  sink,
  onClick,
  onHover,
}: {
  body: BodySpec;
  /** For a heatsink: how the power parts round it say it is drawn (`heatsinkLooks`), as the board studio draws it. */
  sink?: { device?: boolean; channel?: boolean };
  color?: string;
  emissive?: string;
  /** Text printed on the top of ICs (usually the MPN); hidden under a risk overlay. */
  marking?: string | null;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  onHover?: (on: boolean) => void;
}) {
  const [hover, setHover] = useState(false);
  const c = color ?? body.color;
  const em = emissive ?? (hover ? "#3a2a4a" : "#000");
  const L = Math.max(0.3, body.length);
  const W = Math.max(0.2, body.width);
  const H = Math.max(0.15, body.height);
  const handlers = {
    onClick,
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHover(true);
      onHover?.(true);
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      setHover(false);
      onHover?.(false);
      document.body.style.cursor = "";
    },
  };

  const leads = useMemo(() => {
    const out: { p: [number, number, number]; s: [number, number, number] }[] = [];
    /**
     * A gull-wing lead: out of the body's side (shoulder), bent down, and a foot flat on the pad.
     * `o` is the position along the body edge, `edge` the distance from the centre to that edge, `s` the side.
     */
    const gull = (o: number, edge: number, s: number, acrossY: boolean, reach: number, wd: number) => {
      const th = 0.15;
      const hs = Math.min(H * 0.5, 0.75);
      const a = reach * 0.4;
      const foot = reach - a;
      const put = (out_: number, z: number, len: number, h: number) =>
        out.push(acrossY ? { p: [o, s * out_, z], s: [wd, len, h] } : { p: [s * out_, o, z], s: [len, wd, h] });
      put(edge + a / 2, hs, a, th);
      put(edge + a, (hs + th / 2) / 2, th, hs + th / 2);
      put(edge + a + foot / 2, th / 2, foot, th);
    };
    if (body.kind === "gullwing") {
      const per = Math.max(1, Math.ceil(body.pins / 2));
      const pitch = Math.min(body.pitch, (L * 0.95) / per);
      for (let i = 0; i < per; i++) {
        const x = (i - (per - 1) / 2) * pitch;
        for (const s of [-1, 1]) gull(x, W / 2, s, true, 0.9, pitch * 0.45);
      }
    } else if (body.kind === "quad") {
      const per = Math.max(1, Math.ceil(body.pins / 4));
      for (let i = 0; i < per; i++) {
        const o = (i - (per - 1) / 2) * body.pitch;
        for (const s of [-1, 1]) {
          gull(o, W / 2, s, true, 1.2, body.pitch * 0.45);
          gull(o, L / 2, s, false, 1.2, body.pitch * 0.45);
        }
      }
    } else if (body.kind === "leadless") {
      const per = Math.max(1, Math.ceil(body.pins / 4));
      for (let i = 0; i < per; i++) {
        const o = (i - (per - 1) / 2) * body.pitch;
        out.push({ p: [o, -W / 2, 0.05], s: [body.pitch * 0.5, 0.35, 0.1] }, { p: [o, W / 2, 0.05], s: [body.pitch * 0.5, 0.35, 0.1] });
      }
    } else if (body.kind === "power") {
      const legs = Math.max(2, Math.min(body.pins, 7));
      for (let i = 0; i < legs; i++) out.push({ p: [(i - (legs - 1) / 2) * Math.min(body.pitch, L / legs), -(W / 2 + 1.5), 0.3], s: [0.8, 3, 0.5] });
    }
    return out;
  }, [body, L, W, H]);
  // One material for every lead of the part: a QFP-100 has 300 lead pieces.
  const leadMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: body.kind === "leadless" ? GOLD : "#dfe2e6", metalness: 0.7, roughness: 0.3 }),
    [body.kind],
  );

  // Shapes with a hand-drawn body here keep it; the rest of the named shapes use the studio's model.
  const shaped = body.shape ? ShapedBody({ body, look: { c, em, fade: null, tinted: !!color } }) : null;
  const drawnHere = !!shaped;
  const built = useMemo(() => (drawnHere ? null : studioBody(body, color ?? null, color ? null : (marking ?? null), sink)), [drawnHere, body, color, marking, sink]);
  useEffect(() => {
    built?.traverse((o) => materialsOf(o).forEach((m) => m.emissive.set(em)));
  }, [built, em]);
  // A primitive is not disposed with its component: free what the model made (shared marking textures stay).
  useEffect(
    () => () =>
      built?.traverse((o) => {
        (o as THREE.Mesh).geometry?.dispose();
        materialsOf(o).forEach((m) => m.dispose());
      }),
    [built],
  );
  if (built)
    return (
      <group {...handlers}>
        <primitive object={built} />
      </group>
    );

  if (body.shape) {
    // DIP chips still get their marking, like any other IC.
    const dipMark = body.shape === "dip" && marking && !color ? markingTexture(marking) : null;
    if (shaped)
      return (
        <group {...handlers}>
          {shaped}
          {dipMark ? (
            <mesh position={[0, 0, 0.5 + H + 0.01]}>
              <planeGeometry args={[Math.min(L * 0.8, W * 0.6 * MARK_ASPECT), Math.min(L * 0.8, W * 0.6 * MARK_ASPECT) / MARK_ASPECT]} />
              <meshStandardMaterial map={dipMark} transparent depthWrite={false} roughness={0.8} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
            </mesh>
          ) : null}
        </group>
      );
  }

  if (body.kind === "can") {
    const r = W / 2;
    return (
      <group {...handlers}>
        <mesh position={[0, 0, H / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[r, r, H, 32]} />
          <meshStandardMaterial color={c} emissive={em} metalness={0.3} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0, H + 0.01]}>
          <circleGeometry args={[r * 0.92, 32]} />
          <meshStandardMaterial color="#d6d8dc" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* The polarity mark printed across one side of the top. */}
        <mesh position={[0, 0, H + 0.02]}>
          <circleGeometry args={[r * 0.92, 24, Math.PI * 0.62, Math.PI * 0.76]} />
          <meshStandardMaterial color="#17181b" roughness={0.6} />
        </mesh>
        {body.shape ? null : (
          <mesh position={[0, 0, 0.25]} castShadow>
            <boxGeometry args={[L, W, 0.5]} />
            <meshStandardMaterial color="#1b1c1f" roughness={0.7} />
          </mesh>
        )}
      </group>
    );
  }

  const bodyZ = body.kind === "leadless" || body.kind === "array" ? H / 2 + 0.05 : H / 2;
  const topZ = H + (body.kind === "leadless" ? 0.05 : 0);
  // Chip resistors from 0603 up carry their value code between the end caps.
  const chipMark = body.kind === "chip" && L >= 1.5 && body.color === RES_BLACK;
  const mark = marking && !color && ((MARKED.includes(body.kind) && L >= 1.8 && W >= 1.2) || chipMark) ? markingTexture(marking) : null;
  // Keep the canvas aspect so text is never stretched; shrink to fit narrow bodies.
  let markW = L * (chipMark ? 0.55 : 0.8);
  let markH = markW / MARK_ASPECT;
  if (markH > W * 0.6) {
    markH = W * 0.6;
    markW = markH * MARK_ASPECT;
  }
  const bodyL = body.kind === "chip" ? L * 0.72 : L;
  // Solder: a fillet at each end of a chip or moulded part, as wide as the terminal and about half its height.
  const fillet = body.kind === "chip" || body.kind === "molded" ? { reach: Math.min(0.45, Math.max(0.12, L * 0.16)), wide: W * (body.kind === "chip" ? 0.92 : 0.6), high: Math.min(H * 0.6, 0.6) } : null;
  const metallic = body.kind === "module" || body.kind === "crystal";
  // ICs big enough for their edges to show.
  const moulded = (body.kind === "gullwing" || body.kind === "quad" || body.kind === "leadless" || body.kind === "array" || body.kind === "power") && Math.min(L, W) >= 1.2 && H >= 0.5;
  const bodyH = body.kind === "array" ? H - 0.4 : H;
  return (
    <group {...handlers}>
      {body.kind === "array" ? (
        <mesh position={[0, 0, 0.25]}>
          <boxGeometry args={[L, W, 0.3]} />
          <meshStandardMaterial color="#1d3b26" />
        </mesh>
      ) : null}
      {body.kind === "module" ? (
        <mesh position={[0, 0, 0.4]}>
          <boxGeometry args={[L, W, 0.8]} />
          <meshStandardMaterial color="#1f4f2f" />
        </mesh>
      ) : null}
      {moulded ? (
        // A moulded IC body has eased edges: they catch the light the way the real package does.
        <RoundedBox args={[L, W, bodyH]} radius={Math.min(0.14, bodyH * 0.22, Math.min(L, W) * 0.1)} smoothness={3} position={[0, 0, body.kind === "array" ? 0.4 + bodyH / 2 : bodyZ]} castShadow>
          <meshStandardMaterial color={c} emissive={em} metalness={0.05} roughness={0.55} />
        </RoundedBox>
      ) : body.kind === "chip" && Math.min(W, H) >= 0.4 ? (
        // A chip part is fired ceramic: eased edges, a slight sheen.
        <RoundedBox args={[bodyL, W, H]} radius={Math.min(0.08, H * 0.18, W * 0.12)} smoothness={2} position={[0, 0, bodyZ]} castShadow>
          <meshStandardMaterial color={c} emissive={em} metalness={0.05} roughness={0.5} />
        </RoundedBox>
      ) : (
        <mesh position={[0, 0, body.kind === "module" ? 0.8 + (H - 0.8) / 2 : bodyZ]} castShadow>
          <boxGeometry args={[body.kind === "module" ? L * 0.92 : bodyL, body.kind === "module" ? W * 0.75 : W, body.kind === "module" ? Math.max(0.5, H - 0.8) : H]} />
          <meshStandardMaterial color={c} emissive={em} metalness={metallic ? 0.6 : 0.05} roughness={metallic ? 0.32 : 0.6} />
        </mesh>
      )}
      {fillet
        ? [-1, 1].map((s) => (
            <mesh key={`solder${s}`} geometry={wedge()} position={[(s * L) / 2, 0, 0]} rotation={[0, 0, s === 1 ? 0 : Math.PI]} scale={[fillet.reach, fillet.wide, fillet.high]}>
              <meshStandardMaterial color="#d3d6da" metalness={0.92} roughness={0.2} />
            </mesh>
          ))
        : null}
      {body.kind === "chip"
        ? [-1, 1].map((s) => (
            // The termination wraps round the end of the body: a touch wider and taller than the ceramic.
            <mesh key={s} position={[(s * (L - L * 0.16)) / 2, 0, H / 2]} castShadow>
              <boxGeometry args={[L * 0.16, W * 1.03, H * 1.04]} />
              <meshStandardMaterial color="#d9dcdf" metalness={0.85} roughness={0.28} />
            </mesh>
          ))
        : null}
      {body.kind === "molded"
        ? [-1, 1].map((s) => (
            <mesh key={s} position={[(s * L) / 2, 0, 0.1]}>
              <boxGeometry args={[0.3, W * 0.6, 0.2]} />
              <meshStandardMaterial color={METAL} metalness={0.9} roughness={0.3} />
            </mesh>
          ))
        : null}
      {body.kind === "power" ? (
        <mesh position={[0, W / 2 + 1.2, 0.5]}>
          <boxGeometry args={[L * 0.85, 2.4, 1]} />
          <meshStandardMaterial color={METAL} metalness={0.9} roughness={0.3} />
        </mesh>
      ) : null}
      {body.kind === "connector" ? (
        <mesh position={[0, -W / 2 + 0.01, H * 0.55]}>
          <boxGeometry args={[L * 0.8, 0.05, H * 0.5]} />
          <meshStandardMaterial color="#222" />
        </mesh>
      ) : null}
      {mark ? (
        <>
          <mesh position={[0, body.kind === "power" ? -W * 0.08 : 0, topZ]}>
            <planeGeometry args={[markW, markH]} />
            <meshStandardMaterial map={mark} transparent depthWrite={false} roughness={0.8} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
          </mesh>
          {/* pin-1 dimple */}
          {chipMark ? null : <mesh position={[-L * 0.38, W * 0.3, topZ]}>
            <circleGeometry args={[Math.min(L, W) * 0.06, 20]} />
            <meshStandardMaterial color="#45464b" roughness={0.35} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
          </mesh>}
        </>
      ) : null}
      {leads.map((l, i) => (
        <mesh key={i} position={l.p} material={leadMat}>
          <boxGeometry args={l.s} />
        </mesh>
      ))}
    </group>
  );
}
