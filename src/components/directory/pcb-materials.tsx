import { Check, Minus } from "lucide-react";
import { BOARD_FEATURES, FINISHES, LAMINATES } from "@/knowledge/pcb-materials";

const yes = (v: boolean, label: string) => (v ? <Check className="mx-auto size-4 text-risk-green" aria-label={`${label}: yes`} /> : <Minus className="mx-auto size-4 text-muted-foreground" aria-label={`${label}: no`} />);

export function LaminateTable() {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[1100px] text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="px-4 py-2 font-normal">Laminate</th>
            <th className="px-3 py-2 text-right font-normal" title="Glass transition temperature">Tg °C</th>
            <th className="px-3 py-2 text-right font-normal" title="Decomposition temperature (5 % weight loss)">Td °C</th>
            <th className="px-3 py-2 font-normal" title="Dielectric constant, ~1–10 GHz">Dk</th>
            <th className="px-3 py-2 font-normal" title="Dissipation factor (loss)">Df</th>
            <th className="px-3 py-2 font-normal" title="Z-axis expansion 50–260 °C">Z-expansion</th>
            <th className="px-3 py-2 font-normal" title="Thermal conductivity">k W/m·K</th>
            <th className="px-3 py-2 text-right font-normal" title="Relative cost, standard FR-4 = 1">Cost</th>
            <th className="px-4 py-2 font-normal">Used for · examples</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {LAMINATES.map((l) => (
            <tr key={l.slug}>
              <td className="px-4 py-2.5">
                <span className="font-medium">{l.name}</span>
                <span className="block text-xs text-muted-foreground">{l.family}</span>
              </td>
              <td className="num px-3 py-2.5 text-right">{l.tg ?? "—"}</td>
              <td className="num px-3 py-2.5 text-right">{l.td ?? "—"}</td>
              <td className="num px-3 py-2.5 text-xs">{l.dk}</td>
              <td className="num px-3 py-2.5 text-xs">{l.df}</td>
              <td className="num px-3 py-2.5 text-xs">{l.zExpansion}</td>
              <td className="num px-3 py-2.5 text-xs">{l.k}</td>
              <td className="num px-3 py-2.5 text-right">×{l.cost}</td>
              <td className="max-w-96 px-4 py-2.5 text-xs">
                {l.uses.join(" · ")}
                <span className="block text-muted-foreground">{l.examples.join(", ")} — {l.notes}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FinishTable() {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[1000px] text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="px-4 py-2 font-normal">Surface finish</th>
            <th className="px-3 py-2 font-normal">Thickness</th>
            <th className="px-3 py-2 font-normal">Flatness</th>
            <th className="px-3 py-2 text-right font-normal">Shelf life</th>
            <th className="px-3 py-2 text-center font-normal">RoHS</th>
            <th className="px-3 py-2 text-center font-normal">Wire bond</th>
            <th className="px-3 py-2 text-center font-normal">Contacts</th>
            <th className="px-3 py-2 text-right font-normal">Cost</th>
            <th className="px-4 py-2 font-normal">Best for · watch out</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {FINISHES.map((x) => (
            <tr key={x.slug}>
              <td className="px-4 py-2.5 font-medium">{x.name}</td>
              <td className="num px-3 py-2.5 text-xs">{x.thickness}</td>
              <td className="px-3 py-2.5 text-xs">{x.flatness}</td>
              <td className="num px-3 py-2.5 text-right">{x.shelfLifeMonths} mo</td>
              <td className="px-3 py-2.5">{yes(x.rohs, "RoHS")}</td>
              <td className="px-3 py-2.5">{yes(x.wireBond, "Wire bond")}</td>
              <td className="px-3 py-2.5">{yes(x.contacts, "Contacts")}</td>
              <td className="num px-3 py-2.5 text-right">×{x.cost}</td>
              <td className="max-w-96 px-4 py-2.5 text-xs">
                {x.best}
                <span className="block text-risk-amber">{x.watch}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FeatureList() {
  const groups = [...new Set(BOARD_FEATURES.map((x) => x.group))];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {groups.map((g) => (
        <section key={g} className="rounded-xl border bg-card" aria-label={g}>
          <h2 className="border-b px-4 py-3 text-base font-semibold">{g}</h2>
          <ul className="divide-y">
            {BOARD_FEATURES.filter((x) => x.group === g).map((x) => (
              <li key={x.slug} className="flex gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{x.name}</span>
                  <span className="block text-xs text-muted-foreground">{x.detail}</span>
                </span>
                <span className="num shrink-0 text-xs text-muted-foreground">{x.cost}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
