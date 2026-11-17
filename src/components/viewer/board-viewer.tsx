"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import Link from "next/link";
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Html, Lightformer, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { AlertTriangle, BookOpen, Box, CircuitBoard, Cpu, FileText, Hand, Layers, Maximize, Minimize, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { PartPhoto } from "@/components/data/part-photo";
import { formatMoney, type Currency } from "@/lib/currency";
import { scoreToRisk, type RiskLevel } from "@/lib/risk";
import { SCORE_KEYS, SCORE_LABEL } from "@/lib/bom/scores";
import { ScorePill, LifecycleBadge } from "@/components/data/badges";
import { cn } from "@/lib/utils";
import { VIEW_LABEL, fitDistance, viewDirection, type CameraView } from "@/lib/board/camera";
import { EnclosureModel, boardPlacement, boxFloorZ, boxFrame, type Shell } from "./enclosure";
import { PartBody } from "./part-mesh";
import { ProductPanel, fitVerdict } from "./product-panel";
import { RoutePanel } from "./route-panel";
import { BomListPanel } from "./bom-list-panel";
import { seg } from "./ui";
import { maskColor, type Face } from "./textures";
import type { ViewerData, ViewerPart } from "./types";
import { BoardStudio, type StudioMode } from "@/vendor/circuitflow/studio/entry";
import { useBoardTextures, useStudioBoard } from "./board-textures";

/** bare: the finished board with nothing on it · pcb: its layers pulled apart · pcba: assembled · box: in its enclosure. */
export type Mode = "bare" | "pcb" | "pcba" | "box";
type Overlay = "real" | "worst" | "availability" | "resilience" | "economic" | "lifecycle";
type View = CameraView;
type ViewApi = { zoom: (factor: number) => void; pan: (on: boolean) => void };

const RISK_COLOR: Record<RiskLevel, string> = { green: "#2f9e57", amber: "#e0a526", red: "#d64545", grey: "#8a8f98" };
const FR4 = "#c9b77a";
/** Distance between layers of the exploded stack-up. */
const stackGap = (explode: number) => 1.5 + explode * 13;

function overlayColor(p: ViewerPart, o: Overlay): string | undefined {
  if (o === "real") return undefined;
  if (!p.partId && !p.dnp) return RISK_COLOR.red;
  if (p.dnp) return "#d0d3d8";
  if (o === "lifecycle") return RISK_COLOR[p.lifecycle === "ACTIVE" ? "green" : p.lifecycle === "NRND" ? "amber" : p.lifecycle ? "red" : "grey"];
  const v = o === "worst" ? p.worst : p.scores?.[o] ?? null;
  return RISK_COLOR[scoreToRisk(v)];
}

// ───────────────────────────── Scene pieces ─────────────────────────────

/** Puts the camera where the whole w × h footprint, `depth` tall, fits the canvas with a margin. */
function CameraRig({ view, w, h, depth, nonce }: { view: View; w: number; h: number; depth: number; /** Bumped by "Reset view". */ nonce: number }) {
  const { camera, invalidate, get } = useThree();
  useEffect(() => {
    const { size, controls } = get();
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 32;
    const { dir, up } = viewDirection(view);
    const d = fitDistance(dir, up, { w, h, depth }, fov, size.width / Math.max(1, size.height), 1.15);
    camera.position.copy(dir.multiplyScalar(d));
    camera.up.copy(up);
    camera.lookAt(0, 0, 0);
    // A pan moves the orbit centre; a new view or a reset brings it back to the board.
    const orbit = controls as unknown as { target?: THREE.Vector3; update?: () => void } | null;
    orbit?.target?.set(0, 0, 0);
    orbit?.update?.();
    // The canvas renders on demand; moving the camera by hand needs a frame.
    invalidate();
  }, [view, w, h, depth, nonce, camera, invalidate, get]);
  return null;
}

/** Gives the toolbar its zoom and pan-mode buttons, which act on the camera and the orbit controls. */
function ViewTools({ api, minDistance, maxDistance }: { api: MutableRefObject<ViewApi | null>; minDistance: number; maxDistance: number }) {
  const { camera, invalidate, get } = useThree();
  useEffect(() => {
    api.current = {
      zoom: (factor) => {
        const orbit = get().controls as unknown as { target: THREE.Vector3; update: () => void } | null;
        const target = orbit?.target ?? new THREE.Vector3();
        const offset = camera.position.clone().sub(target);
        const d = THREE.MathUtils.clamp(offset.length() * factor, minDistance, maxDistance);
        camera.position.copy(target.clone().add(offset.setLength(d)));
        orbit?.update();
        invalidate();
      },
      pan: (on) => {
        const orbit = get().controls as unknown as { mouseButtons: Record<string, number>; touches: Record<string, number> } | null;
        if (!orbit) return;
        orbit.mouseButtons.LEFT = on ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
        orbit.mouseButtons.RIGHT = on ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
        orbit.touches.ONE = on ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
      },
    };
    return () => {
      api.current = null;
    };
  }, [api, camera, invalidate, get, minDistance, maxDistance]);
  return null;
}

/** The canvas draws only on demand: ask for a frame whenever what is shown changes, and once more after it settles. */
function Redraw({ on }: { on: string }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
    // Textures, markings and the studio light finish compiling a moment later: draw again once they have.
    const ts = [120, 450, 1200].map((ms) => setTimeout(() => invalidate(), ms));
    return () => ts.forEach(clearTimeout);
  }, [on, invalidate]);
  return null;
}

/** Soft studio light from a few light panels — reflections on metal, lacquer and plastic, no network fetch. */
function Studio() {
  return (
    <Environment resolution={256} frames={1}>
      {/* key panel off-axis, so a top-down view isn't one big reflection */}
      <Lightformer form="rect" intensity={1.8} position={[90, -110, 120]} scale={[150, 100, 1]} />
      <Lightformer form="rect" intensity={0.5} position={[0, 0, 160]} scale={[80, 80, 1]} />
      <Lightformer form="rect" intensity={0.6} position={[-150, 110, 50]} scale={[140, 60, 1]} color="#f3efe6" />
      <Lightformer form="ring" intensity={0.8} position={[0, -200, 20]} scale={60} />
      {/* bounce from the bench, so the solder side isn't black */}
      <Lightformer form="rect" intensity={0.7} position={[0, 0, -150]} scale={[180, 180, 1]} />
    </Environment>
  );
}

/** A blurred shadow on an invisible floor at height z; ContactShadows is y-up, so turn it to z-up. */
function Floor({ z, size }: { z: number; size: number }) {
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <ContactShadows position={[0, z, 0]} scale={size * 2.4} far={size} blur={2.4} opacity={0.45} resolution={512} />
    </group>
  );
}


const MASK_EDGE: Record<string, string> = { green: "#0f5a2c", black: "#141416", blue: "#113a7a", red: "#7a1616", white: "#e6e6e0" };
/**
 * The cut edge of a board: mask on both faces, a copper line for every layer, laminate with its glass weave
 * between. Bands run across the texture's v; `turned` gives the copy for the two edges whose thickness lies along u.
 */
function edgeTexture(layers: number, mask: string, turned: boolean): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = FR4;
  g.fillRect(0, 0, 64, 128);
  // Glass weave: faint lighter and darker threads.
  for (let y = 0; y < 128; y += 3) {
    g.fillStyle = y % 6 === 0 ? "rgba(255,255,255,0.10)" : "rgba(60,40,0,0.10)";
    g.fillRect(0, y, 64, 1);
  }
  const n = Math.max(1, Math.min(16, layers));
  g.fillStyle = "#b87333";
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? 8 : 8 + (i * (128 - 16 - 4)) / (n - 1);
    g.fillRect(0, y, 64, 4);
  }
  g.fillStyle = MASK_EDGE[mask] ?? MASK_EDGE.green;
  g.fillRect(0, 0, 64, 7);
  g.fillRect(0, 121, 64, 7);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (turned) {
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI / 2;
  }
  return t;
}


let CONTACT: THREE.CanvasTexture | null = null;
/** A dark patch with a feathered edge: rings of faint black, each a little smaller, add up towards the middle. */
function contactTexture(): THREE.CanvasTexture | null {
  if (CONTACT) return CONTACT;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.fillStyle = "rgba(0, 0, 0, 0.13)";
  for (let i = 0; i < 12; i++) {
    const m = 1 + i * 1.7;
    g.beginPath();
    if (typeof g.roundRect === "function") g.roundRect(m, m, 64 - 2 * m, 64 - 2 * m, 9);
    else g.rect(m, m, 64 - 2 * m, 64 - 2 * m);
    g.fill();
  }
  CONTACT = new THREE.CanvasTexture(canvas);
  return CONTACT;
}

type StackLayer = { key: string; label: string; z: number; kind: "texture" | "solid"; texture?: THREE.Texture; color?: string; thickness: number };

function buildStack(data: ViewerData, tex: NonNullable<ReturnType<typeof useBoardTextures>>): StackLayer[] {
  const t = data.board.thickness;
  const find = (type: string, side: string) => tex.layers.find((l) => l.type === type && l.side === side)?.t;
  const inner = tex.layers.filter((l) => l.type === "copper" && l.side === "inner").sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const out: StackLayer[] = [];
  const push = (key: string, label: string, kind: StackLayer["kind"], thickness: number, texture?: THREE.Texture, color?: string) => out.push({ key, label, kind, texture, color, thickness, z: 0 });
  push("silk-top", "Top silkscreen", "texture", 0.01, find("silkscreen", "top"));
  push("mask-top", "Top solder mask", find("soldermask", "top") ? "texture" : "solid", 0.02, find("soldermask", "top"), maskColor(data.board.maskColor));
  push("cu-top", "Top copper", find("copper", "top") ? "texture" : "solid", 0.035, find("copper", "top"), "#c27c3e");
  const innerCount = Math.max(inner.length, Math.max(0, data.board.layerCount - 2));
  for (let k = 0; k < innerCount; k++) {
    push(k === 0 ? "prepreg-1" : `diel-${k}`, k % 2 === 0 ? "Prepreg" : "Core", "solid", (t * 0.8) / Math.max(1, innerCount + 1), undefined, k % 2 === 0 ? "#e2d39a" : FR4);
    push(`cu-in-${k}`, `Inner copper L${k + 2}`, inner[k] ? "texture" : "solid", 0.035, inner[k]?.t, "#c27c3e");
  }
  push("core", innerCount ? "Prepreg" : "Core", "solid", (t * 0.8) / Math.max(1, innerCount + 1), undefined, innerCount ? "#e2d39a" : FR4);
  push("cu-bot", "Bottom copper", find("copper", "bottom") ? "texture" : "solid", 0.035, find("copper", "bottom"), "#c27c3e");
  push("mask-bot", "Bottom solder mask", find("soldermask", "bottom") ? "texture" : "solid", 0.02, find("soldermask", "bottom"), maskColor(data.board.maskColor));
  push("silk-bot", "Bottom silkscreen", "texture", 0.01, find("silkscreen", "bottom"));
  return out.filter((l) => l.kind === "solid" || l.texture);
}

function ExplodedStack({ layers, visible, explode, w, h, parts }: { layers: StackLayer[]; visible: Record<string, boolean>; explode: number; w: number; h: number; /** The placed parts: they float above the top sheet and hang below the bottom one. */ parts: ViewerPart[] }) {
  const gap = stackGap(explode);
  const total = (layers.length - 1) * gap;
  const lift = gap * 1.1 + 1;
  const tops = parts.filter((p) => p.side === "TOP" && !p.dnp);
  const bottoms = parts.filter((p) => p.side === "BOTTOM" && !p.dnp);
  const tag = "block -translate-y-1/2 rounded border bg-card/95 px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-foreground";
  return (
    <group>
      {/* The components, lifted off the board they are soldered to. */}
      {tops.length ? (
        <group position={[0, 0, total / 2 + lift]}>
          {tops.map((p) => (
            <group key={p.refDes} position={[p.x, p.y, 0]} rotation={[0, 0, (p.rotation * Math.PI) / 180]}>
              <PartBody body={p.body} marking={p.marking ?? p.mpn} />
            </group>
          ))}
          {explode > 0.15 ? (
            <Html position={[w / 2 + 2, -h / 2, 0]} style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
              <span className={tag}>Components · {tops.length} on top</span>
            </Html>
          ) : null}
        </group>
      ) : null}
      {bottoms.length ? (
        <group position={[0, 0, -total / 2 - lift]}>
          {bottoms.map((p) => (
            <group key={p.refDes} position={[p.x, p.y, 0]} rotation={[Math.PI, 0, (p.rotation * Math.PI) / 180]}>
              <PartBody body={p.body} marking={p.marking ?? p.mpn} />
            </group>
          ))}
          {explode > 0.15 ? (
            <Html position={[w / 2 + 2, -h / 2, 0]} style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
              <span className={tag}>Components · {bottoms.length} underneath</span>
            </Html>
          ) : null}
        </group>
      ) : null}
      {layers.map((l, i) =>
        visible[l.key] === false ? null : (
          <mesh key={l.key} position={[0, 0, total / 2 - i * gap]}>
            {l.kind === "texture" ? <planeGeometry args={[w, h]} /> : <boxGeometry args={[w, h, Math.max(0.05, l.thickness * (1 + explode * 2))]} />}
            {explode > 0.15 ? (
              <Html position={[i % 2 === 0 ? w / 2 + 2 : -w / 2 - 2, -h / 2, 0]} style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
                <span className={cn(tag, i % 2 === 1 && "-translate-x-full")}>{l.label}</span>
              </Html>
            ) : null}
            <meshStandardMaterial
              map={l.texture ?? null}
              color={l.kind === "texture" ? "#ffffff" : l.color}
              transparent={l.kind === "texture" || l.key.startsWith("mask")}
              opacity={l.key.startsWith("mask") && l.kind === "solid" ? 0.85 : 1}
              side={THREE.DoubleSide}
              metalness={l.key.startsWith("cu") ? 0.6 : 0.05}
              roughness={l.key.startsWith("cu") ? 0.35 : 0.7}
              depthWrite={l.kind !== "texture"}
            />
          </mesh>
        ),
      )}
    </group>
  );
}

function AssembledBoard({
  data,
  tex,
  overlay,
  selected,
  selectedLine = null,
  onSelect,
  hovered = null,
  onHover,
  focus,
  bare = false,
  x = 0,
  z = 0,
}: {
  /** The part under the cursor: it gets a small card beside it. */
  hovered?: string | null;
  onHover?: (ref: string, on: boolean) => void;
  data: ViewerData;
  /** The board as it comes from the fab: no components, no screws. */
  bare?: boolean;
  tex: NonNullable<ReturnType<typeof useBoardTextures>>;
  overlay: Overlay;
  selected: string | null;
  /** The picked part's BoM line: its other designators glow too. */
  selectedLine?: string | null;
  onSelect: (r: string) => void;
  /** Designators of the picked process step; everything else fades out. */
  focus: Set<string> | null;
  x?: number;
  z?: number;
}) {
  const { width: w, height: h, thickness: t } = data.board;
  // With a risk overlay on, dim the board so green "ok" parts don't vanish into green solder mask.
  const dimmed = overlay !== "real";
  const materials = useMemo(() => {
    const tint = dimmed ? "#3a3d42" : "#ffffff";
    const edgeOf = (turned: boolean) => {
      const map = edgeTexture(data.board.layerCount, data.board.maskColor, turned);
      return new THREE.MeshStandardMaterial({ color: map ? tint : FR4, map: map ?? undefined, roughness: 0.75 });
    };
    // A box's ±x faces run the thickness along u, its ±y faces along v.
    const edgeX = edgeOf(true);
    const edgeY = edgeOf(false);
    // Solder mask is a lacquer over the copper: a clear coat gives it its sheen.
    const mask = { color: tint, roughness: 0.42, metalness: 0.05, clearcoat: 0.85, clearcoatRoughness: 0.18 };
    // The relief map lifts copper, pads and silk a hair above the mask, so light catches the traces.
    const face = (f: Face) => new THREE.MeshPhysicalMaterial({ map: f.map, bumpMap: f.bump ?? undefined, bumpScale: f.bump ? 1.2 : 0, ...mask });
    const top = face(tex.top);
    const bottom = face(tex.bottom);
    return [edgeX, edgeX, edgeY, edgeY, top, bottom];
  }, [tex, dimmed, data.board.layerCount, data.board.maskColor]);
  const sel = data.parts.find((p) => p.refDes === selected);
  const hov = hovered ? data.parts.find((p) => p.refDes === hovered) : undefined;
  // A soft dark patch under every part, so it sits on the board instead of floating over it. Unlike a cast shadow
  // it is drawn the same on every graphics card.
  const contact = useMemo(() => {
    const map = contactTexture();
    return map ? new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }) : null;
  }, []);
  return (
    <group position={[x, 0, z]}>
      <mesh material={materials} receiveShadow>
        <boxGeometry args={[w, h, t]} />
      </mesh>
      {contact && !bare && !dimmed
        ? data.parts
            .filter((p) => p.side === "TOP" && !p.dnp && !(focus && !focus.has(p.refDes)))
            .map((p) => {
              const grow = Math.min(3, 0.5 + p.body.height * 0.3);
              // The light comes from the front right, so the patch leans to the back left, further for taller parts.
              return (
                <mesh key={`shadow-${p.refDes}`} material={contact} position={[p.x - Math.min(4, p.body.height * 0.3), p.y + Math.min(4, p.body.height * 0.22), t / 2 + 0.03]} rotation={[0, 0, (p.rotation * Math.PI) / 180]}>
                  <planeGeometry args={[p.body.length + grow * 2, p.body.width + grow * 2]} />
                </mesh>
              );
            })
        : null}
      {(bare ? [] : data.parts).map((p) => (
        <group
          key={p.refDes}
          position={[p.x, p.y, p.side === "TOP" ? t / 2 : -t / 2]}
          rotation={[p.side === "BOTTOM" ? Math.PI : 0, 0, (p.rotation * Math.PI) / 180]}
        >
          {p.dnp ? (
            // Not fitted: only its footprint, dashed on the board. No body, solid or see-through.
            <Footprint w={p.body.length} h={p.body.width} dashed color={p.refDes === selected ? HIGHLIGHT : "#f4f4ee"} />
          ) : (
            <>
              <PartBody
                body={p.body}
                marking={p.marking ?? p.mpn}
                color={overlayColor(p, overlay)}
                emissive={p.refDes === selected ? "#5a2f96" : selectedLine && p.lineId === selectedLine ? "#7b3fb5" : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(p.refDes);
                }}
                onHover={onHover ? (on) => onHover(p.refDes, on) : undefined}
              />
              {/* The picked process step's parts: a yellow ring on the board around each. Everything stays solid. */}
              {focus?.has(p.refDes) ? <Footprint w={p.body.length + 1.2} h={p.body.width + 1.2} color={HIGHLIGHT} /> : null}
            </>
          )}
        </group>
      ))}
      {bare ? null : tex.art?.holes.map((hole, i) => <Screw key={i} x={hole.x} y={hole.y} z={t / 2} />)}
      {hov && !bare && hov.refDes !== selected ? (
        <Html position={[hov.x, hov.y, hov.side === "TOP" ? t / 2 + hov.body.height : -t / 2 - hov.body.height]} style={{ pointerEvents: "none" }} zIndexRange={[30, 0]}>
          <HoverCard part={hov} quick={!data.revisionId} />
        </Html>
      ) : null}
      {sel && !bare ? (
        <Html position={[sel.x, sel.y, (sel.side === "TOP" ? t / 2 + sel.body.height : -t / 2 - sel.body.height) + (sel.side === "TOP" ? 1.5 : -1.5)]} center style={{ pointerEvents: "none" }}>
          <span className="num rounded bg-foreground px-1.5 py-0.5 text-[11px] whitespace-nowrap text-background shadow">{sel.refDes}</span>
        </Html>
      ) : null}
    </group>
  );
}

const HIGHLIGHT = "#f7c61b";

/** A rectangle on the board face around a footprint: dashed for a part that is not fitted, solid yellow for focus. */
function Footprint({ w, h, color, dashed = false }: { w: number; h: number; color: string; dashed?: boolean }) {
  const pts = useMemo(() => {
    const x = Math.max(0.3, w) / 2;
    const y = Math.max(0.3, h) / 2;
    return [[-x, -y, 0.04], [x, -y, 0.04], [x, y, 0.04], [-x, y, 0.04], [-x, -y, 0.04]] as [number, number, number][];
  }, [w, h]);
  return <Line points={pts} color={color} lineWidth={dashed ? 1.2 : 2} dashed={dashed} dashSize={0.5} gapSize={0.35} />;
}

/** The card beside the part under the cursor: what it is and whether we hold it. */
function HoverCard({ part: p, quick, className = "ml-4 w-56 -translate-y-1/2" }: { part: ViewerPart; quick: boolean; className?: string }) {
  const ours = p.supply?.ours ?? 0;
  const stock = p.dnp
    ? { dot: "bg-muted-foreground", text: "Not fitted (DNP)" }
    : quick
      ? null
      : !p.partId
        ? { dot: "bg-risk-red", text: "No part chosen yet" }
        : ours >= p.required && ours > 0
          ? { dot: "bg-risk-green", text: `In stock · ${ours.toLocaleString("en-IN")} pcs` }
          : ours > 0
            ? { dot: "bg-risk-amber", text: `${ours.toLocaleString("en-IN")} in stock · need ${p.required.toLocaleString("en-IN")}` }
            : { dot: "bg-risk-amber", text: "Not in our stock" };
  return (
    <div className={cn("rounded-lg border bg-card/95 p-2.5 text-xs backdrop-blur", className)}>
      <div className="flex items-center gap-1.5">
        <span className="num rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold">{p.refDes}</span>
        <span className="truncate text-muted-foreground">{p.kind?.name ?? p.pkg ?? "Component"}</span>
      </div>
      <div className="num mt-1.5 truncate text-sm font-semibold">{p.mpn ?? p.value ?? p.pkg ?? "Not matched"}</div>
      <div className="truncate text-muted-foreground">{[p.manufacturer, p.pkg].filter(Boolean).join(" · ") || p.description}</div>
      {stock ? (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", stock.dot)} aria-hidden />
          {stock.text}
        </div>
      ) : null}
    </div>
  );
}

/** A pan-head torx screw in a mounting hole: zinc head, dark star recess. */
function Screw({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0, 0.55]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[2.35, 2.55, 1.1, 32]} />
        <meshStandardMaterial color="#b9bcc2" metalness={0.85} roughness={0.32} />
      </mesh>
      <mesh position={[0, 0, 1.11]} rotation={[0, 0, Math.PI / 6]}>
        <circleGeometry args={[0.85, 6]} />
        <meshStandardMaterial color="#3b3d42" metalness={0.6} roughness={0.5} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
    </group>
  );
}

// ───────────────────────────── Shell ─────────────────────────────

export default function BoardViewer({
  data,
  initialStep = null,
  initialMode = "pcba",
  initialLine = null,
  compact = false,
}: {
  data: ViewerData;
  initialStep?: string | null;
  /** Which view opens: the layer stack, the assembled board or the product in its box. */
  initialMode?: Mode;
  /** A BoM line whose parts start selected. */
  initialLine?: string | null;
  /** Inside another page's flow: leave out the BoM list and the process route (the page shows its own). */
  compact?: boolean;
}) {
  const [mode, setMode] = useState<Mode>(initialMode === "box" && !data.enclosure ? "pcba" : initialMode);
  const [overlay, setOverlay] = useState<Overlay>("real");
  const [explode, setExplode] = useState(0.4);
  const [step, setStep] = useState<string | null>(() => (data.route.some((s) => s.key === initialStep) ? initialStep : null));
  const [view, setView] = useState<View>(() => (data.route.find((s) => s.key === initialStep)?.side === "BOTTOM" ? "bottom" : "iso"));
  // Box-build opens on the finished product, the way the customer sees it.
  const [shell, setShell] = useState<Shell>("closed");
  const focus = useMemo(() => {
    const refs = data.route.find((s) => s.key === step)?.refs;
    return refs?.length ? new Set(refs) : null;
  }, [data.route, step]);
  // Picking a step shows its parts: out of the stack-up or the closed box, turned to the side it works on.
  const pickStep = (key: string | null) => {
    setStep(key);
    const s = data.route.find((x) => x.key === key);
    if (!s?.refs.length) return;
    if (mode === "pcb" || mode === "bare") setMode("pcba");
    if (mode === "box" && shell === "closed") setShell("xray");
    if (s.side === "BOTTOM") setView("bottom");
    else if (view === "bottom") setView("iso");
  };
  const [selected, setSelected] = useState<string | null>(() => (initialLine ? (data.parts.find((p) => p.lineId === initialLine)?.refDes ?? null) : null));
  const pickPart = (ref: string) => {
    setSelected(ref);
    if (mode === "pcb" || mode === "bare") setMode("pcba");
    if (mode === "box" && shell === "closed") setShell("xray");
  };
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [hovered, setHovered] = useState<string | null>(null);
  const onHover = (ref: string, on: boolean) => setHovered((h) => (on ? ref : h === ref ? null : h));
  // A new view or mode moves the parts away from the cursor: drop the card.
  useEffect(() => setHovered(null), [mode, view, shell]);
  // Toolbar: reset (re-frames the current view), pan mode, full screen.
  const [nonce, setNonce] = useState(0);
  const [panning, setPanning] = useState(false);
  const [full, setFull] = useState(false);
  const api = useRef<ViewApi | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === stage.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const togglePan = () => {
    api.current?.pan(!panning);
    setPanning(!panning);
  };
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stage.current?.requestFullscreen?.().catch(() => {});
  };
  const tex = useBoardTextures(data);
  const studio = useStudioBoard(data, tex);
  const [studioMode, setStudioMode] = useState<StudioMode>("3D");
  /** The assembled board is drawn by the circuitflow studio; bare board, layers and box stay on the scene below. */
  const usesStudio = mode === "pcba";
  const stack = useMemo(() => (tex ? buildStack(data, tex) : []), [data, tex]);
  const sel = data.parts.find((p) => p.refDes === selected) ?? null;
  const size = Math.max(data.board.width, data.board.height, data.enclosure && mode === "box" ? data.enclosure.length : 0);
  const reduced = useRef(false);
  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);
  const money = (n: number | null) => (n === null ? "—" : formatMoney(n, data.currency as Currency, { unit: true }));
  const boxed = mode === "box" && !!data.enclosure && !!data.box;
  // What the camera frames: the board, the box (and where its pieces fly), or the exploded stack.
  const fit = useMemo(() => {
    if (boxed && data.enclosure) return boxFrame(data.enclosure, shell);
    return { w: data.board.width, h: data.board.height, depth: mode === "pcb" ? (stack.length + 1) * stackGap(0.5) : 10 };
  }, [boxed, mode, shell, data, stack.length]);
  // The shadow floor sits just under whatever is lowest in the current mode.
  const floorZ = useMemo(() => {
    if (boxed && data.enclosure) return boxFloorZ(data.enclosure, shell, explode);
    if (mode === "pcb") return -((stack.length - 1) * stackGap(explode)) / 2 - 3;
    if (mode === "bare") return -data.board.thickness / 2 - 4;
    const under = Math.max(0, ...data.parts.filter((p) => p.side === "BOTTOM").map((p) => p.body.height));
    return -data.board.thickness / 2 - under - 4;
  }, [boxed, mode, shell, data, stack.length, explode]);
  const verdict = boxed ? fitVerdict(data) : null;
  const tint = useMemo(() => {
    if (overlay === "real") return null;
    const out: Record<string, string> = {};
    for (const p of data.parts) {
      const c = overlayColor(p, overlay);
      if (c) out[p.refDes] = c;
    }
    return out;
  }, [data.parts, overlay]);
  const related = useMemo(() => (sel?.lineId ? data.parts.filter((p) => p.lineId === sel.lineId).map((p) => p.refDes) : null), [data.parts, sel?.lineId]);
  const focusRefs = useMemo(() => (focus ? [...focus] : null), [focus]);
  const counts = useMemo(() => {
    const c = { green: 0, amber: 0, red: 0, grey: 0 } as Record<RiskLevel, number>;
    for (const p of data.parts) c[p.partId ? scoreToRisk(p.worst) : p.dnp ? "grey" : "red"]++;
    return c;
  }, [data.parts]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div ref={stage} className="viewer-grid relative h-[66dvh] min-h-[440px] overflow-hidden rounded-xl border [&:fullscreen]:h-dvh [&:fullscreen]:rounded-none [&:fullscreen]:border-0">
        {usesStudio ? (
          studio ? (
            <div className="absolute inset-0">
              <BoardStudio
                board={studio.board}
                parts={studio.parts}
                mode={studioMode}
                selected={selected}
                related={related}
                tint={tint}
                focus={focusRefs}
                bottom={view === "bottom"}
                onSelect={(p) => setSelected(p?.ref ?? null)}
                renderTip={(p) => {
                  const vp = data.parts.find((x) => x.refDes === p.ref);
                  return vp ? <HoverCard part={vp} quick={!data.revisionId} className="w-56" /> : null;
                }}
                onToggleFull={toggleFull}
                full={full}
              />
            </div>
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">Rendering board…</div>
          )
        ) : (
        /* Renders only when something changes, so a still board costs nothing on a tablet. */
        <Canvas frameloop="demand" shadows="soft" dpr={[1, 2]} camera={{ fov: 32, near: 0.5, far: 5000 }} onPointerMissed={() => setSelected(null)} onPointerLeave={() => setHovered(null)} aria-label="3D board view">
          <CameraRig view={view} nonce={nonce} {...fit} />
          <ViewTools api={api} minDistance={Math.min(10, size * 0.35)} maxDistance={size * 6} />
          <Redraw on={`${mode}|${shell}|${overlay}|${step}|${selected}|${hovered}|${view}|${nonce}|${full ? 1 : 0}|${tex ? 1 : 0}`} />
          <Studio />
          <ambientLight intensity={0.3} />
          <hemisphereLight args={["#ffffff", "#4a4a48", 0.45]} />
          {/* The key light. Its shadow camera is given its size when it is made: the default reaches 5 mm from the centre, and a size set later is not picked up. Lower and to the side, so parts throw a shadow long enough to see. */}
          <directionalLight key={size} position={[size * 0.9, -size * 0.7, size * 1.1]} intensity={1.5} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.03}>
            <orthographicCamera attach="shadow-camera" args={[-size, size, size, -size, 1, size * 6]} />
          </directionalLight>
          <directionalLight position={[-80, 60, -100]} intensity={0.8} />
          <Floor z={floorZ} size={size} />
          {tex ? (
            mode === "pcb" ? (
              <ExplodedStack layers={stack} visible={visible} explode={explode} w={data.board.width} h={data.board.height} parts={data.parts} />
            ) : boxed && data.enclosure && data.box ? (
              <>
                <EnclosureModel enc={data.enclosure} box={data.box} board={data.board} product={data.product} shell={shell} explode={explode} />
                {/* Closed, the board is out of sight; X-ray and exploded show it in place. */}
                {shell !== "closed" ? (
                  <AssembledBoard data={data} tex={tex} overlay={overlay} selected={selected} selectedLine={sel?.lineId ?? null} onSelect={setSelected} hovered={hovered} onHover={onHover} focus={focus} {...boardPlacement(data.enclosure, data.box, data.board.thickness, shell, explode)} />
                ) : null}
              </>
            ) : (
              <AssembledBoard data={data} tex={tex} overlay={mode === "bare" ? "real" : overlay} selected={selected} selectedLine={sel?.lineId ?? null} onSelect={setSelected} hovered={hovered} onHover={onHover} focus={focus} bare={mode === "bare"} />
            )
          ) : (
            <Html center>
              <span className="text-sm text-muted-foreground">Rendering board…</span>
            </Html>
          )}
          <OrbitControls makeDefault enableDamping={!reduced.current} dampingFactor={0.12} minDistance={Math.min(10, size * 0.35)} maxDistance={size * 6} />
        </Canvas>
        )}

        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
          <div role="radiogroup" aria-label="View mode" className="pointer-events-auto inline-flex rounded-md border bg-muted/90 p-0.5 backdrop-blur">
            <button role="radio" aria-checked={mode === "bare"} className={seg(mode === "bare")} onClick={() => setMode("bare")}>
              <CircuitBoard className="size-4" /> Bare board
            </button>
            <button role="radio" aria-checked={mode === "pcb"} className={seg(mode === "pcb")} onClick={() => setMode("pcb")}>
              <Layers className="size-4" /> Layers
            </button>
            <button role="radio" aria-checked={mode === "pcba"} className={seg(mode === "pcba")} onClick={() => setMode("pcba")}>
              <Cpu className="size-4" /> PCBA
            </button>
            <button role="radio" aria-checked={mode === "box"} className={seg(mode === "box")} onClick={() => setMode("box")} disabled={!data.enclosure} title={data.enclosure ? undefined : "No enclosure in the project spec"}>
              <Box className="size-4" /> Box-build
            </button>
          </div>
          {usesStudio ? (
            <div role="group" aria-label="Drawing" className="pointer-events-auto inline-flex rounded-md border bg-card p-0.5 text-xs">
              {(["3D", "2D"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setStudioMode(v)}
                  aria-pressed={studioMode === v}
                  title={v === "3D" ? "Turn the board in 3D" : "Flat drawing from above"}
                  className={cn("h-7 rounded px-2.5 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring", studioMode === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
                >
                  {v}
                </button>
              ))}
            </div>
          ) : (
            /* which view is on, like a CAD tool's view chip */
            <span className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-card/90 px-2.5 text-xs font-medium text-muted-foreground backdrop-blur">
              <span className="size-1.5 rounded-full bg-risk-green" aria-hidden />
              {mode === "pcb" ? "Layers separated" : VIEW_LABEL[view]}
              {panning ? " · pan" : ""}
            </span>
          )}
        </div>

        {/* Floating toolbar, right edge: full screen, zoom, reset, pan. The studio has its own. */}
        {usesStudio ? null : (
        <div role="toolbar" aria-label="View tools" aria-orientation="vertical" className="absolute top-1/2 right-3 flex -translate-y-1/2 flex-col gap-0.5 rounded-lg border bg-card/95 p-1 backdrop-blur">
          {(
            [
              [full ? Minimize : Maximize, full ? "Leave full screen" : "Full screen", toggleFull, full],
              [ZoomIn, "Zoom in", () => api.current?.zoom(0.8), false],
              [ZoomOut, "Zoom out", () => api.current?.zoom(1.25), false],
              [RotateCcw, "Reset view", () => setNonce((n) => n + 1), false],
              [Hand, panning ? "Drag to orbit" : "Drag to pan", togglePan, panning],
            ] as const
          ).map(([Icon, label, act, on]) => (
            <button
              key={label}
              type="button"
              onClick={act}
              aria-label={label}
              aria-pressed={on}
              title={label}
              className={cn(
                "grid size-9 place-items-center rounded-md outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                on ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
            </button>
          ))}
        </div>
        )}

        {data.approximateLayout && mode !== "pcb" ? (
          <p className="pointer-events-none absolute top-16 left-3 max-w-[calc(100%-5rem)] rounded-md border bg-card/90 px-2.5 py-1.5 text-xs text-muted-foreground backdrop-blur">
            Approximate layout — no pick-and-place file
          </p>
        ) : null}
        {usesStudio ? null : (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
          <p className="hidden min-w-0 truncate pb-2 text-xs text-muted-foreground sm:block">{panning ? "Drag to pan" : "Drag to orbit"} · Scroll to zoom · {mode === "pcb" || mode === "bare" ? "Right-drag to pan" : "Click to inspect"}</p>
          <div role="radiogroup" aria-label="Camera" className="pointer-events-auto ml-auto inline-flex shrink-0 rounded-md border bg-card/95 p-0.5 backdrop-blur">
            {(["iso", "top", "side", "bottom"] as View[]).map((v) => (
              <button key={v} role="radio" aria-checked={view === v} className={seg(view === v)} onClick={() => setView(v)}>
                {VIEW_LABEL[v]}
              </button>
            ))}
          </div>
        </div>
        )}
        {verdict && !verdict.ok ? (
          <p className="absolute top-14 right-16 flex max-w-[calc(100%-6rem)] items-center gap-1.5 rounded-md border border-risk-red/40 bg-risk-red-soft px-2.5 py-1.5 text-xs">
            <AlertTriangle className="size-3.5 shrink-0 text-risk-red" /> {verdict.text}
          </p>
        ) : null}
      </div>

      <aside className="space-y-4">
        {boxed ? (
          <ProductPanel
            data={data}
            shell={shell}
            onShell={(s) => {
              setShell(s);
              if (s === "closed") setSelected(null);
            }}
            explode={explode}
            onExplode={setExplode}
          />
        ) : null}
        {boxed && shell === "closed" ? null : (
          <section className="rounded-xl border bg-card p-5">
            {mode === "pcb" ? (
              <>
                <h2 className="text-sm font-medium">Layers</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{data.board.source === "gerber" ? "From Gerbers" : "From the board spec"}</p>
                <ul className="mt-3 space-y-1">
                  {stack.map((l) => (
                    <li key={l.key}>
                      <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm">
                        <input type="checkbox" checked={visible[l.key] !== false} onChange={(e) => setVisible((v) => ({ ...v, [l.key]: e.target.checked }))} className="size-4 accent-[var(--primary)]" />
                        <span className="size-3 rounded-sm border" style={{ background: l.color ?? (l.key.startsWith("silk") ? "#f5f5f5" : "#c27c3e") }} />
                        {l.label}
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            ) : mode === "bare" ? (
              <ul className="flex flex-wrap gap-1.5 text-[13px]">
                <li className="rounded-md border px-2.5 py-1">{data.board.maskColor} mask</li>
                <li className="rounded-md border px-2.5 py-1">{data.board.finish}</li>
                <li className="rounded-md border border-dashed px-2.5 py-1 text-muted-foreground">{data.board.source === "gerber" ? "From Gerbers" : "From the board spec"}</li>
              </ul>
            ) : !data.revisionId ? (
              // A quick look has footprints, not parts: nothing to colour by risk, stock or price yet.
              <p className="text-sm text-muted-foreground">Real colours. Risk colours need part numbers.</p>
            ) : (
              <>
                <label htmlFor="overlay" className="text-sm font-medium">Colour parts by</label>
                <select id="overlay" value={overlay} onChange={(e) => setOverlay(e.target.value as Overlay)} className="mt-2 h-9 w-full rounded-md border bg-background px-2 text-sm">
                  <option value="real">Real colours</option>
                  <option value="worst">Worst score (risk)</option>
                  <option value="availability">Availability</option>
                  <option value="resilience">Resilience</option>
                  <option value="economic">Price (economic)</option>
                  <option value="lifecycle">Lifecycle</option>
                </select>
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  {(["green", "amber", "red"] as RiskLevel[]).map((k) => (
                    <span key={k} className="inline-flex items-center gap-1.5">
                      <span className="size-2.5 rounded-full" style={{ background: RISK_COLOR[k] }} />
                      <span className="num">{counts[k]}</span> {k === "green" ? "ok" : k === "amber" ? "watch" : "risk"}
                    </span>
                  ))}
                </div>
              </>
            )}
            {mode === "pcb" ? (
              <label className="mt-4 block text-sm">
                Explode
                <input type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(Number(e.target.value))} className="mt-1 w-full accent-[var(--primary)]" aria-label="Explode distance" />
              </label>
            ) : null}
          </section>
        )}

        <section className={cn("rounded-xl border bg-card p-5", !(sel && mode !== "bare") && (mode === "pcb" || mode === "bare" || (boxed && shell === "closed")) && "hidden")} aria-live="polite">
          {sel && mode !== "bare" ? (
            <div className="space-y-3">
              <div className="flex gap-3">
                {sel.imageUrl ? (
                  <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md border bg-white p-0.5">
                    <PartPhoto src={sel.imageUrl} alt="" className="max-h-full max-w-full" />
                  </span>
                ) : null}
                <div className="min-w-0">
                  <div className="num text-xs text-muted-foreground">
                    {sel.refDes} · {sel.side.toLowerCase()} · {sel.rotation}°
                  </div>
                  {sel.partId ? (
                    <Link href={`/parts/${sel.partId}`} className="num block truncate text-lg font-semibold hover:underline">{sel.mpn}</Link>
                  ) : (
                    <div className="num truncate text-lg font-semibold">{sel.mpn ?? (data.revisionId ? "Not matched" : (sel.value ?? sel.pkg ?? "Component"))}</div>
                  )}
                  <div className="truncate text-sm text-muted-foreground">{sel.manufacturer}</div>
                </div>
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground">{sel.description}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                {sel.lifecycle ? <LifecycleBadge lifecycle={sel.lifecycle} /> : null}
                {sel.dnp ? <span className="rounded-md bg-muted px-1.5 py-0.5">DNP</span> : null}
                {sel.kind ? (
                  <Link href={`/knowledge/dictionary/${sel.kind.slug}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                    <BookOpen className="size-3.5" aria-hidden /> {sel.kind.name}
                  </Link>
                ) : null}
                {sel.datasheetUrl ? (
                  <a href={sel.datasheetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                    <FileText className="size-3.5" aria-hidden /> Datasheet
                  </a>
                ) : null}
              </div>

              {sel.partId ? (
                <dl className="grid grid-cols-2 gap-3 border-t pt-3 text-sm">
                  <div>
                    <dt className="text-[11px] text-muted-foreground">RoHS</dt>
                    <dd className={sel.rohs === "NON_COMPLIANT" ? "text-risk-red" : sel.rohs === "COMPLIANT" ? undefined : "text-risk-amber"}>{sel.rohs === "COMPLIANT" ? "Compliant" : sel.rohs === "COMPLIANT_WITH_EXEMPTION" ? "With exemption" : sel.rohs === "NON_COMPLIANT" ? "Not compliant" : "Unknown"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">REACH</dt>
                    <dd className={sel.reach === "COMPLIANT" ? undefined : "text-risk-amber"}>{sel.reach === "COMPLIANT" ? "No SVHC" : sel.reach === "CONTAINS_SVHC" ? "Contains SVHC" : "Unknown"}</dd>
                  </div>
                </dl>
              ) : null}

              {sel.risk ? (
                <div className="border-t pt-3">
                  <div className="flex items-baseline gap-2">
                    <span className={cn("text-2xl leading-none font-semibold tracking-tight tabular-nums", sel.risk.level === "green" ? "text-risk-green" : sel.risk.level === "amber" ? "text-risk-amber" : "text-risk-red")}>{sel.risk.score}</span>
                    <span className="text-xs text-muted-foreground">risk</span>
                  </div>
                  <p className="mt-1.5 text-xs">{sel.risk.summary}</p>
                  {sel.risk.actions.map((a) => (
                    <p key={a} className="mt-1 text-xs text-muted-foreground">→ {a}</p>
                  ))}
                </div>
              ) : null}

              {sel.supply ? (
                <div className="border-t pt-3">
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-3" aria-label="Availability, in sourcing order">
                    {(
                      [
                        ["Our inventory", sel.supply.ours],
                        ["Channel partners", sel.supply.partners],
                        ["Distributors online", sel.supply.suppliers],
                        ["Marketplace", sel.supply.market],
                      ] as const
                    ).map(([label, qty], i) => (
                      <div key={label} className="flex flex-col-reverse">
                        <dt className="mt-0.5 text-[11px] text-muted-foreground">
                          {i + 1} · {label}
                        </dt>
                        <dd className="text-lg leading-tight font-semibold tracking-tight tabular-nums">{qty.toLocaleString("en-IN")}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="num mt-2.5 text-xs text-muted-foreground">
                    Need {sel.required.toLocaleString("en-IN")}
                    {sel.shortfall ? <span className="text-risk-red"> · short {sel.shortfall.toLocaleString("en-IN")}</span> : null} · {sel.supply.sources} authorised source{sel.supply.sources === 1 ? "" : "s"}
                    {sel.supply.leadWeeks !== null ? ` · ${sel.supply.leadWeeks} wk lead` : ""}
                  </p>
                </div>
              ) : null}

              <dl className="num grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt className="font-sans text-muted-foreground">Best price</dt>
                <dd className="text-right">{money(sel.bestUnit)}</dd>
                <dt className="font-sans text-muted-foreground">Landed</dt>
                <dd className="text-right">{money(sel.landedUnit)}</dd>
              </dl>
              {sel.scores ? (
                <dl className="grid grid-cols-5 gap-1 text-center">
                  {SCORE_KEYS.map((k) => (
                    <div key={k}>
                      <dt className="text-[10px] text-muted-foreground">{SCORE_LABEL[k].slice(0, 5)}</dt>
                      <dd className="mt-0.5"><ScorePill score={sel.scores![k]} label={SCORE_LABEL[k]} /></dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {sel.alternates.length ? (
                <div>
                  <div className="text-xs text-muted-foreground" title="FFF = form-fit-function drop-in">Alternates</div>
                  <ul className="mt-1 space-y-0.5 text-sm">
                    {sel.alternates.map((a) => (
                      <li key={a.partId} className="flex justify-between gap-2">
                        <Link href={`/parts/${a.partId}`} className="num hover:underline">{a.mpn}</Link>
                        <span className="text-xs text-muted-foreground">{a.type === "DROP_IN" ? "FFF drop-in" : a.type.replace(/_/g, " ").toLowerCase()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {sel.partId ? (
                  <Link href={`/parts/${sel.partId}#availability`} className="text-muted-foreground hover:text-foreground">All offers and price breaks →</Link>
                ) : null}
                {sel.lineNo && data.revisionId ? (
                  <Link href={`/boms/${data.revisionId}`} className="text-muted-foreground hover:text-foreground">BoM line {sel.lineNo} →</Link>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{data.parts.length ? "Click a part" : "No parts on this board"}</p>
          )}
        </section>

        {compact || !data.revisionId ? null : (
          <>
            <BomListPanel parts={data.parts} selectedLine={sel?.lineId ?? null} onPick={pickPart} />
            <RoutePanel steps={data.route} active={step} onPick={pickStep} revisionId={data.revisionId} />
          </>
        )}
      </aside>
    </div>
  );
}
