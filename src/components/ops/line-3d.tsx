"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { buildLine, cameraPosition, fitScale, lightLine, showState, tagPoint, walkFloor, type Machine3D, type ViewMode } from "./line-scene";

export type { Machine3D, ViewMode } from "./line-scene";

/**
 * The line in 3D, numbered in flow order: every machine we have a real model of drawn as that machine
 * (src/components/ops/machine-3d), the rest as circuitflow's generic ones (see line-scene.ts). Click a machine to
 * select it. In 3D drag to turn the view; in 2D it is the floor plan from above. Machines run (heads moving, the
 * tower green) when the line has open work, unless the viewer prefers reduced motion.
 *
 * Two more ways to look, both with the process running because the viewer asked to see it:
 * - walk: on the shop floor at eye height. Drag to look round, arrow keys / W A S D or the pad to walk; `onNear`
 *   says which machine you stand at.
 * - machine: the selected machine alone, close up, running one board after another; `onStep` says which step of
 *   its process (`shares`: each step's part of one board's time) it is at.
 */
type Props = {
  machines: Machine3D[];
  selected: string | null;
  onSelect: (id: string) => void;
  mode: ViewMode;
  running: boolean;
  shares?: number[];
  onStep?: (step: number) => void;
  onNear?: (id: string) => void;
};

const PAD = [
  { k: "up", label: "Walk forward", Icon: ArrowUp, cls: "col-start-2" },
  { k: "left", label: "Step left", Icon: ArrowLeft, cls: "col-start-1 row-start-2" },
  { k: "down", label: "Walk back", Icon: ArrowDown, cls: "col-start-2 row-start-2" },
  { k: "right", label: "Step right", Icon: ArrowRight, cls: "col-start-3 row-start-2" },
] as const;
const KEYS: Record<string, string> = { ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down", ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right" };

export default function Line3D({ machines, selected, onSelect, mode, running, shares, onStep, onNear }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const api = useRef<{ select: (id: string | null) => void; setMode: (m: ViewMode) => void; move: (k: string, on: boolean) => void } | null>(null);
  const cb = useRef({ onSelect, onStep, onNear, shares });
  const [failed, setFailed] = useState(false);
  cb.current = { onSelect, onStep, onNear, shares };

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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const line = buildLine(machines, running);
    const { root, units, length, box } = line;
    scene.add(root);

    // A yellow floor mark under the selected machine.
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xf7c61b }));
    mark.rotation.x = -Math.PI / 2;
    mark.position.y = 0.004;
    mark.visible = false;
    root.add(mark);

    const lights = lightLine(scene, length);
    const floor = walkFloor(length, box.min.z, box.max.z);
    scene.add(floor.group);

    // The whole line is drawn without perspective (it reads as a drawing, to scale); walking and the one-machine
    // view are seen as an eye sees them.
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    const persp = new THREE.PerspectiveCamera(58, 1, 0.05, 200);
    persp.rotation.order = "YXZ";
    let camera: THREE.OrthographicCamera | THREE.PerspectiveCamera = ortho;
    const clock = new THREE.Clock();
    let selId: string | null = null;
    // Walking: where the eye is and where it looks. One machine: when its board started, the step last reported.
    const eye = new THREE.Vector3();
    let yaw = 0, pitch = -0.05, near: string | null = null;
    const keys = new Set<string>();
    let t0 = 0, lastStep = -1;
    const controls = new OrbitControls(ortho, renderer.domElement);
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.minZoom = 0.8;
    controls.maxZoom = 4;
    controls.enableDamping = true;
    let view: ViewMode = mode;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const fit = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      // Room for the whole line plus margin, at the panel's aspect.
      const scale = fitScale(view === "2d" ? "2d" : "3d", size, w, h);
      Object.assign(ortho, { left: (-w * scale) / 2, right: (w * scale) / 2, top: (h * scale) / 2, bottom: (-h * scale) / 2 });
      ortho.updateProjectionMatrix();
      persp.aspect = w / h;
      persp.updateProjectionMatrix();
    };
    // Close up on the selected machine, from the operator's side and a little above; it can be turned all the way round.
    const frameMachine = () => {
      const u = units.find((x) => x.id === selId) ?? units[0];
      if (!u) return;
      const cx = u.x + root.position.x, cz = (u.z0 + u.z1) / 2, r = Math.max(u.w, u.top, u.z1 - u.z0);
      controls.target.set(cx, u.top * 0.5, cz);
      persp.position.set(cx + r * 0.5, u.top * 0.55 + r * 0.3, cz + r * 0.8 + 0.7);
      controls.minDistance = r * 0.5;
      controls.maxDistance = r * 4 + 3;
      controls.update();
      t0 = clock.getElapsedTime();
      lastStep = -1;
    };
    const show = () => {
      for (const u of units) {
        u.group.visible = view !== "machine" || u.id === selId;
        showState(u, view === "walk" ? true : view === "machine" ? u.id === selId : running);
      }
      for (const l of line.links) l.visible = view !== "machine";
      mark.visible = view !== "machine" && !!selId;
    };
    const setMode = (m: ViewMode) => {
      view = m;
      const flat = m === "3d" || m === "2d";
      camera = flat ? ortho : persp;
      controls.object = camera;
      controls.enabled = m !== "walk";
      floor.group.visible = m === "walk";
      tags.style.display = m === "machine" ? "none" : "";
      keys.clear();
      show();
      // The plan reads cleaner without cast shadows.
      lights.sun.castShadow = m !== "2d";
      if (m === "walk") {
        // Start in the aisle in front of the selected machine (or the first), facing the line.
        const u = units.find((x) => x.id === selId) ?? units[0];
        eye.set((u ? u.x : 0) + root.position.x, 1.6, box.max.z + 2.6);
        yaw = 0;
        pitch = -0.05;
        near = null;
        fit();
        return;
      }
      if (m === "machine") {
        controls.enableRotate = true;
        controls.minPolarAngle = 0.15;
        controls.maxPolarAngle = 1.52;
        controls.minAzimuthAngle = -Infinity;
        controls.maxAzimuthAngle = Infinity;
        frameMachine();
        fit();
        return;
      }
      ortho.zoom = 1;
      if (m === "2d") {
        // Straight down onto the floor, the line running left to right.
        controls.enableRotate = false;
        controls.minPolarAngle = controls.maxPolarAngle = 0;
        controls.minAzimuthAngle = controls.maxAzimuthAngle = 0;
      } else {
        controls.enableRotate = true;
        controls.minPolarAngle = 0.5;
        controls.maxPolarAngle = 1.35;
        controls.minAzimuthAngle = -1.1;
        controls.maxAzimuthAngle = 1.1;
      }
      ortho.position.copy(cameraPosition(m, center, length));
      controls.target.copy(center);
      ortho.lookAt(center);
      controls.update();
      fit();
    };

    const select = (id: string | null) => {
      const u = units.find((x) => x.id === id);
      selId = u ? u.id : null;
      mark.visible = !!u && view !== "machine";
      if (u) {
        // Real machines stand shoulder to shoulder: their mark shows in front and behind, not between them.
        mark.scale.set(u.w + (u.real ? 0.06 : 0.3), u.z1 - u.z0 + (u.real ? 0.4 : 0.6), 1);
        mark.position.set(u.x, 0.004, (u.z0 + u.z1) / 2);
      }
      for (const t of Array.from(tags.children) as HTMLElement[]) t.dataset.on = String(t.dataset.id === id);
      if (view === "machine") {
        show();
        frameMachine();
      }
    };
    api.current = { select, setMode, move: (k, on) => (on ? keys.add(k) : keys.delete(k)) };

    // Number tags follow their machines on screen.
    tags.replaceChildren(
      ...units.map((u) => {
        const t = document.createElement("span");
        t.dataset.id = u.id;
        t.className = "line-tag";
        t.textContent = String(u.m.position ?? "");
        return t;
      }),
    );
    const tagAt = new THREE.Vector3();
    const seen = new THREE.Vector3();
    const placeTags = () => {
      if (view === "machine") return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      units.forEach((u, i) => {
        tagPoint(u, view === "2d" ? "2d" : "3d", root.position.x, tagAt);
        const t = tags.children[i] as HTMLElement;
        // Walking, a machine behind you has no tag.
        const behind = view === "walk" && seen.copy(tagAt).applyMatrix4(camera.matrixWorldInverse).z > -0.3;
        t.style.visibility = behind ? "hidden" : "";
        tagAt.project(camera);
        t.style.transform = `translate(${((tagAt.x + 1) / 2) * w}px, ${((1 - tagAt.y) / 2) * h}px) translate(-50%, -50%)`;
      });
    };

    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hitAt = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(line.targets, true).find((h) => line.owner.has(h.object));
      return hit ? line.owner.get(hit.object)! : null;
    };
    let down: { x: number; y: number } | null = null;
    let last: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = last = { x: e.clientX, y: e.clientY };
      if (view === "walk") renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onUp = (e: PointerEvent) => {
      last = null;
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const id = hitAt(e);
      if (id) cb.current.onSelect(id);
    };
    const onMove = (e: PointerEvent) => {
      if (view === "walk" && last) {
        // Drag to look round, as if turning the room by hand.
        yaw += (e.clientX - last.x) * 0.004;
        pitch = Math.max(-0.7, Math.min(0.5, pitch + (e.clientY - last.y) * 0.003));
        last = { x: e.clientX, y: e.clientY };
        return;
      }
      renderer.domElement.style.cursor = hitAt(e) ? "pointer" : "";
    };
    const typing = (e: KeyboardEvent) => /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "") || (e.target as HTMLElement)?.isContentEditable;
    const onKey = (e: KeyboardEvent) => {
      const k = KEYS[e.key];
      if (!k || view !== "walk" || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.type === "keydown") keys.add(k);
      else keys.delete(k);
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    // Where the feet may go: the hall round the line, but not through the machines.
    const hall = { x0: box.min.x - 5, x1: box.max.x + 5, z0: box.min.z - 4.5, z1: box.max.z + 6 };
    const blocked = (x: number, z: number) => x > box.min.x - 0.45 && x < box.max.x + 0.45 && z > box.min.z - 0.45 && z < box.max.z + 0.45;
    const walk = (dt: number) => {
      const f = (keys.has("up") ? 1 : 0) - (keys.has("down") ? 1 : 0), s = (keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0);
      if (f || s) {
        const step = 1.7 * dt;
        const x = Math.max(hall.x0, Math.min(hall.x1, eye.x + (-Math.sin(yaw) * f + Math.cos(yaw) * s) * step));
        const z = Math.max(hall.z0, Math.min(hall.z1, eye.z + (-Math.cos(yaw) * f - Math.sin(yaw) * s) * step));
        if (!blocked(x, eye.z)) eye.x = x;
        if (!blocked(eye.x, z)) eye.z = z;
      }
      persp.position.copy(eye);
      persp.rotation.set(pitch, yaw, 0);
      let best: string | null = null, bestD = Infinity;
      for (const u of units) {
        const d = Math.abs(eye.x - (u.x + root.position.x)) - u.w / 2;
        if (d < bestD) {
          bestD = d;
          best = u.id;
        }
      }
      if (best && best !== near) {
        near = best;
        cb.current.onNear?.(best);
      }
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointermove", onMove);

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setMode(mode);
    let raf = 0, before = 0;
    const frame = () => {
      const t = clock.getElapsedTime();
      const dt = Math.min(0.05, t - before);
      before = t;
      if (view === "machine") {
        // One machine, one board after another: tell the page which step it is at.
        const u = units.find((x) => x.id === selId);
        if (u) {
          const tm = t - t0;
          u.update(tm, true, t);
          const steps = cb.current.shares;
          if (steps?.length) {
            const frac = (tm % u.cycle) / u.cycle;
            let i = 0, sum = steps[0];
            while (i < steps.length - 1 && frac >= sum) sum += steps[++i];
            if (i !== lastStep) {
              lastStep = i;
              cb.current.onStep?.(i);
            }
          }
        }
        controls.update();
      } else if (view === "walk") {
        for (const u of units) u.update(t, true, t);
        walk(dt);
      } else {
        for (const u of units) u.update(running && !still ? t : 0, running && !still, t);
        controls.update();
      }
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
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      floor.dispose();
      mark.geometry.dispose();
      mark.material.dispose();
      lights.dispose();
      line.dispose();
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
  const hold = (k: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      api.current?.move(k, true);
    },
    onPointerUp: () => api.current?.move(k, false),
    onPointerCancel: () => api.current?.move(k, false),
    onLostPointerCapture: () => api.current?.move(k, false),
  });
  return (
    <div className="relative h-full w-full">
      <div ref={host} className={mode === "walk" ? "absolute inset-0 cursor-grab touch-none active:cursor-grabbing" : "absolute inset-0"} aria-hidden />
      <div ref={labels} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden />
      {mode === "walk" ? (
        <div role="group" aria-label="Walk" className="absolute bottom-3 left-3 grid grid-cols-3 gap-1">
          {PAD.map(({ k, label, Icon, cls }) => (
            <button key={k} type="button" aria-label={label} title={label} {...hold(k)} className={`${cls} grid size-11 touch-none place-items-center rounded-md border bg-card text-foreground outline-none select-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring active:bg-foreground active:text-background`}>
              <Icon className="size-5" aria-hidden />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
