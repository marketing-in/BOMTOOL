/**
 * INDICATIVE Indian customs duty by HSN prefix, for estimating landed cost only.
 * Compiled 2026-10 from the ITA-1 schedule and common CHA practice; rates change with each Budget
 * and notification. Confirm with the customs broker / ICEGATE tariff before quoting a customer.
 * Seeded into the editable HsnDutyRate table (longest prefix wins).
 */
export type SeedDutyRate = { prefix: string; description: string; bcdPct: number; swsPct?: number; igstPct?: number; note?: string };

export const DEFAULT_DUTY: SeedDutyRate = {
  prefix: "",
  description: "Unknown HSN — conservative default",
  bcdPct: 10,
  note: "No HSN on the part; using a conservative 10 % BCD.",
};

export const HSN_DUTY_RATES: SeedDutyRate[] = [
  { prefix: "8542", description: "Electronic integrated circuits", bcdPct: 0, note: "ITA-1" },
  { prefix: "8541", description: "Diodes, transistors, LEDs, optocouplers, crystals", bcdPct: 0, note: "ITA-1" },
  { prefix: "8532", description: "Capacitors", bcdPct: 0, note: "ITA-1" },
  { prefix: "8533", description: "Resistors, thermistors, varistors, potentiometers", bcdPct: 0, note: "ITA-1" },
  { prefix: "8504", description: "Inductors, transformers, power supplies", bcdPct: 10, note: "Some 8504.50 inductors qualify for 0 % — verify" },
  { prefix: "8536", description: "Connectors, fuses, relays, terminal blocks (≤ 1000 V)", bcdPct: 10 },
  { prefix: "8535", description: "Switching/protection apparatus > 1000 V", bcdPct: 10 },
  { prefix: "8531", description: "Buzzers and signalling apparatus", bcdPct: 10 },
  { prefix: "8544", description: "Insulated wire and cable", bcdPct: 10 },
  { prefix: "8517", description: "Wireless / communication modules", bcdPct: 20, note: "Check for concessional rate on parts for PCBA manufacture" },
  { prefix: "8534", description: "Bare printed circuit boards", bcdPct: 10 },
  { prefix: "8506", description: "Primary cells and batteries", bcdPct: 20 },
  { prefix: "7616", description: "Aluminium articles (enclosures, heatsinks)", bcdPct: 10 },
  { prefix: "7318", description: "Steel screws, nuts, standoffs", bcdPct: 10 },
  { prefix: "7415", description: "Copper/brass fasteners and standoffs", bcdPct: 10 },
  { prefix: "3926", description: "Plastic articles (enclosures, spacers)", bcdPct: 15 },
];
