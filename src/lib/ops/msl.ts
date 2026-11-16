import type { Msl } from "@prisma/client";

/** J-STD-033 floor life at ≤ 30 °C / 60 % RH, hours. null = unlimited. MSL 6 = bake before use. */
export const FLOOR_LIFE_HOURS: Record<Msl, number | null> = {
  MSL_1: null,
  MSL_2: 365 * 24,
  MSL_2A: 4 * 7 * 24,
  MSL_3: 168,
  MSL_4: 72,
  MSL_5: 48,
  MSL_5A: 24,
  MSL_6: 0,
};

export const MSL_LABEL: Record<Msl, string> = {
  MSL_1: "MSL 1",
  MSL_2: "MSL 2",
  MSL_2A: "MSL 2a",
  MSL_3: "MSL 3",
  MSL_4: "MSL 4",
  MSL_5: "MSL 5",
  MSL_5A: "MSL 5a",
  MSL_6: "MSL 6",
};

export type MslClock = {
  msl: Msl | null;
  /** When the bag was last opened (clock running). null = sealed or in dry storage. */
  openedAt: Date | null;
  /** Floor life remaining when the clock last stopped. null = full (fresh/baked). */
  hoursLeft: number | null;
};

export type MslState = { tracked: boolean; running: boolean; hoursLeft: number | null; expired: boolean; level: "green" | "amber" | "red" | "grey" };

/** Remaining floor life now. Unlimited (MSL 1 / no MSL) is "not tracked". */
export function mslState(c: MslClock, now = new Date()): MslState {
  if (!c.msl) return { tracked: false, running: false, hoursLeft: null, expired: false, level: "grey" };
  const total = FLOOR_LIFE_HOURS[c.msl];
  if (total === null) return { tracked: false, running: false, hoursLeft: null, expired: false, level: "grey" };
  const base = c.hoursLeft ?? total;
  const used = c.openedAt ? (now.getTime() - c.openedAt.getTime()) / 3_600_000 : 0;
  const left = Math.max(0, base - used);
  const expired = c.msl === "MSL_6" ? true : left <= 0;
  const level = expired ? "red" : left < 24 ? "red" : left < total * 0.25 ? "amber" : "green";
  return { tracked: true, running: !!c.openedAt, hoursLeft: Math.round(left * 10) / 10, expired, level };
}

/** Opening a sealed bag / taking a lot out of the dry cabinet starts the clock. */
export function openBag(c: MslClock, now = new Date()): MslClock {
  if (c.openedAt) return c;
  return { ...c, openedAt: now };
}

/**
 * Closing into a dry cabinet (< 5 % RH) or dry bag stops the clock and keeps the remaining hours
 * (J-STD-033 allows pausing; full reset needs a bake or long dry storage).
 */
export function closeBag(c: MslClock, now = new Date()): MslClock {
  if (!c.openedAt) return c;
  const s = mslState(c, now);
  return { ...c, openedAt: null, hoursLeft: s.hoursLeft };
}

/** Bake resets the floor life to full. */
export function bake(c: MslClock): MslClock {
  return { ...c, openedAt: null, hoursLeft: null };
}

export function formatHours(h: number | null): string {
  if (h === null) return "—";
  if (h >= 48) return `${Math.floor(h / 24)} d ${Math.round(h % 24)} h`;
  return `${Math.floor(h)} h ${Math.round((h % 1) * 60)} min`;
}
