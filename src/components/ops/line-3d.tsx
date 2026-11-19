"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildLine, cameraPosition, fitScale, lightLine, tagPoint, type Machine3D, type ViewMode } from "./line-scene";

export type { Machine3D, ViewMode } from "./line-scene";

/**
 * The line in 3D, numbered in flow order: every machine we have a real model of drawn as that machine
 * (src/components/ops/machine-3d), the rest as circuitflow's generic ones (see line-scene.ts). Click a machine to
 * select it. In 3D drag to turn the view; in 2D it is the floor plan from above. Machines run (heads moving, the
 * tower green) when the line has open work, unless the viewer prefers reduced motion.
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

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    const controls = new OrbitControls(camera, renderer.domElement);
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
      const scale = fitScale(view, size, w, h);
      Object.assign(camera, { left: (-w * scale) / 2, right: (w * scale) / 2, top: (h * scale) / 2, bottom: (-h * scale) / 2 });
      camera.updateProjectionMatrix();
    };
    const setMode = (m: ViewMode) => {
      view = m;
      camera.zoom = 1;
      // The plan reads cleaner without cast shadows.
      lights.sun.castShadow = m === "3d";
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
      camera.position.copy(cameraPosition(m, center, length));
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
        // Real machines stand shoulder to shoulder: their mark shows in front and behind, not between them.
        mark.scale.set(u.w + (u.real ? 0.06 : 0.3), u.z1 - u.z0 + (u.real ? 0.4 : 0.6), 1);
        mark.position.set(u.x, 0.004, (u.z0 + u.z1) / 2);
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
        t.textContent = String(u.m.position ?? "");
        return t;
      }),
    );
    const tagAt = new THREE.Vector3();
    const placeTags = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      units.forEach((u, i) => {
        tagPoint(u, view, root.position.x, tagAt).project(camera);
        const t = tags.children[i] as HTMLElement;
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
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const id = hitAt(e);
      if (id) pick.current(id);
    };
    const onMove = (e: PointerEvent) => {
      renderer.domElement.style.cursor = hitAt(e) ? "pointer" : "";
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointermove", onMove);

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clock = new THREE.Clock();
    let raf = 0;
    const frame = () => {
      const t = clock.getElapsedTime();
      for (const u of units) u.update(running && !still ? t : 0, running && !still, t);
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
  return (
    <div className="relative h-full w-full" aria-hidden>
      <div ref={host} className="absolute inset-0" />
      <div ref={labels} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  );
}
