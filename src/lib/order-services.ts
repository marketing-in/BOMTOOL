/** Services booked with an order (SoW "manage order": transport, finance, storage, test). Costs in INR. */

export const SERVICE_KINDS = ["transport", "finance", "storage", "test"] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];
export type OrderService = { kind: ServiceKind; detail: string; cost: number };

export const SERVICE_LABEL: Record<ServiceKind, string> = {
  transport: "Transport",
  finance: "Finance",
  storage: "Storage",
  test: "Test / inspection",
};

/** Examples shown as placeholders, per kind. */
export const SERVICE_HINT: Record<ServiceKind, string> = {
  transport: "Air freight via forwarder, door to door",
  finance: "60-day credit, bank charges, LC fee",
  storage: "Bonded warehouse, 30 days",
  test: "X-ray + decap, 5 pcs per lot (broker stock)",
};

/** Reads stored JSON, dropping anything malformed. */
export function readServices(json: unknown): OrderService[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((x) => {
    const s = x as Partial<OrderService>;
    if (!s || !SERVICE_KINDS.includes(s.kind as ServiceKind) || typeof s.cost !== "number" || !Number.isFinite(s.cost) || s.cost < 0) return [];
    return [{ kind: s.kind as ServiceKind, detail: String(s.detail ?? "").slice(0, 200), cost: Math.round(s.cost * 100) / 100 }];
  });
}

export const servicesTotal = (list: OrderService[]) => list.reduce((s, x) => s + x.cost, 0);

/** What a buyer should book for this order: inspection for broker stock, transport for imports. */
export function suggestServices(o: { supplierKind: string; country: string | null }): ServiceKind[] {
  const out: ServiceKind[] = [];
  if (o.country && o.country !== "IN") out.push("transport");
  if (o.supplierKind === "BROKER") out.push("test");
  return out;
}
