"use client";

import { useEffect, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { BodySpec } from "@/lib/board/bodies";
import { PartBody } from "@/components/viewer/part-mesh";

function Rig({ span }: { span: number }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.up.set(0, 0, 1);
    // Three-quarter view from the front-right, far enough back that the whole coupon fits.
    camera.position.set(span * 1.75, -span * 2.3, span * 1.6);
    camera.lookAt(0, 0, 0);
  }, [camera, span]);
  return null;
}

/** One component on a small PCB coupon, slowly turning (still for reduced-motion users). */
export default function EntryModel({ body }: { body: BodySpec }) {
  const span = Math.max(body.length, body.width, body.height * 1.6, 2.2);
  const [reduced, setReduced] = useState(true);
  useEffect(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  return (
    <Canvas dpr={[1, 2]} shadows camera={{ fov: 32, near: span / 50, far: span * 60 }} aria-label="3D model of a typical package">
      <Rig span={span} />
      <ambientLight intensity={0.8} />
      <hemisphereLight args={["#ffffff", "#4b5160", 0.9]} />
      <directionalLight position={[span * 2, -span * 3, span * 4]} intensity={2.1} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-span * 3, span * 2, span * 2]} intensity={0.6} />
      <mesh position={[0, 0, -0.8]} receiveShadow>
        <boxGeometry args={[span * 1.5, span * 1.25, 1.6]} />
        <meshStandardMaterial color="#21633b" roughness={0.6} />
      </mesh>
      <PartBody body={body} color={lift(body.color)} />
      <OrbitControls enablePan={false} autoRotate={!reduced} autoRotateSpeed={0.9} minDistance={span * 0.8} maxDistance={span * 6} />
    </Canvas>
  );
}

/** Black epoxy reads as a silhouette on its own; lift very dark bodies just enough to show their form. */
function lift(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 48 ? "#3a3b40" : hex;
}
