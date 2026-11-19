"use client";

/**
 * Light / dark with motion, shared by the top-bar switch and the account menu.
 *
 * - The wave of light: a View Transition freezes a picture of the old page; the new theme is painted on <html> inside
 *   the transition (next-themes paints in an effect, too late for the picture) and saved to localStorage at once.
 *   The new page is revealed inside a growing front with a rippled, liquid edge (clip-path polygons on
 *   ::view-transition-new(root), from src/lib/theme-wave.ts). The light on it — a glowing band, a bright crest on the
 *   edge, two faint echoes behind — is three more transition layers above both pictures: empty full-screen elements
 *   whose layers are filled with light by CSS and cut to rings by clip-path animations made from the same outline.
 *   Every one of these is a web animation on the same clock, run by the compositor, so the light stays on the front
 *   even while the page is busy (a heavy page restyling for the new theme, a slow tablet).
 *   next-themes is told the choice (setTheme) when the wave ends: its own change would add two whole-page restyles
 *   to the start of the wave, for a look that is already painted.
 * - Taps during the wave: the browser sends every tap to <html> while a transition shows, so a tap would be lost.
 *   A tap on the switch flips the theme again (the wave under way finishes at once and the next one starts); a tap
 *   anywhere else finishes the wave at once and is handed on to whatever is under it.
 * - The switch: its knob, track and sun / moon animate with the Web Animations API whenever the page flips, from any
 *   cause (switch, menu, the OS while on "system", another tab). Web animations are untouched by the
 *   `transition: none` that next-themes and the wave put on everything during the flip.
 * - No View Transitions or reduced motion: the theme changes at once (and with reduced motion nothing moves).
 */
import { useCallback } from "react";
import { useTheme } from "next-themes";
import {
  FADE_MS,
  KNOB_EASE_FALLBACK,
  KNOB_MS,
  WAVE_MS,
  centreOf,
  fadeKeyframes,
  fallbackOrigin,
  glowColours,
  lightKeyframes,
  lightLayers,
  resolvesDark,
  springEasing,
  waveKeyframes,
  waveShape,
  type LightLayer,
  type Point,
  type ThemeChoice,
} from "@/lib/theme-wave";

export type { ThemeChoice };

/** Marks the top-bar switch: the wave's origin when the element a choice came from is gone. */
export const THEME_SWITCH_ATTR = "data-theme-switch";
/** The page clip's animation id; the light layers' are `theme-wave:<layer name>` (tests find them by these). */
export const WAVE_ANIMATION_ID = "theme-wave";

const WAVE_CLASS = "theme-wave";
const LAYER_CLASS = "theme-wave-layer";
/** next-themes' localStorage key (its default; the provider in src/app/layout.tsx does not change it). */
const STORAGE_KEY = "theme";

const matches = (query: string) => typeof window !== "undefined" && window.matchMedia(query).matches;
const reducedMotion = () => matches("(prefers-reduced-motion: reduce)");
const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

/** Whether the page is painted dark right now. */
export function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

/** Runs `onChange` whenever <html>'s classes change (useSyncExternalStore's subscribe). */
export function subscribeDark(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** Calls `onFlip(dark)` each time the page actually flips between light and dark, whatever caused it. */
export function watchFlips(onFlip: (dark: boolean) => void): () => void {
  let last = isDark();
  return subscribeDark(() => {
    const now = isDark();
    if (now === last) return;
    last = now;
    onFlip(now);
  });
}

/** What next-themes does in its effect, done at once: the class, and color-scheme for form controls and scrollbars. */
function paint(dark: boolean) {
  const html = document.documentElement;
  html.classList.remove("light", "dark");
  html.classList.add(dark ? "dark" : "light");
  html.style.colorScheme = dark ? "dark" : "light";
}

/** Saves the choice where next-themes reads it, so a reload during the wave keeps it. */
function remember(choice: ThemeChoice) {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Storage blocked (private mode): next-themes is told at the end of the wave anyway.
  }
}

function switchEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${THEME_SWITCH_ATTR}]`);
}

/** The centre of the element the choice came from, else of the switch, else the top-right corner. */
function originOf(from: Element | null | undefined): Point {
  for (const el of [from, switchEl()]) {
    if (!el?.isConnected) continue;
    const box = el.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) return centreOf(box);
  }
  return fallbackOrigin(viewport());
}

type SetTheme = (theme: string) => void;
type Wave = {
  transition: ViewTransition;
  /** What it paints (the latest choice when several land before its picture is taken). */
  target: { choice: ThemeChoice; dark: boolean };
  /** The theme is on the page (the transition's update has run). */
  painted: boolean;
  /** Called off before it painted anything: its update does nothing. */
  cancelled: boolean;
  layers: HTMLElement[];
  persist: SetTheme;
};

/** The wave under way, if any. */
let running: Wave | null = null;

/** The theme the page shows, or is about to show when a wave is starting. */
export function headingDark(): boolean {
  return running && !running.cancelled ? running.target.dark : isDark();
}

/** The light layers: empty, see-through full-screen elements, each its own transition layer (in the new picture only). */
function addLayers(layers: LightLayer[]): HTMLElement[] {
  return layers.map((layer) => {
    const el = document.createElement("div");
    el.className = LAYER_CLASS;
    el.setAttribute("aria-hidden", "true");
    // Inline and important: beats `html.theme-wave * { view-transition-name: none !important }`.
    el.style.setProperty("view-transition-name", layer.name, "important");
    document.body.appendChild(el);
    return el;
  });
}

/** The colours and filters the light layers' CSS reads, set on <html> for the wave. */
const LIGHT_VARS = ["--theme-wave-halo", "--theme-wave-core", "--theme-wave-echo-filter", "--theme-wave-glow-filter", "--theme-wave-crest-filter"];
function setLightVars(layers: LightLayer[], toDark: boolean) {
  const style = document.documentElement.style;
  const { halo, core } = glowColours(toDark);
  style.setProperty("--theme-wave-halo", halo);
  style.setProperty("--theme-wave-core", core);
  for (const layer of layers) style.setProperty(`--${layer.name}-filter`, layer.filter);
}

/** Ends a wave now: the new theme is fully shown and the page takes taps again. */
function finish(wave: Wave) {
  wave.transition.skipTransition();
  for (const el of wave.layers) el.remove();
  wave.layers = [];
}

/**
 * Changes the theme to `choice`, washing the new one over the page from `from` (an element; the switch when omitted
 * or gone); `persist` is next-themes' setTheme. A choice made while a wave runs finishes that wave at once and starts
 * its own, unless it looks the same, which leaves the wave running.
 */
export function changeTheme(choice: ThemeChoice, from: Element | null | undefined, persist: SetTheme) {
  const dark = resolvesDark(choice, matches("(prefers-color-scheme: dark)"));
  const wave = running && !running.cancelled ? running : null;

  if (wave && dark === wave.target.dark) {
    // The look the wave is already bringing (e.g. "dark", then "system" with the system dark): let it run; it saves
    // this choice when it ends.
    wave.target = { choice, dark };
    if (wave.painted) remember(choice);
    return;
  }
  if (wave && !wave.painted) {
    // Back to the look on the page before the wave has changed anything (two taps within a frame): call it off.
    wave.cancelled = true;
    finish(wave);
    persist(choice);
    return;
  }
  // A painted wave is finished at once (its look fully shown); the next one starts from there.
  if (wave) finish(wave);
  if (dark === isDark()) {
    // Same look (e.g. dark → system while the system is dark): nothing to wave.
    persist(choice);
    return;
  }
  // No View Transitions or reduced motion: next-themes paints in its effect with transitions off; the switch still
  // slides unless motion is reduced.
  if (!("startViewTransition" in document) || reducedMotion()) {
    persist(choice);
    return;
  }

  const html = document.documentElement;
  const shape = waveShape(originOf(from), viewport());
  const layers = lightLayers(shape, dark);
  // Worked out before the picture is taken, so nothing delays the first frame of the wave.
  const reveal = waveKeyframes(shape);
  const light = layers.map((layer) => ({ layer, clip: lightKeyframes(shape, layer), fade: fadeKeyframes(layer.peak) }));

  html.classList.add(WAVE_CLASS);
  setLightVars(layers, dark);
  // `transition` is filled in just below; the update callback never runs before that.
  const next = { target: { choice, dark }, painted: false, cancelled: false, layers: [], persist } as Omit<Wave, "transition"> as Wave;
  try {
    next.transition = document.startViewTransition(() => {
      if (next.cancelled) return;
      paint(next.target.dark);
      remember(next.target.choice);
      next.painted = true;
      // Only the live wave brings its light (one called off or replaced before its picture paints nothing more).
      if (running === next) next.layers = addLayers(layers);
    });
  } catch {
    // The browser refused (e.g. the document is not fully active): change it without the wave.
    html.classList.remove(WAVE_CLASS);
    persist(choice);
    return;
  }
  running = next;
  watchTaps();

  next.transition.ready.then(
    () => {
      if (running !== next || !next.layers.length) return;
      const timing = { duration: WAVE_MS, easing: "linear" };
      try {
        html.animate(reveal, { ...timing, pseudoElement: "::view-transition-new(root)" }).id = WAVE_ANIMATION_ID;
        for (const { layer, clip, fade } of light) {
          html.animate(clip, { ...timing, pseudoElement: `::view-transition-new(${layer.name})` }).id = `${WAVE_ANIMATION_ID}:${layer.name}`;
          html.animate(fade, { ...timing, pseudoElement: `::view-transition-image-pair(${layer.name})` });
        }
      } catch {
        // No animatable transition layers here: with nothing animating, the transition ends next frame and the
        // theme simply changes at once.
      }
    },
    () => undefined,
  );
  const done = () => {
    for (const el of next.layers) el.remove();
    next.layers = [];
    if (running !== next) return;
    running = null;
    html.classList.remove(WAVE_CLASS);
    for (const name of LIGHT_VARS) html.style.removeProperty(name);
    if (!next.cancelled) persist(next.target.choice);
  };
  next.transition.finished.then(done, done);
}

/** `changeTheme` bound to next-themes, for the switch and the account menu. */
export function useThemeWave() {
  const { setTheme } = useTheme();
  return useCallback((choice: ThemeChoice, from?: Element | null) => changeTheme(choice, from, setTheme), [setTheme]);
}

/**
 * Taps during a wave. While a transition shows, the browser hit-tests its layers, so every tap lands on <html> (and
 * `pointer-events: none` on them does not change that). On the press: over the switch, flip again; anywhere else,
 * finish the wave (the real page is under the pointer again at once) and give the press to the element there. The
 * click that follows is aimed at <html> too (where the press landed), so it is handed on the same way, or dropped
 * after a flip so the switch does not flip back.
 */
let tap: { x: number; y: number; at: number; flipped: boolean } | null = null;
let watching = false;

function inside(box: DOMRect, x: number, y: number) {
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

function onPress(e: PointerEvent) {
  const wave = running;
  if (!wave || !e.isPrimary || e.button !== 0) return;
  const html = document.documentElement;
  if (e.target !== html) return; // reached its element after all
  tap = { x: e.clientX, y: e.clientY, at: e.timeStamp, flipped: false };
  const sw = switchEl();
  if (sw && inside(sw.getBoundingClientRect(), e.clientX, e.clientY)) {
    tap.flipped = true;
    changeTheme(headingDark() ? "light" : "dark", sw, wave.persist);
    return;
  }
  finish(wave);
  const hit = document.elementFromPoint(e.clientX, e.clientY);
  if (!hit || hit === html) return;
  // Menus and other widgets open on the press itself, so it is passed on as well as the click.
  hit.dispatchEvent(new PointerEvent("pointerdown", e));
  hit.dispatchEvent(new MouseEvent("mousedown", e));
  const field = hit.closest<HTMLElement>("input, textarea, select, [contenteditable=''], [contenteditable='true']");
  field?.focus();
}

function onClick(e: MouseEvent) {
  const t = tap;
  // Clicks from the keyboard (detail 0: Space / Enter on the switch) never came from a press: leave them alone.
  if (!t || e.detail === 0) return;
  tap = null;
  if (e.timeStamp - t.at > 1500) return;
  const html = document.documentElement;
  const onSwitch = e.target instanceof Element && !!e.target.closest(`[${THEME_SWITCH_ATTR}]`);
  if (t.flipped) {
    // The press flipped the theme already; this click must not flip it back.
    if (e.target === html || onSwitch) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    return;
  }
  if (e.target !== html) return;
  const hit = document.elementFromPoint(t.x, t.y);
  if (!hit || hit === html) return;
  e.stopImmediatePropagation();
  hit.dispatchEvent(new MouseEvent("click", e));
}

function watchTaps() {
  if (watching) return;
  watching = true;
  window.addEventListener("pointerdown", onPress, { capture: true });
  window.addEventListener("click", onClick, { capture: true });
}

/** The switch's travel and its two looks, measured once (and again when it is resized) rather than on each flip. */
type SwitchLooks = { travel: number; day: Record<string, Keyframe>; night: Record<string, Keyframe> };
const looks = new WeakMap<HTMLElement, SwitchLooks>();

export function measureSwitch(sw: HTMLElement): SwitchLooks | null {
  const knob = sw.querySelector<HTMLElement>("[data-knob]");
  if (!knob) return null;
  const css = getComputedStyle(sw);
  const v = (name: string) => css.getPropertyValue(name).trim();
  const measured: SwitchLooks = {
    travel: sw.clientWidth - knob.offsetWidth - 2 * knob.offsetLeft,
    day: { knob: { backgroundColor: v("--knob-day"), color: v("--glyph-day") }, track: { backgroundColor: v("--track-day"), borderColor: v("--edge-day") } },
    night: { knob: { backgroundColor: v("--knob-night"), color: v("--glyph-night") }, track: { backgroundColor: v("--track-night"), borderColor: v("--edge-night") } },
  };
  looks.set(sw, measured);
  return measured;
}

let spring: string | null = null;
function knobEasing(): string {
  if (spring === null) {
    const candidate = springEasing();
    spring = typeof CSS !== "undefined" && CSS.supports("animation-timing-function", candidate) ? candidate : KNOB_EASE_FALLBACK;
  }
  return spring;
}

/**
 * Animates the switch from its old state to `dark` (its classes already show the new state; these animations run
 * from the old look to it). A flip during a slide carries on from where the knob is.
 */
export function animateSwitch(sw: HTMLElement, dark: boolean) {
  if (reducedMotion() || typeof sw.animate !== "function") return;
  const knob = sw.querySelector<HTMLElement>("[data-knob]");
  const look = looks.get(sw) ?? measureSwitch(sw);
  if (!knob || !look) return;
  const sun = sw.querySelector<SVGElement>("[data-sun]");
  const moon = sw.querySelector<SVGElement>("[data-moon]");
  const stars = sw.querySelector<HTMLElement>("[data-stars]");

  const { travel } = look;
  const sliding = knob.getAnimations().some((a) => a.playState === "running");
  const at = sliding ? new DOMMatrixReadOnly(getComputedStyle(knob).transform).m41 : dark ? 0 : travel;
  for (const a of sw.getAnimations({ subtree: true })) a.cancel();

  const [from, to] = dark ? [look.day, look.night] : [look.night, look.day];
  const fade = { duration: FADE_MS, easing: "ease-out" };

  knob.animate([{ transform: `translateX(${at}px)` }, { transform: `translateX(${dark ? travel : 0}px)` }], { duration: KNOB_MS, easing: knobEasing() });
  // A little stretch along the way, as if the knob were pulled across.
  knob.animate([{ scale: "1" }, { scale: "1.12 0.92", offset: 0.3 }, { scale: "1" }], { duration: 300, easing: "ease-out" });
  knob.animate([from.knob, to.knob], fade);
  sw.animate([from.track, to.track], fade);

  const [incoming, outgoing] = dark ? [moon, sun] : [sun, moon];
  const turn = dark ? 1 : -1;
  // The old glyph spins away first; the new one spins in just behind it, so the two barely overlap.
  outgoing?.animate(
    [
      { opacity: 1, transform: "rotate(0deg) scale(1)" },
      { opacity: 0, transform: `rotate(${120 * turn}deg) scale(0.4)` },
    ],
    { duration: 150, easing: "ease-in" },
  );
  incoming?.animate(
    [
      { opacity: 0, transform: `rotate(${-120 * turn}deg) scale(0.4)` },
      { opacity: 1, transform: "rotate(0deg) scale(1)" },
    ],
    { duration: FADE_MS - 60, delay: 90, easing: KNOB_EASE_FALLBACK, fill: "backwards" },
  );
  stars?.animate(
    dark
      ? [
          { opacity: 0, transform: "scale(0.3) rotate(-30deg)" },
          { opacity: 1, transform: "scale(1) rotate(0deg)" },
        ]
      : [
          { opacity: 1, transform: "scale(1)" },
          { opacity: 0, transform: "scale(0.3)" },
        ],
    dark ? { duration: FADE_MS, delay: 140, easing: KNOB_EASE_FALLBACK, fill: "backwards" } : { duration: 160, easing: "ease-in" },
  );
}
