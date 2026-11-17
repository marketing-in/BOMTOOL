import { db } from "@/lib/db";
import { getActiveFx } from "@/lib/currency";
import { ensureFx } from "@/server/fx";
import { loadDutyRates } from "@/server/bom-pipeline";
import { PageHeader, Section } from "@/components/data/page-header";
import { LandedCalculator } from "@/components/sourcing/landed-calculator";

export const metadata = { title: "Landed cost" };

export default async function LandedCostPage() {
  await ensureFx();
  const [rates, suppliers] = await Promise.all([
    loadDutyRates(db),
    db.supplier.findMany({ where: { kind: { in: ["AUTHORISED", "MANUFACTURER", "BROKER", "PARTNER_EXCESS"] } }, orderBy: { name: "asc" }, select: { id: true, name: true, country: true, currency: true, freightPct: true } }),
  ]);
  const fx = getActiveFx();
  return (
    <>
      <PageHeader title="Landed cost" />
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <LandedCalculator rates={rates} fx={fx} suppliers={suppliers.map((s) => ({ ...s, freightPct: Number(s.freightPct) }))} />
        <Section title="Duty table (indicative)" action={<span className="text-xs text-muted-foreground" title="The longest matching HSN prefix wins">{rates.length} rows</span>}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-2 font-normal">HSN</th>
                <th className="px-4 py-2 font-normal">Goods</th>
                <th className="px-4 py-2 text-right font-normal">BCD</th>
                <th className="px-4 py-2 text-right font-normal">IGST</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...rates].sort((a, b) => a.prefix.localeCompare(b.prefix)).map((r) => (
                <tr key={r.prefix} title={r.note ?? undefined}>
                  <td className="num px-4 py-2">{r.prefix}</td>
                  <td className="px-4 py-2 text-xs">{r.description}{r.note ? <span className="text-muted-foreground"> · {r.note}</span> : null}</td>
                  <td className="num px-4 py-2 text-right">{r.bcdPct}%</td>
                  <td className="num px-4 py-2 text-right">{r.igstPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">
            SWS = 10 % of BCD. Indicative — confirm with your customs broker. FX: {fx.source}, {fx.asOf}.
          </p>
        </Section>
      </div>
    </>
  );
}
