"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { EXTRUDE } from "@/components/explore/scene";
import { code39 } from "@/lib/board/code39";
import type { BoxFace, CutOut } from "@/lib/board/box";
import type { ViewerData } from "./types";

/** Closed: what the customer unpacks. Exploded: how it comes apart. X-ray: the board in place, clickable. */
export type Shell = "closed" | "exploded" | "xray";

type Enc = NonNullable<ViewerData["enclosure"]>;
type BoxInfo = NonNullable<ViewerData["box"]>;
type Product = NonNullable<ViewerData["product"]>;
type V3 = [number, number, number];

/** Re-maps an extrusion along local z to run along world x, with the profile's x, y becoming world y, z. */
const TO_X = new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);

/** How far each piece travels at full explode (mm). */
const TRAVEL = { lid: 40, screws: 58, board: 25, panels: 40, feet: 8 };

/** Box extents the camera should frame for a shell mode (exploded pieces fly out). */
export function boxFrame(enc: Enc, shell: Shell) {
  if (shell !== "exploded") return { w: enc.length, h: enc.width, depth: enc.height + 6 };
  return enc.style === "extruded"
    ? { w: enc.length + 2 * (TRAVEL.panels + 12), h: enc.width, depth: enc.height + TRAVEL.lid + 10 }
    : { w: enc.length, h: enc.width, depth: enc.height + TRAVEL.screws + 20 };
}

/** World z just under the feet, where the contact shadow goes. */
export function boxFloorZ(enc: Enc, shell: Shell, explode: number) {
  return -enc.height / 2 - 2.5 - (shell === "exploded" ? explode * TRAVEL.feet : 0) - 0.1;
}

/** Where the board sits in the box for this shell mode: world z of its centre and how far it has slid out. */
export function boardPlacement(enc: Enc, box: BoxInfo, thickness: number, shell: Shell, explode: number) {
  const e = shell === "exploded" ? explode : 0;
  const slides = box.mount === "slots";
  return {
    x: slides ? -e * enc.length * 0.35 : 0,
    z: -enc.height / 2 + box.boardBottom + thickness / 2 + (slides ? 0 : e * TRAVEL.board),
  };
}

function roundedRect<T extends THREE.Path>(path: T, w: number, h: number, r: number): T {
  const rr = Math.max(0.05, Math.min(r, w / 2 - 0.05, h / 2 - 0.05));
  const [x0, x1, y0, y1] = [-w / 2 + rr, w / 2 - rr, -h / 2 + rr, h / 2 - rr];
  path.moveTo(x0, -h / 2);
  path.lineTo(x1, -h / 2);
  path.absarc(x1, y0, rr, -Math.PI / 2, 0, false);
  path.lineTo(w / 2, y1);
  path.absarc(x1, y1, rr, 0, Math.PI / 2, false);
  path.lineTo(x0, h / 2);
  path.absarc(x0, y1, rr, Math.PI / 2, Math.PI, false);
  path.lineTo(-w / 2, y0);
  path.absarc(x0, y0, rr, Math.PI, Math.PI * 1.5, false);
  return path;
}

/** A rounded rectangular ring — the walls of a box, or the profile of an extrusion. */
function ring(w: number, h: number, r: number, wall: number, depth: number) {
  const s = roundedRect(new THREE.Shape(), w, h, r);
  s.holes.push(roundedRect(new THREE.Path(), w - 2 * wall, h - 2 * wall, Math.max(0.3, r - wall)));
  return new THREE.ExtrudeGeometry(s, { ...EXTRUDE, depth, curveSegments: 8 });
}

/** One half of a clamshell extrusion profile: a U channel, open along the split line (v = 0). */
function channel(w: number, h: number, r: number, wall: number, depth: number, upper: boolean) {
  const [a, b] = [w / 2, h / 2];
  const ro = Math.min(r, a, b);
  const ri = Math.max(0.3, ro - wall);
  const pts: THREE.Vector2[] = [];
  const at = (u: number, v: number) => pts.push(new THREE.Vector2(u, upper ? -v : v));
  const arc = (cu: number, cv: number, rad: number, from: number, to: number) => {
    for (let i = 0; i <= 6; i++) at(cu + rad * Math.cos(from + ((to - from) * i) / 6), cv + rad * Math.sin(from + ((to - from) * i) / 6));
  };
  at(-a, 0);
  arc(-a + ro, -b + ro, ro, Math.PI, 1.5 * Math.PI);
  arc(a - ro, -b + ro, ro, 1.5 * Math.PI, 2 * Math.PI);
  at(a, 0);
  at(a - wall, 0);
  arc(a - wall - ri, -b + wall + ri, ri, 2 * Math.PI, 1.5 * Math.PI);
  arc(-a + wall + ri, -b + wall + ri, ri, 1.5 * Math.PI, Math.PI);
  at(-a + wall, 0);
  return new THREE.ExtrudeGeometry(new THREE.Shape(pts), { ...EXTRUDE, depth, curveSegments: 8 });
}

function plate(w: number, h: number, r: number, depth: number) {
  return new THREE.ExtrudeGeometry(roundedRect(new THREE.Shape(), w, h, r), {
    ...EXTRUDE,
    depth,
    curveSegments: 8,
  });
}

function useMaterials(enc: Enc, shell: Shell) {
  const mats = useMemo(() => {
    const xray = shell === "xray";
    const metal = enc.material === "aluminium";
    return {
      body: new THREE.MeshStandardMaterial({
        color: enc.finish,
        // A small studio has little to reflect, so fully metallic reads as gunmetal; keep some diffuse and boost reflections.
        metalness: metal ? 0.55 : 0,
        // Die-cast is a matt casting skin; extrusions are anodised and smoother; ABS is satin.
        roughness: metal ? (enc.style === "diecast" ? 0.5 : 0.36) : 0.55,
        envMapIntensity: metal ? 1.8 : 1,
        transparent: xray,
        opacity: xray ? 0.2 : 1,
        depthWrite: !xray,
      }),
      dark: new THREE.MeshStandardMaterial({
        color: "#141518",
        roughness: 0.8,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      rubber: new THREE.MeshStandardMaterial({
        color: "#1d1e21",
        roughness: 0.95,
      }),
      brass: new THREE.MeshStandardMaterial({
        color: "#c8a64b",
        metalness: 0.85,
        roughness: 0.3,
      }),
      steel: new THREE.MeshStandardMaterial({
        color: "#d4d6da",
        metalness: 0.9,
        roughness: 0.28,
      }),
    };
  }, [enc, shell]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  return mats;
}
type Mats = ReturnType<typeof useMaterials>;

type Dir = "+z" | "+x" | "-x";
const DIR_ROT: Record<Dir, V3> = {
  "+z": [0, 0, 0],
  "+x": [0, Math.PI / 2, 0],
  "-x": [0, -Math.PI / 2, 0],
};
const DIR_VEC: Record<Dir, V3> = {
  "+z": [0, 0, 1],
  "+x": [1, 0, 0],
  "-x": [-1, 0, 0],
};

/** Pan-head cross-recess screw; `at` is where the head sits, `lift` backs it out along `dir`. */
function Screw({ at, dir, lift, mats }: { at: V3; dir: Dir; lift: number; mats: Mats }) {
  const v = DIR_VEC[dir];
  return (
    <group position={[at[0] + v[0] * lift, at[1] + v[1] * lift, at[2] + v[2] * lift]} rotation={DIR_ROT[dir]}>
      <mesh position={[0, 0, 0.6]} rotation={[Math.PI / 2, 0, 0]} material={mats.steel} castShadow>
        <cylinderGeometry args={[2.55, 2.75, 1.2, 20]} />
      </mesh>
      <mesh position={[0, 0, 1.21]} material={mats.dark}>
        <boxGeometry args={[2.3, 0.45, 0.02]} />
      </mesh>
      <mesh position={[0, 0, 1.21]} material={mats.dark}>
        <boxGeometry args={[0.45, 2.3, 0.02]} />
      </mesh>
      {/* the shank shows once the screw is backed out */}
      <mesh position={[0, 0, -4]} rotation={[Math.PI / 2, 0, 0]} material={mats.steel}>
        <cylinderGeometry args={[1.4, 1.4, 8, 12]} />
      </mesh>
    </group>
  );
}

function Feet({ enc, drop, mats }: { enc: Enc; drop: number; mats: Mats }) {
  const fx = enc.length / 2 - Math.min(14, enc.length * 0.12);
  const fy = enc.width / 2 - Math.min(10, enc.width * 0.15);
  return (
    <>
      {[
        [fx, fy],
        [fx, -fy],
        [-fx, fy],
        [-fx, -fy],
      ].map(([x, y]) => (
        <mesh key={`${x},${y}`} position={[x, y, -1.25 - drop]} rotation={[Math.PI / 2, 0, 0]} material={mats.rubber} castShadow>
          <cylinderGeometry args={[5, 5.4, 2.5, 24]} />
        </mesh>
      ))}
    </>
  );
}

/** Hex standoffs on the floor under the board's corner mounting holes. */
function Standoffs({ enc, box, board, mats }: { enc: Enc; box: BoxInfo; board: { width: number; height: number }; mats: Mats }) {
  return (
    <>
      {[
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ].map(([sx, sy]) => (
        <mesh key={`${sx},${sy}`} position={[sx * (board.width / 2 - 4), sy * (board.height / 2 - 4), enc.wall + box.standoff / 2]} rotation={[Math.PI / 2, 0, 0]} material={mats.brass}>
          <cylinderGeometry args={[2.75, 2.75, box.standoff, 6]} />
        </mesh>
      ))}
    </>
  );
}

const FACE_BASIS: Record<BoxFace, [V3, V3, V3]> = {
  "x+": [
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 0],
  ],
  "x-": [
    [0, -1, 0],
    [0, 0, 1],
    [-1, 0, 0],
  ],
  "y+": [
    [-1, 0, 0],
    [0, 0, 1],
    [0, 1, 0],
  ],
  "y-": [
    [1, 0, 0],
    [0, 0, 1],
    [0, -1, 0],
  ],
};

/** A wall opening with the connector's face showing through it. */
function Opening({ c, at, mats }: { c: CutOut; at: V3; mats: Mats }) {
  const rotation = useMemo(() => {
    const [x, y, z] = FACE_BASIS[c.face].map((v) => new THREE.Vector3(...v));
    return new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }, [c.face]);
  const face = useMemo(() => `#${new THREE.Color(c.color).multiplyScalar(0.7).getHexString()}`, [c.color]);
  return (
    <group position={at} rotation={rotation}>
      <mesh material={mats.dark}>
        <planeGeometry args={[c.w, c.h]} />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[Math.max(0.5, c.w - 1.4), Math.max(0.5, c.h - 1.4)]} />
        <meshStandardMaterial color={face} roughness={0.6} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
      </mesh>
    </group>
  );
}

/** One label texture per product, drawn on a canvas: name, P/N and revision, customer, Code 39 of the P/N. */
const LABELS = new Map<string, THREE.CanvasTexture>();
function labelTexture(p: Product): THREE.CanvasTexture | null {
  const key = [p.name, p.partNumber, p.revision, p.customer].join("|");
  const hit = LABELS.get(key);
  if (hit) return hit;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#f4f3ee";
  g.fillRect(0, 0, 1024, 512);
  g.strokeStyle = "#1b1c1f";
  g.lineWidth = 6;
  g.strokeRect(14, 14, 996, 484);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#16171a";
  let size = 60;
  g.font = `700 ${size}px system-ui, sans-serif`;
  while (size > 28 && g.measureText(p.name).width > 940) g.font = `700 ${(size -= 4)}px system-ui, sans-serif`;
  g.fillText(p.name, 512, 92);
  g.font = "500 40px ui-monospace, Consolas, monospace";
  g.fillText(`P/N ${p.partNumber ?? "—"}   REV ${p.revision}`, 512, 162);
  g.fillStyle = "#55575d";
  g.font = "400 34px system-ui, sans-serif";
  g.fillText(p.customer, 512, 214);
  const bars = p.partNumber ? code39(p.partNumber) : null;
  if (bars) {
    const total = bars.reduce((s, b) => s + b, 0);
    const unit = Math.min(4, 900 / total);
    let x = 512 - (total * unit) / 2;
    g.fillStyle = "#111";
    bars.forEach((b, i) => {
      if (i % 2 === 0) g.fillRect(x, 254, b * unit, 160);
      x += b * unit;
    });
    g.font = "500 30px ui-monospace, Consolas, monospace";
    g.fillText(p.partNumber!.toUpperCase(), 512, 452);
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  LABELS.set(key, t);
  return t;
}

function Label({ product, width, at, ghost }: { product: Product; width: number; at: V3; ghost: boolean }) {
  const map = useMemo(() => labelTexture(product), [product]);
  if (!map) return null;
  return (
    <mesh position={at}>
      <planeGeometry args={[width, width / 2]} />
      <meshStandardMaterial map={map} roughness={0.7} transparent={ghost} opacity={ghost ? 0.3 : 1} depthWrite={!ghost} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </mesh>
  );
}

/** Where an opening sits on the outside of a fixed wall (z up from the outside bottom). */
function wallPoint(enc: Enc, c: CutOut): V3 {
  const o = 0.05;
  if (c.face === "x+") return [enc.length / 2 + o, c.u, c.z];
  if (c.face === "x-") return [-enc.length / 2 - o, c.u, c.z];
  if (c.face === "y+") return [c.u, enc.width / 2 + o, c.z];
  return [c.u, -enc.width / 2 - o, c.z];
}

type ModelProps = {
  enc: Enc;
  box: BoxInfo;
  board: { width: number; height: number; thickness: number };
  product: ViewerData["product"];
  shell: Shell;
  explode: number;
};

/** Die-cast or moulded box: open body with corner bosses, a lid held by four screws, feet underneath. */
function CastBox({ enc, box, board, product, shell, explode }: ModelProps) {
  const mats = useMaterials(enc, shell);
  const { length: L, width: W, height: H, wall, lidHeight: lid, cornerRadius: r } = enc;
  const bodyH = H - lid;
  const geo = useMemo(
    () => ({
      walls: ring(L, W, r, wall, bodyH),
      floor: plate(L - 0.1, W - 0.1, r, wall),
      lid: plate(L, W, r, lid),
    }),
    [L, W, r, wall, bodyH, lid],
  );
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);
  const e = shell === "exploded" ? explode : 0;
  const bx = L / 2 - wall - 2.2;
  const by = W / 2 - wall - 2.2;
  const corners: [number, number][] = [
    [bx, by],
    [bx, -by],
    [-bx, by],
    [-bx, -by],
  ];
  return (
    <group position={[0, 0, -H / 2]}>
      <mesh geometry={geo.walls} material={mats.body} castShadow receiveShadow />
      <mesh geometry={geo.floor} material={mats.body} receiveShadow />
      {corners.map(([x, y]) => (
        <mesh key={`boss${x},${y}`} position={[x, y, wall + (bodyH - wall) / 2]} rotation={[Math.PI / 2, 0, 0]} material={mats.body}>
          <cylinderGeometry args={[3, 3, bodyH - wall, 16]} />
        </mesh>
      ))}
      <group position={[0, 0, bodyH + e * TRAVEL.lid]}>
        <mesh geometry={geo.lid} material={mats.body} castShadow />
        {product ? <Label product={product} width={Math.min(L * 0.55, 64)} at={[0, 0, lid + 0.02]} ghost={shell === "xray"} /> : null}
      </group>
      {corners.map(([x, y]) => (
        <Screw key={`screw${x},${y}`} at={[x, y, H]} dir="+z" lift={e * TRAVEL.screws} mats={mats} />
      ))}
      <Standoffs enc={enc} box={box} board={board} mats={mats} />
      <Feet enc={enc} drop={e * TRAVEL.feet} mats={mats} />
      {box.cutouts.map((c) => (
        <Opening key={c.refDes} c={c} at={wallPoint(enc, c)} mats={mats} />
      ))}
    </group>
  );
}

/** Extruded box: a two-piece clamshell with PCB slot rails, two end panels held by four screws each, feet underneath. */
function ExtrudedBox({ enc, box, board, product, shell, explode }: ModelProps) {
  const mats = useMaterials(enc, shell);
  const { length: L, width: W, height: H, wall, lidHeight: panelT, cornerRadius: r } = enc;
  const tubeL = L - 2 * panelT;
  const geo = useMemo(() => {
    // Two halves that slide together along the split line, like the real 1455 clamshell.
    const half = (upper: boolean) => channel(W, H, r, wall, tubeL, upper).applyMatrix4(TO_X).translate(-tubeL / 2, 0, H / 2);
    const panel = plate(W, H, r, panelT).applyMatrix4(TO_X).translate(0, 0, H / 2);
    return { lower: half(false), upper: half(true), panel };
  }, [W, H, r, wall, tubeL, panelT]);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);
  const e = shell === "exploded" ? explode : 0;
  const out = e * TRAVEL.panels;
  const railY = W / 2 - wall - 0.6;
  const sy = W / 2 - 6;
  const sz = H / 2 - 6;
  return (
    <group position={[0, 0, -H / 2]}>
      <mesh geometry={geo.lower} material={mats.body} castShadow receiveShadow />
      <group position={[0, 0, e * TRAVEL.lid]}>
        <mesh geometry={geo.upper} material={mats.body} castShadow />
        {product ? <Label product={product} width={Math.min(tubeL * 0.45, 70)} at={[0, 0, H + 0.03]} ghost={shell === "xray"} /> : null}
      </group>
      {/* the split line where the two halves of the extrusion meet */}
      {[-1, 1].map((s) => (
        <mesh key={`split${s}`} position={[0, s * (W / 2 + 0.02), H / 2]} material={mats.dark}>
          <boxGeometry args={[tubeL, 0.02, 0.5]} />
        </mesh>
      ))}
      {/* slot rails either side of where a full-width board would run */}
      {[-1, 1].flatMap((s) =>
        [box.boardBottom - 0.6, box.boardBottom + board.thickness + 0.6].map((z) => (
          <mesh key={`rail${s},${z}`} position={[0, s * railY, z]} material={mats.body}>
            <boxGeometry args={[tubeL, 1.2, 0.8]} />
          </mesh>
        )),
      )}
      {box.mount === "standoffs" ? <Standoffs enc={enc} box={box} board={board} mats={mats} /> : null}
      {[-1, 1].map((s) => {
        const face: BoxFace = s < 0 ? "x-" : "x+";
        const outer = s < 0 ? 0 : panelT;
        return (
          <group key={face} position={[s * (tubeL / 2 + out) + (s < 0 ? -panelT : 0), 0, 0]}>
            <mesh geometry={geo.panel} material={mats.body} castShadow />
            {[
              [sy, sz],
              [sy, -sz],
              [-sy, sz],
              [-sy, -sz],
            ].map(([y, z]) => (
              <Screw key={`${y},${z}`} at={[outer, y, H / 2 + z]} dir={s < 0 ? "-x" : "+x"} lift={e * 18} mats={mats} />
            ))}
            {box.cutouts
              .filter((c) => c.face === face)
              .map((c) => (
                <Opening key={c.refDes} c={c} at={[outer + s * 0.05, c.u, c.z]} mats={mats} />
              ))}
          </group>
        );
      })}
      <Feet enc={enc} drop={e * TRAVEL.feet} mats={mats} />
      {box.cutouts
        .filter((c) => c.face === "y-" || c.face === "y+")
        .map((c) => (
          <Opening key={c.refDes} c={c} at={wallPoint(enc, c)} mats={mats} />
        ))}
    </group>
  );
}

export function EnclosureModel(props: ModelProps) {
  return props.enc.style === "extruded" ? <ExtrudedBox {...props} /> : <CastBox {...props} />;
}
