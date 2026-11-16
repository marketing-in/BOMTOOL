"use client";

import dynamic from "next/dynamic";
import type { Currency } from "@/lib/currency";
import type { PriceSeries } from "./price-history-chart";

// Recharts is the biggest script on the part page: fetch it after the page is up, not with it. The chart sizes
// itself in the browser anyway, so rendering it on the server adds nothing.
const Chart = dynamic(() => import("./price-history-chart").then((m) => m.PriceHistoryChart), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-md bg-muted/60" aria-hidden />,
});

export function PriceHistoryChartLoader({ series, currency }: { series: PriceSeries[]; currency: Currency }) {
  return <Chart series={series} currency={currency} />;
}
