"use client";

import { Canvas } from "@react-three/fiber";
import { Bounds, Html, OrbitControls } from "@react-three/drei";

/** One machine of the line as the 3D view needs it. */
export type Machine3D = { id: string; type: string; short: string; color: string; position: number };

const BODY = "#eceae6";
const GLASS = "#26282b";
const STEEL = "#a9aaa8";

/** Footprint (length along the line, depth) and body height per kind of machine, in metres-ish units. */
const SIZE: Record<string, [number, number, number]> = {
  PICK_AND_PLACE: [1.9, 1.7, 1.25],
  STENCIL_PRINTER: [1.3, 1.4, 1.35],
  SPI: [1.1, 1.2, 1.35],
  AOI: [1.1, 1.2, 1.35],
  XRAY: [1.4, 1.4, 1.6],
  REFLOW_OVEN: [4.2, 1.3, 1.15],
  WAVE_SOLDER: [3.2, 1.3, 1.2],
  SELECTIVE_SOLDER: [1.8, 1.4, 1.3],
  LASER_MARKER: [1.0, 1.1, 1.3],
  CONFORMAL_COATER: [1.3, 1.2, 1.3],
  DEPANELER: [1.2, 1.1, 1.2],
  OTHER: [0.9, 0.7, 0.75],
};
const sizeOf = (type: string) => SIZE[type] ?? [1.2, 1.1, 1.1];

function Box({ p, s, c, r = 0.6 }: { p: [number, number, number]; s: [number, number, number]; c: string; r?: number }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={r} />
    </mesh>
  );
}

/** A machine built from a few boxes: a cabinet, a coloured band, and the feature that tells its kind apart. */
function Model({ type, color }: { type: string; color: string }) {
  const [w, d, h] = sizeOf(type);
  const zones = type === "REFLOW_OVEN" ? 8 : 3;
  const band = <Box p={[0, h * 0.42, d / 2 + 0.005]} s={[w * 0.98, 0.16, 0.02]} c={color} />;
  const tower = (
    <group position={[w / 2 - 0.14, h, -d / 2 + 0.14]}>
      <Box p={[0, 0.16, 0]} s={[0.06, 0.32, 0.06]} c={STEEL} />
      <Box p={[0, 0.36, 0]} s={[0.09, 0.09, 0.09]} c="#3aa35c" r={0.3} />
    </group>
  );
  const screen = (
    <group position={[-w / 2 + 0.28, h + 0.22, d / 2 - 0.1]}>
      <Box p={[0, 0, 0]} s={[0.36, 0.26, 0.04]} c={GLASS} r={0.2} />
      <Box p={[0, -0.18, -0.02]} s={[0.05, 0.14, 0.05]} c={STEEL} />
    </group>
  );
  if (type === "OTHER")
    return (
      <group>
        <Box p={[0, h - 0.04, d / 2 - 0.05]} s={[w, 0.08, 0.06]} c={STEEL} />
        <Box p={[0, h - 0.04, -d / 2 + 0.05]} s={[w, 0.08, 0.06]} c={STEEL} />
        {[-1, 1].map((x) => [-1, 1].map((z) => <Box key={`${x}${z}`} p={[(x * w) / 2.6, (h - 0.08) / 2, (z * d) / 2.4]} s={[0.06, h - 0.08, 0.06]} c={STEEL} />))}
        <Box p={[0, h - 0.02, 0]} s={[w * 0.5, 0.02, d * 0.55]} c={color} />
      </group>
    );
  if (type === "REFLOW_OVEN" || type === "WAVE_SOLDER")
    return (
      <group>
        <Box p={[0, h / 2, 0]} s={[w, h, d]} c={BODY} />
        <Box p={[0, h + 0.14, 0]} s={[w * 0.92, 0.28, d * 0.86]} c="#d9d7d2" />
        {band}
        {Array.from({ length: zones }, (_, i) => (
          <Box key={i} p={[-w * 0.4 + (i * w * 0.8) / (zones - 1), h * 0.62, d / 2 + 0.01]} s={[(w * 0.7) / zones, h * 0.3, 0.02]} c={GLASS} r={0.2} />
        ))}
        <Box p={[-w * 0.3, h + 0.55, 0]} s={[0.2, 0.55, 0.2]} c={STEEL} />
        <Box p={[w * 0.3, h + 0.55, 0]} s={[0.2, 0.55, 0.2]} c={STEEL} />
        {screen}
        {tower}
      </group>
    );
  if (type === "PICK_AND_PLACE")
    return (
      <group>
        <Box p={[0, h * 0.35, 0]} s={[w, h * 0.7, d]} c={BODY} />
        <Box p={[0, h * 0.95, 0]} s={[w * 0.96, h * 0.5, d * 0.8]} c={GLASS} r={0.15} />
        <Box p={[0, h * 1.22, 0]} s={[w, 0.06, d * 0.84]} c="#d9d7d2" />
        {Array.from({ length: 12 }, (_, i) => (
          <Box key={i} p={[-w * 0.42 + (i * w * 0.84) / 11, h * 0.62, d / 2 + 0.16]} s={[0.07, 0.16, 0.34]} c={STEEL} />
        ))}
        {band}
        {screen}
        {tower}
      </group>
    );
  const head = type === "SPI" || type === "AOI" || type === "XRAY" || type === "LASER_MARKER";
  return (
    <group>
      <Box p={[0, h * 0.4, 0]} s={[w, h * 0.8, d]} c={BODY} />
      <Box p={[0, h * 0.98, 0]} s={[w * 0.94, h * 0.36, d * 0.9]} c={head ? "#d9d7d2" : GLASS} r={head ? 0.5 : 0.15} />
      {head ? <Box p={[0, h * 0.98, d * 0.45 + 0.005]} s={[w * 0.6, h * 0.22, 0.02]} c={GLASS} r={0.15} /> : null}
      <Box p={[0, h * 1.18, 0]} s={[w * 0.96, 0.04, d * 0.92]} c="#d9d7d2" />
      {band}
      {screen}
      {tower}
    </group>
  );
}

/** The line in 3D: its machines in flow order on a floor strip. Click one to select it; drag to turn the view. */
export default function Line3D({ machines, selected, onSelect }: { machines: Machine3D[]; selected: string | null; onSelect: (id: string) => void }) {
  const gap = 0.35;
  let x = 0;
  const placed = machines.map((m) => {
    const [w, d, h] = sizeOf(m.type);
    const at = x + w / 2;
    x += w + gap;
    return { m, at, w, d, h };
  });
  const total = Math.max(x - gap, 1);
  return (
    <Canvas shadows orthographic dpr={[1, 2]} camera={{ position: [3.5, 4.5, 10], zoom: 60, near: -50, far: 100 }} aria-hidden>
      <ambientLight intensity={1.5} />
      <directionalLight position={[4, 9, 6]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <Bounds fit clip observe margin={1.08}>
        <group position={[-total / 2, 0, 0]}>
          <mesh position={[total / 2, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[total + 1.2, 3.2]} />
            <meshStandardMaterial color="#e4e4df" roughness={1} />
          </mesh>
          {placed.map(({ m, at, w, d, h }) => {
            const on = m.id === selected;
            return (
              <group key={m.id} position={[at, 0, 0]}>
                <group
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(m.id);
                  }}
                  onPointerOver={() => (document.body.style.cursor = "pointer")}
                  onPointerOut={() => (document.body.style.cursor = "")}
                >
                  <Model type={m.type} color={m.color} />
                </group>
                {on ? (
                  <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[w + 0.3, d + 0.7]} />
                    <meshBasicMaterial color="#f7c61b" />
                  </mesh>
                ) : null}
                <Html position={[0, h + (m.type === "OTHER" ? 0.35 : 1.0), 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
                  <span
                    style={{
                      display: "grid",
                      placeItems: "center",
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      font: "600 12px var(--font-body)",
                      background: on ? "#f7c61b" : "#ffffff",
                      color: "#1a1a18",
                      border: "1px solid #1a1a18",
                    }}
                  >
                    {m.position}
                  </span>
                </Html>
              </group>
            );
          })}
        </group>
      </Bounds>
      <OrbitControls makeDefault enableZoom={false} enablePan={false} minPolarAngle={0.7} maxPolarAngle={1.35} minAzimuthAngle={-0.9} maxAzimuthAngle={0.9} />
    </Canvas>
  );
}
