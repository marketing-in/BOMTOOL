import Link from "next/link";
import { getAlerts } from "@/server/alerts";
import { PageHeader, EmptyState } from "@/components/data/page-header";
import { RiskDot } from "@/components/data/badges";
import { AckButton, AckAllButton } from "@/components/ops/alert-buttons";

export const metadata = { title: "Alerts" };

const KIND_LABEL: Record<string, string> = { MARKET: "Market", SHORTAGE: "Shortage", MSL: "MSL", RFQ_DUE: "RFQ", PO_APPROVAL: "Approval" };

function ago(d: Date) {
  const m = Math.round((Date.now() - d.getTime()) / 60_000);
  return m < 60 ? `${Math.max(1, m)} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}

export default async function AlertsPage() {
  const alerts = await getAlerts();
  const market = alerts.filter((a) => a.eventId);
  return (
    <>
      <PageHeader
        title="Alerts"
        description="Market changes from the price refresh, plus live checks on work orders, moisture-sensitive stock, RFQs and approvals."
        actions={market.length ? <AckAllButton ids={market.map((a) => a.eventId!)} /> : null}
      />
      <div className="overflow-hidden rounded-lg border bg-card">
        {alerts.length ? (
          <ul className="divide-y">
            {alerts.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                <RiskDot level={a.level} />
                <span className="w-20 shrink-0 text-xs text-muted-foreground">{KIND_LABEL[a.kind]}</span>
                <Link href={a.href} className="min-w-0 flex-1 hover:underline">
                  <span className="text-sm font-medium">{a.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{a.detail}</span>
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">{ago(a.at)}</span>
                {a.eventId ? <AckButton id={a.eventId} /> : <span className="w-8" />}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="All clear">Nothing needs attention right now.</EmptyState>
        )}
      </div>
    </>
  );
}
