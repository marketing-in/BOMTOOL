import { PrismaClient, type Lifecycle, type Msl, type Prisma, type SupplierKind } from "@prisma/client";
import { hash } from "bcryptjs";
import { MOCK_FX, convert, type PriceBreak } from "../src/lib/currency";
import { normaliseManufacturerKey, normaliseMpn } from "../src/lib/normalise";
import { parseSiValue } from "../src/lib/units";
import { autoMap } from "../src/lib/bom/columns";
import { ingestRevision, loadAliasIndex, loadCatalog } from "../src/server/bom-pipeline";
import { syncKnowledge } from "../src/server/knowledge-sync";
import { syncVendors } from "../src/server/vendors-sync";
import { saveGerbers, savePlacementsFromFile } from "../src/server/board";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { CATEGORY_TREE, type SeedCategory } from "./seed-data/categories";
import { MANUFACTURERS } from "./seed-data/manufacturers";
import { PACKAGES } from "./seed-data/packages";
import { PARAMETERS } from "./seed-data/parameters";
import { PARTS, HSN_BY_CATEGORY, type SeedPart } from "./seed-data/parts";
import { SUPPLIERS, WAREHOUSES, type SeedSupplier } from "./seed-data/suppliers";
import { LINES } from "./seed-data/factory";
import { HSN_DUTY_RATES } from "../src/data/hsn-duty";
import { BOMS, CUSTOMERS, USERS, bomToRows } from "./seed-data/boms";
import { createRng, type Rng } from "../src/lib/rng";

const db = new PrismaClient();
const rng = createRng("ems-seed-v1");
const NOW = new Date("2026-10-20T06:00:00Z");
const DAY = 86_400_000;

const ROHS_EXEMPT = new Set(["V275LA20AP", "MOV-14D471K", "3296W-1-103LF"]);
const REACH_SVHC = new Set(["V275LA20AP", "3296W-1-103LF"]);
const FLOOR_LIFE_HOURS: Partial<Record<Msl, number>> = { MSL_2A: 672, MSL_3: 168, MSL_4: 72, MSL_5: 48, MSL_5A: 24, MSL_6: 6 };

/** Manually curated alternates: [from, to, type, confidence, note]. */
const MANUAL_ALTERNATES: [string, string, "DROP_IN" | "PIN_TO_PIN" | "FUNCTIONAL" | "UPGRADE", number, string][] = [
  ["STM32F103C8T6", "GD32F103C8T6", "PIN_TO_PIN", 75, "Pin-compatible clone; check errata, flash wait states and USB clocking before release."],
  ["AMS1117-3.3", "LM1117IMPX-3.3/NOPB", "PIN_TO_PIN", 85, "Same SOT-223 pinout; LM1117 is 800 mA vs 1 A — confirm load current."],
  ["MPU-6050", "ICM-42688-P", "UPGRADE", 60, "Recommended replacement for obsolete MPU-6050. LGA-14 footprint and new register map — PCB + firmware change."],
  ["CH340G", "FT232RL-REEL", "FUNCTIONAL", 55, "Different footprint and driver; FT232RL has integrated oscillator."],
  ["SN65HVD230DR", "TJA1051T/3,118", "FUNCTIONAL", 60, "TJA1051 needs 5 V VCC (3.3 V VIO); adds CAN FD."],
  ["MMBT3904LT1G", "BC847C,215", "PIN_TO_PIN", 80, "Both SOT-23 NPN; BC847C has lower Ic (100 mA)."],
  ["MP2307DN-LF-Z", "TPS54331DR", "FUNCTIONAL", 55, "Last-time-buy replacement; different pinout and compensation network."],
  ["LM2596S-5.0/NOPB", "TPS54331DR", "FUNCTIONAL", 50, "Modern synchronous-free buck; layout change required."],
  ["10118194-0001LF", "USB4105-GF-A", "UPGRADE", 40, "Micro-USB → USB-C migration; footprint and CC resistors needed."],
  ["FGH40N60SMD", "IKW40N120H3", "UPGRADE", 55, "Higher-voltage TO-247 IGBT; check gate charge and switching losses."],
  ["EPM240T100C5N", "10M08SAE144C8G", "FUNCTIONAL", 40, "MAX II → MAX 10 migration; new package and toolchain project."],
  ["2N7002", "BSS138", "PIN_TO_PIN", 75, "Both SOT-23 N-ch logic-level; BSS138 is 50 V."],
  ["LM358DR", "MCP6002T-I/SN", "FUNCTIONAL", 60, "Rail-to-rail but max 6 V supply — check rails."],
  ["B3F-1000", "PTS645SM43SMTR92 LFS", "FUNCTIONAL", 50, "THT → SMD tactile switch; footprint change."],
];

async function truncateAll() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (!tables.length) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
}

function round(n: number, dp = 6) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function dateCode(yearFrom: number, yearTo: number, r: Rng) {
  const yy = r.int(yearFrom, yearTo) % 100;
  return `${String(yy).padStart(2, "0")}${String(r.int(1, 52)).padStart(2, "0")}`;
}

function packagingFor(part: SeedPart): { packaging: string; spq: number } {
  const pkg = part.pkg ?? "";
  if (part.mount === "CABLE") return { packaging: "Bulk", spq: 1 };
  if (part.mount === "CHASSIS") return { packaging: "Bulk", spq: part.cat === "fastener" ? 100 : 1 };
  if (part.mount === "THT") return { packaging: pkg.startsWith("TO-") ? "Tube" : "Bulk", spq: pkg.startsWith("TO-") ? 50 : 500 };
  if (["0201"].includes(pkg)) return { packaging: "Tape & Reel", spq: 15000 };
  if (["0402"].includes(pkg)) return { packaging: "Tape & Reel", spq: 10000 };
  if (["0603", "0805", "1206", "SOD-882"].includes(pkg)) return { packaging: "Tape & Reel", spq: 4000 };
  if (pkg.startsWith("SOT") || pkg.startsWith("SOD") || pkg.startsWith("SM")) return { packaging: "Tape & Reel", spq: 3000 };
  if (/BGA|QFP|TQFP|LQFP|EQFP/.test(pkg)) return { packaging: "Tray", spq: /BGA/.test(pkg) ? 160 : 250 };
  if (pkg === "Module") return { packaging: "Tape & Reel", spq: 650 };
  if (!pkg) return { packaging: "Tape & Reel", spq: 1000 };
  return { packaging: "Tape & Reel", spq: 2500 };
}

function priceBreaks(unitAt1k: number): PriceBreak[] {
  const cheap = unitAt1k < 0.05;
  const steps: [number, number][] = cheap
    ? [[1, 8], [10, 4], [100, 1.8], [1000, 1], [4000, 0.7]]
    : [[1, 1.6], [10, 1.35], [100, 1.15], [1000, 1], [5000, 0.92]];
  return steps.map(([qty, mult]) => ({ qty, price: round(unitAt1k * mult, unitAt1k < 1 ? 5 : 3) }));
}

function baseStock(part: SeedPart): number {
  if (part.usd < 0.01) return rng.int(80_000, 2_500_000);
  if (part.usd < 0.1) return rng.int(10_000, 400_000);
  if (part.usd < 1) return rng.int(1_000, 60_000);
  if (part.usd < 5) return rng.int(200, 12_000);
  return rng.int(20, 2_500);
}

function lifecycleStockFactor(lc: Lifecycle): number {
  switch (lc) {
    case "OBSOLETE":
      return 0.01;
    case "EOL":
      return 0.08;
    case "LAST_TIME_BUY":
      return 0.25;
    case "NRND":
      return 0.6;
    default:
      return 1;
  }
}

function offersForPart(part: SeedPart, partId: string, suppliers: { id: string; s: SeedSupplier }[]): Prisma.OfferCreateManyInput[] {
  const lc = part.lc ?? "ACTIVE";
  const { packaging, spq } = packagingFor(part);
  const offers: Prisma.OfferCreateManyInput[] = [];
  for (const { id, s } of suppliers) {
    if (s.coverage === 0) continue;
    let coverage = s.coverage;
    if (s.kind === "BROKER") {
      // Brokers chase hard-to-find and high-demand parts.
      if (lc !== "ACTIVE") coverage = 0.85;
      else if ((part.cf ?? 1) >= 4) coverage = 0.5;
    } else if (lc === "OBSOLETE") coverage *= 0.1;
    else if (lc === "EOL") coverage *= 0.4;
    if (!rng.chance(coverage)) continue;

    const isBroker = s.kind === "BROKER";
    const scarcity = isBroker && lc !== "ACTIVE" ? rng.between(1.5, 3.5) : 1;
    const usd = part.usd * s.priceFactor * scarcity * rng.between(0.93, 1.08);
    const unit = round(convert(usd, "USD", s.currency, MOCK_FX), 6);
    const outOfStock = !isBroker && rng.chance(lc === "ACTIVE" ? 0.12 : 0.45);
    const stock = outOfStock ? 0 : Math.round(baseStock(part) * s.depth * lifecycleStockFactor(isBroker ? "ACTIVE" : lc) * rng.between(0.4, 1.4));
    const moq = isBroker ? rng.pick([1, 10, 100, spq]) : s.code === "ARROW" && rng.chance(0.5) ? spq : 1;

    offers.push({
      partId,
      supplierId: id,
      sku: `${s.code}-${normaliseMpn(part.mpn)}`,
      packaging: isBroker ? rng.pick(["Tape & Reel", "Cut Tape", "Bulk"]) : packaging,
      stock,
      moq,
      spq,
      currency: s.currency,
      priceBreaks: priceBreaks(unit),
      factoryLeadTimeWeeks: lc === "OBSOLETE" ? null : Math.max(1, (part.lt ?? 12) + rng.int(-2, 4)),
      condition: isBroker ? rng.pick(["NEW_FACTORY_SEALED", "NEW_OPEN_REEL", "NEW_PARTIAL", "REFURBISHED"] as const) : "NEW_FACTORY_SEALED",
      dateCode: isBroker ? dateCode(2018, 2023, rng) : dateCode(2025, 2026, rng),
      cocAvailable: isBroker ? rng.chance(0.2) : true,
      source: "mock",
      fetchedAt: new Date(NOW.getTime() - rng.int(1, 48) * 3_600_000),
    });
  }
  return offers;
}

function flattenCategories(nodes: SeedCategory[], parentSlug: string | null = null): (SeedCategory & { parentSlug: string | null; order: number })[] {
  return nodes.flatMap((n, i) => [{ ...n, parentSlug, order: i }, ...flattenCategories(n.children ?? [], n.slug)]);
}

async function main() {
  // Container start-up seeds only a fresh database; `npm run db:seed` always wipes and re-seeds.
  if (process.env.SEED_ONLY_IF_EMPTY === "1" && (await db.part.count()) > 0) {
    console.log("Database already has data — skipping seed.");
    return;
  }
  console.time("seed");
  await truncateAll();

  // ── Users
  const password = process.env.SEED_USER_PASSWORD || "ChangeMe!2026";
  const passwordHash = await hash(password, 10);
  const users = await Promise.all(
    USERS.map((u) => db.user.create({ data: { email: u.email, name: u.name, role: u.role, passwordHash } })),
  );
  const admin = users.find((u) => u.role === "ADMIN")!;

  // ── Manufacturers + aliases
  const mfrId = new Map<string, string>();
  const mfrMeta = new Map(MANUFACTURERS.map((m) => [m.name, m]));
  const usedAliasKeys = new Set<string>();
  for (const m of MANUFACTURERS) {
    const aliasKeys = [m.name, ...(m.shortName ? [m.shortName] : []), ...m.aliases]
      .map(normaliseManufacturerKey)
      .filter((k) => k && !usedAliasKeys.has(k));
    aliasKeys.forEach((k) => usedAliasKeys.add(k));
    const created = await db.manufacturer.create({
      data: {
        name: m.name,
        shortName: m.shortName,
        website: m.website,
        country: m.country,
        brandTier: m.tier,
        aliases: { create: [...new Set(aliasKeys)].map((alias) => ({ alias })) },
      },
    });
    mfrId.set(m.name, created.id);
  }

  // ── Categories
  const catId = new Map<string, string>();
  for (const c of flattenCategories(CATEGORY_TREE)) {
    const created = await db.category.create({
      data: {
        slug: c.slug,
        name: c.name,
        sortOrder: c.order,
        attritionPct: c.attritionPct,
        parentId: c.parentSlug ? catId.get(c.parentSlug) : null,
      },
    });
    catId.set(c.slug, created.id);
  }

  // ── Parameters & packages
  const paramMeta = new Map(PARAMETERS.map((p) => [p.key, p]));
  const paramId = new Map<string, string>();
  for (const p of PARAMETERS) {
    const created = await db.parameter.create({
      data: { key: p.key, name: p.name, unit: p.unit, dataType: p.dataType ?? "number", isCritical: p.critical ?? false },
    });
    paramId.set(p.key, created.id);
  }
  const pkgId = new Map<string, string>();
  for (const p of PACKAGES) {
    const created = await db.package.create({
      data: {
        name: p.name,
        family: p.family,
        mountType: p.mount ?? "SMD",
        pinCount: p.pins,
        pitchMm: p.pitch,
        lengthMm: p.size?.[0],
        widthMm: p.size?.[1],
        heightMm: p.size?.[2],
        attritionPct: p.attrition ?? 1,
        ipc7351Name: p.ipc,
      },
    });
    pkgId.set(p.name, created.id);
  }

  // ── Parts
  const partId = new Map<string, string>(); // mpn → id
  const partByMpn = new Map(PARTS.map((p) => [p.mpn, p]));
  const partParams: Prisma.PartParameterCreateManyInput[] = [];
  for (const p of PARTS) {
    const manufacturerId = mfrId.get(p.mfr);
    const categoryId = catId.get(p.cat);
    if (!manufacturerId) throw new Error(`Unknown manufacturer "${p.mfr}" for ${p.mpn}`);
    if (!categoryId) throw new Error(`Unknown category "${p.cat}" for ${p.mpn}`);
    if (p.pkg && !pkgId.has(p.pkg)) throw new Error(`Unknown package "${p.pkg}" for ${p.mpn}`);
    const meta = mfrMeta.get(p.mfr)!;
    const pkgMount = PACKAGES.find((x) => x.name === p.pkg)?.mount;
    const created = await db.part.create({
      data: {
        mpn: p.mpn,
        mpnNormalised: normaliseMpn(p.mpn),
        manufacturerId,
        categoryId,
        packageId: p.pkg ? pkgId.get(p.pkg) : null,
        description: p.desc,
        lifecycle: p.lc ?? "ACTIVE",
        lifecycleUpdatedAt: p.lc && p.lc !== "ACTIVE" ? new Date(NOW.getTime() - rng.int(20, 400) * DAY) : null,
        introducedYear: p.intro,
        rohs: ROHS_EXEMPT.has(p.mpn) ? "COMPLIANT_WITH_EXEMPTION" : (p.rohs ?? "COMPLIANT"),
        reach: REACH_SVHC.has(p.mpn) ? "CONTAINS_SVHC" : (p.reach ?? "COMPLIANT"),
        conflictMineralsDeclared: meta.tier >= 4,
        hsnCode: p.hsn ?? HSN_BY_CATEGORY[p.cat],
        eccn: p.eccn ?? "EAR99",
        countryOfOrigin: meta.coo,
        msl: p.msl,
        mountType: p.mount ?? pkgMount ?? "SMD",
        mfrLeadTimeWeeks: p.lt,
        counterfeitRisk: p.cf ?? 1,
      },
    });
    partId.set(p.mpn, created.id);
    for (const [key, valueText] of Object.entries(p.params)) {
      const pid = paramId.get(key);
      if (!pid) throw new Error(`Unknown parameter "${key}" on ${p.mpn}`);
      const numeric = (paramMeta.get(key)?.dataType ?? "number") === "number";
      partParams.push({ partId: created.id, parameterId: pid, valueText, valueNum: numeric ? parseSiValue(valueText) : null });
    }
  }
  await db.partParameter.createMany({ data: partParams });

  // ── Alternates: automatic drop-ins (same category + package + all critical params) + curated list
  const altRows = new Map<string, Prisma.AlternateCreateManyInput>();
  const addAlt = (from: string, to: string, type: Prisma.AlternateCreateManyInput["type"], confidence: number, notes?: string) => {
    const a = partId.get(from);
    const b = partId.get(to);
    if (!a || !b || a === b) throw new Error(`Bad alternate ${from} → ${to}`);
    altRows.set(`${a}|${b}`, { partId: a, altPartId: b, type, confidence, notes, approvedBy: notes ? "engineering@ems.local" : null, approvedAt: notes ? NOW : null });
  };
  const groups = new Map<string, string[]>();
  for (const p of PARTS) {
    const critical = Object.entries(p.params)
      .filter(([k]) => paramMeta.get(k)?.critical)
      .sort(([a], [b]) => a.localeCompare(b));
    if (!critical.length || !p.pkg) continue;
    const key = `${p.cat}|${p.pkg}|${critical.map(([k, v]) => `${k}=${v}`).join(";")}`;
    groups.set(key, [...(groups.get(key) ?? []), p.mpn]);
  }
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    for (const a of members) for (const b of members) if (a !== b) addAlt(a, b, "DROP_IN", 95);
  }
  for (const [from, to, type, conf, note] of MANUAL_ALTERNATES) {
    addAlt(from, to, type, conf, note);
    if (type !== "UPGRADE") addAlt(to, from, type, conf, note);
  }
  await db.alternate.createMany({ data: [...altRows.values()] });

  // ── Indicative customs duty table (editable later; confirm with the customs broker)
  await db.hsnDutyRate.createMany({
    data: HSN_DUTY_RATES.map((r) => ({ prefix: r.prefix, description: r.description, bcdPct: r.bcdPct, swsPct: r.swsPct ?? 10, igstPct: r.igstPct ?? 18, note: r.note })),
  });

  // ── Suppliers
  const supplierRows: { id: string; s: SeedSupplier }[] = [];
  const supplierByCode = new Map<string, string>();
  for (const s of SUPPLIERS) {
    const created = await db.supplier.create({
      data: {
        code: s.code,
        name: s.name,
        kind: s.kind,
        country: s.country,
        currency: s.currency,
        adapter: s.adapter,
        isAuthorised: s.authorised,
        freightPct: s.freightPct,
        website: s.website,
      },
    });
    supplierRows.push({ id: created.id, s });
    supplierByCode.set(s.code, created.id);
  }

  // ── Offers + price history
  const offers: Prisma.OfferCreateManyInput[] = [];
  const history: Prisma.PriceHistoryCreateManyInput[] = [];
  const digikeyId = supplierByCode.get("DIGIKEY")!;
  for (const p of PARTS) {
    const id = partId.get(p.mpn)!;
    offers.push(...offersForPart(p, id, supplierRows));
    // 13 weekly points; non-active parts drift upward, passives slightly volatile.
    const lc = p.lc ?? "ACTIVE";
    const drift = lc === "ACTIVE" ? 0 : lc === "NRND" ? 0.01 : 0.035;
    let price = p.usd * rng.between(0.88, 0.98);
    for (let w = 12; w >= 0; w--) {
      price = price * (1 + drift + rng.between(-0.025, 0.03));
      history.push({
        partId: id,
        supplierId: digikeyId,
        unitPrice: round(price, 6),
        currency: "USD",
        refQty: 1000,
        stock: Math.round(baseStock(p) * lifecycleStockFactor(lc)),
        recordedAt: new Date(NOW.getTime() - w * 7 * DAY),
      });
    }
  }
  await db.offer.createMany({ data: offers });
  await db.priceHistory.createMany({ data: history });

  // ── Customers / projects / BoMs (raw rows only — lines are produced by the upload pipeline below)
  const customerId = new Map<string, string>();
  for (const c of CUSTOMERS) {
    const created = await db.customer.create({ data: c });
    customerId.set(c.code, created.id);
  }
  const revisionIds: { projectId: string; revisionId: string; buildQty: number; code: string }[] = [];
  for (const b of BOMS) {
    const project = await db.project.create({
      data: { ...b.project, customerId: customerId.get(b.customer)!, boardSpec: b.project.boardSpec as Prisma.InputJsonValue },
    });
    const bom = await db.bom.create({ data: { projectId: project.id, name: b.name, assemblyPartNumber: b.assemblyPartNumber } });
    const rows = bomToRows(b);
    const revision = await db.bomRevision.create({
      data: {
        bomId: bom.id,
        revision: b.revision,
        status: "MAPPED",
        sourceFileName: `${b.assemblyPartNumber}_rev${b.revision}.csv`,
        rawRows: rows,
        headerRow: 0,
        columnMapping: autoMap(rows[0]).mapping,
        buildQty: b.buildQty,
        uploadedById: users.find((u) => u.role === "ENGINEERING")!.id,
      },
    });
    revisionIds.push({ projectId: project.id, revisionId: revision.id, buildQty: b.buildQty, code: b.project.code });
  }

  // ── Warehouses + inventory (internal stock first in the waterfall)
  const whMain = await db.warehouse.create({ data: WAREHOUSES[0] });
  const whDry = await db.warehouse.create({ data: WAREHOUSES[1] });
  const lots: Prisma.InventoryLotCreateManyInput[] = [];
  let reelSeq = 100000;
  for (const p of PARTS) {
    if (!rng.chance(0.55)) continue;
    const id = partId.get(p.mpn)!;
    const needsDry = p.msl && !["MSL_1"].includes(p.msl);
    const { spq } = packagingFor(p);
    const nLots = rng.int(1, p.usd < 0.1 ? 3 : 2);
    for (let l = 0; l < nLots; l++) {
      const opened = needsDry && rng.chance(0.3);
      const total = p.msl ? FLOOR_LIFE_HOURS[p.msl] : undefined;
      const qty = p.usd < 0.1 ? rng.int(Math.round(spq * 0.1), spq * 3) : rng.int(5, Math.max(10, Math.round(400 / Math.max(p.usd, 0.2))));
      lots.push({
        partId: id,
        warehouseId: needsDry ? whDry.id : whMain.id,
        bin: `${needsDry ? "D" : rng.pick(["A", "B", "C"])}-${String(rng.int(1, 12)).padStart(2, "0")}-${String(rng.int(1, 30)).padStart(2, "0")}`,
        lotCode: `L${dateCode(2024, 2026, rng)}-${rng.int(100, 999)}`,
        reelId: p.mount === "SMD" || !p.mount ? `R${reelSeq++}` : null,
        qty,
        reservedQty: rng.chance(0.3) ? Math.round(qty * rng.between(0.1, 0.6)) : 0,
        dateCode: dateCode(2023, 2026, rng),
        condition: rng.chance(0.75) ? "NEW_FACTORY_SEALED" : "NEW_OPEN_REEL",
        msl: p.msl,
        mslOpenedAt: opened ? new Date(NOW.getTime() - rng.int(2, 120) * 3_600_000) : null,
        floorLifeHoursLeft: opened && total ? Math.max(0, round(total - rng.between(2, total * 0.9), 1)) : null,
        unitCost: round(convert(p.usd * rng.between(0.85, 1.05), "USD", "INR"), 4),
        currency: "INR",
        cocOnFile: rng.chance(0.85),
        countryOfOrigin: mfrMeta.get(p.mfr)!.coo,
        receivedAt: new Date(NOW.getTime() - rng.int(5, 500) * DAY),
      });
    }
  }
  // Consigned stock from Kinetic Drives for their MC-48V BoM.
  const kinetic = BOMS.find((b) => b.customer === "KINETIC")!;
  for (const line of kinetic.lines.slice(0, 8)) {
    const sp = PARTS.find((p) => p.mpn === line.mpn);
    if (!sp) continue;
    lots.push({
      partId: partId.get(sp.mpn)!,
      warehouseId: whMain.id,
      bin: `CONS-KD-${String(rng.int(1, 20)).padStart(2, "0")}`,
      lotCode: `KD-${dateCode(2025, 2026, rng)}`,
      qty: line.qty * rng.int(40, 140),
      dateCode: dateCode(2025, 2026, rng),
      condition: "NEW_FACTORY_SEALED",
      msl: sp.msl,
      isConsigned: true,
      customerId: customerId.get("KINETIC"),
      currency: "INR",
      cocOnFile: true,
      countryOfOrigin: mfrMeta.get(sp.mfr)!.coo,
      receivedAt: new Date(NOW.getTime() - rng.int(5, 60) * DAY),
    });
  }
  await db.inventoryLot.createMany({ data: lots });

  // ── Excess pool (own + partners) — biased toward hard-to-find parts
  const excess: Prisma.ExcessListingCreateManyInput[] = [];
  const excessSuppliers: { code: string; kind: SupplierKind }[] = [
    { code: "OWN-EXCESS", kind: "OWN_EXCESS" },
    { code: "PX-PUNE-EMS", kind: "PARTNER_EXCESS" },
    { code: "PX-BLR-OEM", kind: "PARTNER_EXCESS" },
  ];
  for (const p of PARTS) {
    const hard = p.lc && p.lc !== "ACTIVE";
    if (!rng.chance(hard ? 0.8 : 0.1)) continue;
    const s = rng.pick(excessSuppliers);
    const factor = SUPPLIERS.find((x) => x.code === s.code)!.priceFactor;
    excess.push({
      partId: partId.get(p.mpn)!,
      supplierId: supplierByCode.get(s.code)!,
      qty: p.usd < 0.1 ? rng.int(2_000, 40_000) : rng.int(20, 1_500),
      askPrice: round(convert(p.usd * factor * (hard ? 1.6 : 1), "USD", "INR"), 4),
      currency: "INR",
      dateCode: dateCode(2021, 2025, rng),
      condition: rng.pick(["NEW_FACTORY_SEALED", "NEW_OPEN_REEL", "NEW_PARTIAL"] as const),
      cocAvailable: s.kind === "OWN_EXCESS" ? true : rng.chance(0.5),
      location: s.code === "PX-PUNE-EMS" ? "Pune, MH" : s.code === "PX-BLR-OEM" ? "Bengaluru, KA" : "Main stores",
      acceptsBids: true,
      expiresAt: new Date(NOW.getTime() + rng.int(15, 120) * DAY),
    });
  }
  await db.excessListing.createMany({ data: excess });

  // ── Lines + machines
  const lineId = new Map<string, string>();
  for (const [i, l] of LINES.entries()) {
    const created = await db.line.create({
      data: {
        code: l.code,
        name: l.name,
        type: l.type,
        description: l.description,
        capability: l.capability as Prisma.InputJsonValue,
        capacityCph: l.capacityCph,
        feederSlots: l.feederSlots,
        shiftsPerDay: l.shiftsPerDay,
        sortOrder: i,
        machines: {
          create: l.machines.map((m, pos) => ({
            type: m.type,
            vendor: m.vendor,
            model: m.model,
            position: pos + 1,
            specs: m.specs as Prisma.InputJsonValue | undefined,
          })),
        },
      },
    });
    lineId.set(l.code, created.id);
  }

  // ── Work orders
  const wo = [
    { code: "GW-200", line: "L2", status: "IN_PROGRESS" as const, start: -2, days: 4, ctb: 100 },
    { code: "MC-48V", line: "L1", status: "KITTING" as const, start: 3, days: 2, ctb: 82 },
    { code: "LD-60", line: "L3", status: "PLANNED" as const, start: 7, days: 1, ctb: 64 },
  ];
  // Sample history: finished lots with their real start and finish, so line fit can compare (labelled sample data).
  const done = [
    { code: "MC-48V", line: "L1", start: -30, hours: 30 },
    { code: "GW-200", line: "L2", start: -21, hours: 52 },
    { code: "LD-60", line: "L2", start: -12, hours: 20 },
  ];
  for (const [i, w] of done.entries()) {
    const r = revisionIds.find((x) => x.code === w.code)!;
    const startedAt = new Date(NOW.getTime() + w.start * DAY);
    await db.workOrder.create({
      data: {
        number: `WO-2026-${String(90 + i).padStart(4, "0")}`,
        projectId: r.projectId,
        bomRevisionId: r.revisionId,
        lineId: lineId.get(w.line),
        buildQty: r.buildQty,
        status: "DONE",
        clearToBuildPct: 100,
        plannedStart: startedAt,
        plannedEnd: new Date(startedAt.getTime() + w.hours * 3_600_000),
        startedAt,
        finishedAt: new Date(startedAt.getTime() + w.hours * 3_600_000),
        notes: "Sample history (seed data)",
      },
    });
  }
  for (const [i, w] of wo.entries()) {
    const r = revisionIds.find((x) => x.code === w.code)!;
    await db.workOrder.create({
      data: {
        number: `WO-2026-${String(i + 1).padStart(4, "0")}`,
        projectId: r.projectId,
        bomRevisionId: r.revisionId,
        lineId: lineId.get(w.line),
        buildQty: r.buildQty,
        status: w.status,
        clearToBuildPct: w.ctb,
        plannedStart: new Date(NOW.getTime() + w.start * DAY),
        plannedEnd: new Date(NOW.getTime() + (w.start + w.days) * DAY),
        startedAt: w.status === "IN_PROGRESS" ? new Date(NOW.getTime() + w.start * DAY) : null,
      },
    });
  }

  // ── Run the sample BoMs through the same scrub → match → score pipeline as an upload
  const catalog = await loadCatalog(db);
  const aliases = await loadAliasIndex(db);
  for (const r of revisionIds) await ingestRevision(db, r.revisionId, { catalog, aliases });

  // ── Sample board for the 3D viewer: GW-200 Gerbers + centroid (scripts/generate-sample-board.ts)
  const boardDir = path.resolve(__dirname, "../samples/board/GW-200");
  const gw = revisionIds.find((r) => r.code === "GW-200");
  if (gw && existsSync(boardDir)) {
    const names = readdirSync(boardDir);
    const gerbers = names.filter((n) => !/PickPlace/i.test(n)).map((n) => ({ name: n, text: readFileSync(path.join(boardDir, n), "utf8") }));
    await saveGerbers(db, gw.revisionId, gerbers);
    const centroid = names.find((n) => /PickPlace/i.test(n));
    if (centroid) await savePlacementsFromFile(db, gw.revisionId, centroid, new Uint8Array(readFileSync(path.join(boardDir, centroid))));
  }

  // ── Knowledge base (versioned content from src/knowledge)
  const knowledge = await syncKnowledge(db);

  // ── Channel partners, PCB fabs and box makers (Phase 10 sample vendors)
  await syncVendors(db, { mockOffers: true });

  await db.auditLog.create({
    data: { userId: admin.id, action: "seed.run", entity: "System", data: { parts: PARTS.length, offers: offers.length, lots: lots.length } },
  });

  console.timeEnd("seed");
  console.log(
    `Seeded ${users.length} users, ${MANUFACTURERS.length} manufacturers, ${PACKAGES.length} packages, ${PARTS.length} parts, ` +
      `${altRows.size} alternates, ${offers.length} offers, ${history.length} price points, ${lots.length} lots, ` +
      `${excess.length} excess listings, ${LINES.length} lines, ${BOMS.length} BoMs, ${knowledge.total} knowledge articles.`,
  );
  if (partByMpn.size !== PARTS.length) console.warn("Duplicate MPNs in seed data!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
