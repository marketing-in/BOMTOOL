import "server-only";
import { db } from "@/lib/db";
import { normaliseMpn } from "@/lib/normalise";
import { readPartMaster, type MasterRow } from "@/lib/directory/part-master";
import type { BoardTypeLike } from "@/lib/directory/recognise";
import type { BoardCapabilities, BoxCapabilities } from "@/lib/supply-chain";
import boardTypesJson from "@/knowledge/data/board-types.json";
import partMasterJson from "@/knowledge/data/part-master.json";

export type BoardSection = { name: string; purpose: string; parts: { role: string; type: string; value: string; package: string; example: string; qty: string }[] };
export type BoardType = BoardTypeLike & { description: string; examples: string[]; sections: BoardSection[]; checks: string[] };

export const BOARD_TYPES = (boardTypesJson as unknown as { types: BoardType[] }).types;
export const BOARD_CATEGORY: Record<string, string> = { mcu: "Microcontroller", computing: "Computing", power: "Power", motion: "Motion & motor", comms: "Communications", consumer: "Consumer" };

let master: MasterRow[] | null = null;
/** circuitflow's part master, parsed once per server process. */
export function partMaster() {
  master ??= readPartMaster(partMasterJson as Parameters<typeof readPartMaster>[0]);
  return master;
}

export type Supply = { partId: string; mpn: string; ours: number; partners: number; distributors: number; market: number };

/** Our catalogue entry and free stock by tier, for each MPN that is in the catalogue. */
export async function supplyByMpn(mpns: string[]): Promise<Map<string, Supply>> {
  const keys = [...new Set(mpns.map((m) => normaliseMpn(m)))];
  if (!keys.length) return new Map();
  const parts = await db.part.findMany({
    where: { mpnNormalised: { in: keys } },
    select: {
      id: true,
      mpn: true,
      mpnNormalised: true,
      inventoryLots: { select: { qty: true, reservedQty: true } },
      excessListings: { select: { qty: true, supplier: { select: { kind: true } } } },
      offers: { select: { stock: true, supplier: { select: { kind: true } } } },
    },
  });
  return new Map(
    parts.map((p) => [
      p.mpnNormalised,
      {
        partId: p.id,
        mpn: p.mpn,
        ours: p.inventoryLots.reduce((s, l) => s + Math.max(0, l.qty - l.reservedQty), 0),
        partners: p.excessListings.filter((e) => e.supplier.kind === "CHANNEL_PARTNER").reduce((s, e) => s + e.qty, 0),
        distributors: p.offers.filter((o) => o.supplier.kind === "AUTHORISED" || o.supplier.kind === "MANUFACTURER").reduce((s, o) => s + o.stock, 0),
        market: p.excessListings.filter((e) => e.supplier.kind !== "CHANNEL_PARTNER").reduce((s, e) => s + e.qty, 0) + p.offers.filter((o) => o.supplier.kind === "BROKER").reduce((s, o) => s + o.stock, 0),
      },
    ]),
  );
}

/** Active fabricators and box makers with their stated capabilities. */
export async function makers() {
  const rows = await db.supplier.findMany({ where: { active: true, OR: [{ supplies: { has: "pcb-fab" } }, { supplies: { has: "enclosure" } }] }, orderBy: { name: "asc" } });
  const as = <C,>(tag: string) => rows.filter((r) => r.supplies.includes(tag) && r.capabilities).map((r) => ({ id: r.id, code: r.code, name: r.name, country: r.country, capabilities: r.capabilities as unknown as C }));
  return { fabs: as<BoardCapabilities>("pcb-fab"), boxMakers: as<BoxCapabilities>("enclosure") };
}
