/**
 * Deep analysis from the command line — what the ems-part-analysis skill runs.
 *   npm run analyse -- part LM358DR        one part: availability by tier, risk factors, price trend, alternates
 *   npm run analyse -- bom GW-200          a BoM (revision id, project code or BoM name → latest revision):
 *                                          verdict, readiness, actions, riskiest lines, cost
 *   add --json for machine-readable output
 * Reads the database only — no distributor calls, no writes.
 */
import { db } from "../src/lib/db";
import { formatMoneyCompact } from "../src/lib/currency";
import { ensureFx } from "../src/server/fx";
import { getDeepAnalysis } from "../src/server/deep-analysis";
import { partReport } from "../src/server/part-report";

async function findRevision(query: string) {
  const byId = await db.bomRevision.findUnique({ where: { id: query }, select: { id: true } });
  if (byId) return byId.id;
  const rev = await db.bomRevision.findFirst({
    where: { OR: [{ bom: { name: { contains: query, mode: "insensitive" } } }, { bom: { project: { code: { equals: query, mode: "insensitive" } } } }, { bom: { project: { name: { contains: query, mode: "insensitive" } } } }] },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return rev?.id ?? null;
}

const money = (v: number) => formatMoneyCompact(Math.round(v), "INR");

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const [cmd, ...rest] = args.filter((a) => a !== "--json");
  const query = rest.join(" ").trim();
  if (!query || (cmd !== "part" && cmd !== "bom")) {
    console.error('usage: npm run analyse -- part <MPN> | bom <revision id | project code | BoM name> [--json]');
    process.exitCode = 1;
    return;
  }
  await ensureFx();

  if (cmd === "part") {
    const r = await partReport(query);
    if (!r) {
      console.error(`No part ${query} in the catalogue. Search the market from the Parts directory to add it.`);
      process.exitCode = 1;
      return;
    }
    if (json) return console.log(JSON.stringify(r, null, 2));
    const { part: p, availability: a, risk } = r;
    console.log(`${p.mpn} — ${p.manufacturer} · ${p.category}${p.package ? ` · ${p.package}` : ""}\n${p.description}`);
    console.log(`Lifecycle ${p.lifecycle} · RoHS ${p.rohs} · REACH ${p.reach}${p.msl ? ` · ${p.msl}` : ""}${p.datasheet ? `\nDatasheet ${p.datasheet}` : ""}`);
    console.log(`\nAvailability (in sourcing order)`);
    console.log(`  1 Our stock     ${a.ours.reduce((t, l) => t + l.free, 0)} free in ${a.ours.length} lot(s)`);
    for (const s of a.suppliers) console.log(`  2 ${s.seller.padEnd(14)} ${String(s.stock).padStart(8)} · MOQ ${s.moq} · ${s.unitAt1kInr === null ? "no price" : `₹${s.unitAt1kInr} @1k`}${s.leadWeeks !== null ? ` · ${s.leadWeeks} wk` : ""}${s.simulated ? " · simulated" : ""}`);
    for (const e of a.marketplace.excess) console.log(`  3 ${e.seller.padEnd(14)} ${String(e.qty).padStart(8)} excess${e.askInr !== null ? ` · ask ₹${e.askInr}` : ""}${e.acceptsBids ? " · open to bids" : ""}`);
    const brokers = [...a.marketplace.brokers].sort((x, y) => y.stock - x.stock);
    for (const b of brokers.slice(0, 6)) console.log(`  3 ${b.seller.padEnd(14)} ${String(b.stock).padStart(8)} broker — inspect before use`);
    if (brokers.length > 6) console.log(`    +${brokers.length - 6} more brokers (--json lists them all)`);
    console.log(`\nRisk ${risk.score}/100 (${risk.level}) for ${risk.assumedNeed} pcs — ${risk.summary}`);
    for (const f of risk.factors) console.log(`  ${String(f.score).padStart(3)} ${f.label.padEnd(12)} ${f.reason}${f.action ? `\n      → ${f.action}` : ""}`);
    console.log(`\nPrice trend (90 days): ${r.priceTrendPct90d === null ? "not enough history" : `${r.priceTrendPct90d > 0 ? "+" : ""}${r.priceTrendPct90d.toFixed(1)}%`}`);
    console.log(`Alternates: ${r.alternates.length ? r.alternates.map((x) => `${x.mpn} (${x.type.toLowerCase().replace(/_/g, " ")})`).join(", ") : "none approved"}`);
    return;
  }

  const id = await findRevision(query);
  if (!id) {
    console.error(`No BoM matches "${query}".`);
    process.exitCode = 1;
    return;
  }
  const res = await getDeepAnalysis(id, "INR");
  if (!res) return;
  const { report: r, data } = res;
  if (json) return console.log(JSON.stringify({ revisionId: id, title: data.title, product: data.product, ...r }, null, 2));
  console.log(`${data.title}${data.product ? ` — ${data.product.name}` : ""}  (revision ${id})`);
  console.log(`\n${r.verdict.title.toUpperCase()}: ${r.verdict.detail}`);
  console.log(`Matched ${r.matched}/${r.counted} · from our stock ${r.coverage.ours} · distributors ${r.coverage.suppliers} · marketplace ${r.coverage.market} · not coverable ${r.coverage.none}`);
  console.log(`Risk mix: ${r.distribution.green} low · ${r.distribution.amber} watch · ${r.distribution.red} high · ${r.distribution.grey} not assessed`);
  console.log(`Still to buy ${money(r.toBuyTotal)} landed · parts cost ${money(r.spendTotal)}${r.longestLead ? ` · longest factory lead ${r.longestLead.weeks} wk (${r.longestLead.label})` : ""}`);
  console.log(`\nWhat to do first`);
  r.actions.forEach((a, i) => {
    console.log(`  ${i + 1}. [${a.level}] ${a.title}${a.value > 0 ? ` — ${money(a.value)} to buy` : ""}\n     ${a.detail}${a.lines.length ? `\n     ${a.lines.map((l) => l.label).join(", ")}` : ""}`);
  });
  console.log(`\nRiskiest lines`);
  for (const t of r.topRisks) console.log(`  ${String(t.line.risk?.score ?? "—").padStart(3)} ${`${t.line.mpn} (${t.line.refDes})`.padEnd(36)} ${t.factor.label}: ${t.factor.reason}`);
  console.log(`\nWhere the money goes`);
  for (const p of r.pareto) console.log(`  ${money(p.value).padStart(10)}  ${String(Math.round(p.cumulative * 100)).padStart(3)}%  ${p.label}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
