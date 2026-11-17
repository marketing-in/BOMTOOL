"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createLineModels, LINE_LAYOUT, MACHINE_SIZE } from "@/vendor/circuitflow/factoryModels.js";

/** One machine of the line as the view needs it. */
export type Machine3D = { id: string; type: string; short: string; model: string; color: string; position: number };

/** 3D: turn the line freely. 2D: the floor plan from above, to scale. */
export type ViewMode = "3d" | "2d";

type Built = { group: THREE.Group; hit: THREE.Object3D[]; lamps: THREE.Mesh[]; screen: { draw: (s: Record<string, string>) => void }; update: (t: number, busy: boolean, clock?: number) => void };
type Models = {
  machine: (id: string, o: { x: number; w: number; d: number; cy: number; roof?: boolean }) => Built;
  link: (x0: number, x1: number, cy: number) => THREE.Group;
  dispose: () => void;
};

/**
 * Which circuitflow model draws each kind of our machines (src/vendor/circuitflow/factoryModels.js), and its
 * footprint in scene units. Kinds circuitflow has no model of borrow the nearest one: a laser marker is a
 * hooded head over the conveyor like an SPI, a coater or a router a gantry like a selective or flying-probe cell,
 * a bench or a box-build station the ICT fixture.
 */
const W = LINE_LAYOUT.width as Record<string, number>;
const S = MACHINE_SIZE as Record<string, { w: number; d: number }>;
const LINE_D = LINE_LAYOUT.depth as number;
const KIND: Record<string, { id: string; w: number; d: number; inline: boolean }> = {
  BOARD_LOADER: { id: "loader", w: W.loader, d: LINE_D, inline: true },
  LASER_MARKER: { id: "spi", w: 1.3, d: LINE_D, inline: true },
  STENCIL_PRINTER: { id: "printer", w: W.printer, d: LINE_D, inline: true },
  SPI: { id: "spi", w: W.spi, d: LINE_D, inline: true },
  PICK_AND_PLACE: { id: "pnp", w: W.pnp, d: LINE_D, inline: true },
  REFLOW_OVEN: { id: "reflow", w: W.reflow, d: LINE_D, inline: true },
  AOI: { id: "aoi", w: W.aoi, d: LINE_D, inline: true },
  XRAY: { id: "xray", w: W.xray, d: LINE_D, inline: false },
  WAVE_SOLDER: { id: "wave", ...S.wave, inline: false },
  SELECTIVE_SOLDER: { id: "selective", ...S.selective, inline: false },
  CONFORMAL_COATER: { id: "selective", ...S.selective, inline: false },
  DEPANELER: { id: "probe", ...S.probe, inline: false },
  ICT: { id: "ict", ...S.ict, inline: false },
  FLYING_PROBE: { id: "probe", ...S.probe, inline: false },
};
const BENCH = { id: "ict", ...S.ict, inline: false };
const isConveyor = (m: Machine3D) => m.type === "OTHER" && /conveyor/i.test(m.model);
const GAP = 0.9;

/** Lay the line out left to right: machines at their footprints, link conveyors where the sheet lists them, and a short link between two inline machines that touch. */
function layout(machines: Machine3D[]) {
  let x = 0;
  const items: ({ kind: "machine"; m: Machine3D; spec: (typeof KIND)[string]; x: number } | { kind: "link"; x0: number; x1: number })[] = [];
  let prevInline = false;
  for (const m of machines) {
    if (isConveyor(m)) {
      const len = /0\.6/.test(m.model) ? 0.8 : 1.2;
      items.push({ kind: "link", x0: x, x1: x + len });
      x += len;
      prevInline = true;
      continue;
    }
    const spec = KIND[m.type] ?? BENCH;
    if (items.length) {
      const last = items[items.length - 1];
      if (spec.inline && prevInline && last.kind === "machine") {
        items.push({ kind: "link", x0: x, x1: x + 0.5 });
        x += 0.5;
      } else if (last.kind === "machine" || !spec.inline) x += GAP;
    }
    items.push({ kind: "machine", m, spec, x: x + spec.w / 2 });
    x += spec.w;
    prevInline = spec.inline;
  }
  return { items, length: x };
}

/**
 * The line built from circuitflow's machine models, numbered in flow order. Click a machine to select it.
 * In 3D drag to turn the view; in 2D it is the floor plan from above. Machines run (heads moving, the tower
 * green) when the line has open work, unless the viewer prefers reduced motion.
 */
export default function Line3D({ machines, selected, onSelect, mode, running }: { machines: Machine3D[]; selected: string | null; onSelect: (id: string) => void; mode: ViewMode; running: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const api = useRef<{ select: (id: string | null) => void; setMode: (m: ViewMode) => void } | null>(null);
  const pick = useRef(onSelect);
  const [failed, setFailed] = useState(false);
  pick.current = onSelect;

  useEffect(() => {
    const el = host.current;
    const tags = labels.current;
    if (!el || !tags) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const models = createLineModels(THREE) as unknown as Models;
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    scene.add(root);
    const cy = LINE_LAYOUT.cy as number;
    const { items, length } = layout(machines);
    root.position.x = -length / 2;

    const units: { id: string; built: Built; x: number; spec: (typeof KIND)[string] }[] = [];
    const owner = new Map<THREE.Object3D, string>();
    for (const it of items) {
      if (it.kind === "link") {
        root.add(models.link(it.x0, it.x1, cy));
        continue;
      }
      const built = models.machine(it.spec.id, { x: it.x, w: it.spec.w - 0.08, d: it.spec.d, cy, roof: false });
      root.add(built.group);
      built.screen.draw({ name: it.m.short, state: running ? "Running" : "Waiting", board: "—", cycle: "—", done: "—" });
      built.lamps.forEach((l, i) => ((l.material as THREE.MeshStandardMaterial).emissiveIntensity = i === (running ? 0 : 1) ? 1.6 : 0));
      built.group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) owner.set(o, it.m.id);
      });
      units.push({ id: it.m.id, built, x: it.x, spec: it.spec });
    }

    // A yellow floor mark under the selected machine.
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xf7c61b }));
    mark.rotation.x = -Math.PI / 2;
    mark.position.y = 0.004;
    mark.visible = false;
    root.add(mark);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(length + 6, 8), new THREE.ShadowMaterial({ opacity: 0.18 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8578, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(length * 0.2, 9, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const half = length / 2 + 2;
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: 4, bottom: -4, near: 0.1, far: 30 });
    sun.shadow.bias = -0.0004;
    scene.add(sun);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.minZoom = 0.8;
    controls.maxZoom = 4;
    controls.enableDamping = true;
    let view: ViewMode = mode;

    const solid = (o: THREE.Object3D) => {
      const b = new THREE.Box3();
      o.updateWorldMatrix(true, true);
      o.traverse((c) => {
        if ((c as THREE.Mesh).isMesh && !(c as THREE.Sprite).isSprite && c.visible) b.expandByObject(c, true);
      });
      return b;
    };
    const box = solid(root);
    const tops = new Map(units.map((u) => [u.id, solid(u.built.group).max.y]));
    const center = box.getCenter(new THREE.Vector3());
    const fit = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      const size = box.getSize(new THREE.Vector3());
      // Room for the whole line plus margin, at the panel's aspect.
      const spanX = (view === "2d" ? size.x : size.x * 0.95) * 1.08;
      const spanY = (view === "2d" ? size.z : size.y + size.z * 0.6) * 1.35;
      const scale = Math.max(spanX / w, spanY / h);
      Object.assign(camera, { left: (-w * scale) / 2, right: (w * scale) / 2, top: (h * scale) / 2, bottom: (-h * scale) / 2 });
      camera.updateProjectionMatrix();
    };
    const setMode = (m: ViewMode) => {
      view = m;
      camera.zoom = 1;
      // The plan reads cleaner without cast shadows.
      sun.castShadow = m === "3d";
      if (m === "2d") {
        // Straight down onto the floor, the line running left to right.
        controls.enableRotate = false;
        controls.minPolarAngle = controls.maxPolarAngle = 0;
        controls.minAzimuthAngle = controls.maxAzimuthAngle = 0;
        camera.position.set(center.x, 40, center.z + 0.0001);
      } else {
        controls.enableRotate = true;
        controls.minPolarAngle = 0.5;
        controls.maxPolarAngle = 1.35;
        controls.minAzimuthAngle = -1.1;
        controls.maxAzimuthAngle = 1.1;
        camera.position.set(center.x + length * 0.12, 9, center.z + 14);
      }
      controls.target.copy(center);
      camera.lookAt(center);
      controls.update();
      fit();
    };
    setMode(mode);

    const select = (id: string | null) => {
      const u = units.find((x) => x.id === id);
      mark.visible = !!u;
      if (u) {
        mark.scale.set(u.spec.w + 0.3, u.spec.d + 0.6, 1);
        mark.position.x = u.x;
      }
      for (const t of Array.from(tags.children) as HTMLElement[]) t.dataset.on = String(t.dataset.id === id);
    };
    api.current = { select, setMode };

    // Number tags follow their machines on screen.
    tags.replaceChildren(
      ...units.map((u) => {
        const t = document.createElement("span");
        t.dataset.id = u.id;
        t.className = "line-tag";
        t.textContent = String(machines.find((m) => m.id === u.id)?.position ?? "");
        return t;
      }),
    );
    const tagAt = new THREE.Vector3();
    const placeTags = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      units.forEach((u, i) => {
        tagAt.set(u.x + root.position.x, view === "2d" ? 0 : (tops.get(u.id) ?? 2) + 0.35, view === "2d" ? -u.spec.d / 2 - 0.45 : 0).project(camera);
        const t = tags.children[i] as HTMLElement;
        t.style.transform = `translate(${((tagAt.x + 1) / 2) * w}px, ${((1 - tagAt.y) / 2) * h}px) translate(-50%, -50%)`;
      });
    };

    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(root.children, true).find((h) => owner.has(h.object));
      if (hit) pick.current(owner.get(hit.object)!);
    };
    const onMove = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      renderer.domElement.style.cursor = ray.intersectObjects(root.children, true).some((h) => owner.has(h.object)) ? "pointer" : "";
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointermove", onMove);

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clock = new THREE.Clock();
    let raf = 0;
    const frame = () => {
      const t = clock.getElapsedTime();
      for (const u of units) u.built.update(running && !still ? t : 0, running && !still, t);
      controls.update();
      renderer.render(scene, camera);
      placeTags();
      raf = requestAnimationFrame(frame);
    };
    frame();
    const ro = new ResizeObserver(fit);
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointermove", onMove);
      scene.traverse((o) => {
        if ((o as THREE.Mesh).geometry && !(o as THREE.Sprite).isSprite) (o as THREE.Mesh).geometry.dispose();
      });
      mark.material.dispose();
      (floor.material as THREE.Material).dispose();
      models.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
    // The scene is rebuilt only when the line itself changes; mode and selection are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machines, running]);

  useEffect(() => api.current?.setMode(mode), [mode]);
  useEffect(() => api.current?.select(selected), [selected, machines, running]);

  if (failed) return <div className="grid h-full place-items-center text-sm text-muted-foreground">3D needs WebGL, which this browser has turned off.</div>;
  return (
    <div className="relative h-full w-full" aria-hidden>
      <div ref={host} className="absolute inset-0" />
      <div ref={labels} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  );
}
