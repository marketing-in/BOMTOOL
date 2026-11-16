"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { cn } from "@/lib/utils";

export type Vec3 = [number, number, number];

/** three r175 drops the end caps of an extrusion when bevels are off; a zero-size bevel keeps them. */
export const EXTRUDE = { bevelEnabled: true, bevelThickness: 0, bevelSize: 0, bevelSegments: 1 } as const;

/** Removes the half nearest the camera (y < 0), so you look straight into the section along the centre line. */
const CUT = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function Clip({ on }: { on: boolean }) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    gl.clippingPlanes = on ? [CUT] : [];
    invalidate();
  }, [gl, on, invalidate]);
  return null;
}

function Rig({ position, target }: { position: Vec3; target: Vec3 }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update(): void } | null;
  const invalidate = useThree((s) => s.invalidate);
  const key = `${position.join(",")}|${target.join(",")}`;
  useEffect(() => {
    camera.up.set(0, 0, 1);
    camera.position.set(...position);
    camera.lookAt(...target);
    if (controls) {
      controls.target.set(...target);
      controls.update();
    }
    invalidate();
    // `key` carries the values; the arrays themselves are new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, controls, key, invalidate]);
  return null;
}

/** Z-up scene with soft studio light, orbit controls and an optional section cut. */
export function ExploreCanvas({ children, cut, camera, target = [0, 0, 0], label }: { children: ReactNode; cut: boolean; camera: Vec3; target?: Vec3; label: string }) {
  return (
    // Render on demand: a still model costs no frames, which matters on a factory-floor tablet.
    <Canvas frameloop="demand" dpr={[1, 2]} camera={{ fov: 32, near: 0.05, far: 4000 }} aria-label={label}>
      <Rig position={camera} target={target} />
      <Clip on={cut} />
      <ambientLight intensity={0.75} />
      <hemisphereLight args={["#ffffff", "#40444f", 0.8]} />
      <directionalLight position={[40, -60, 90]} intensity={1.9} />
      <directionalLight position={[-60, 40, 30]} intensity={0.55} />
      {children}
      <OrbitControls makeDefault enableDamping dampingFactor={0.12} />
    </Canvas>
  );
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** 0 → 1 explode amount that eases toward its target (instant for reduced-motion users). */
export function useEased(target: number, reduced: boolean) {
  const [value, setValue] = useState(target);
  useEffect(() => {
    if (reduced) return setValue(target);
    let raf = 0;
    const start = performance.now();
    const from = value;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 320);
      const e = 1 - Math.pow(1 - k, 3);
      setValue(from + (target - from) * e);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // Only re-run when the target changes; `value` is the starting point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduced]);
  return value;
}

// ───────────────────────────── Panel controls ─────────────────────────────

export function ControlGroup({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="text-xs text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-8 rounded-md border px-2.5 text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
            value === o.value ? "border-primary/40 bg-primary/10 text-foreground" : "bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--primary)]" />
      {children}
    </label>
  );
}

export function Slider({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <label className="block text-sm">
      <span className="flex justify-between text-xs text-muted-foreground">
        {label}
        <span className="num">{Math.round(value * 100)}%</span>
      </span>
      <input type="range" min={0} max={1} step={0.01} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1.5 w-full accent-[var(--primary)]" />
    </label>
  );
}

/** Camera presets as small buttons over the canvas. */
export function ViewButtons<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="absolute top-3 left-3 flex gap-1 rounded-md border bg-card/90 p-0.5 shadow-sm backdrop-blur">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 rounded px-2 text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
            value === o.value ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
