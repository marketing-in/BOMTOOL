import { ENCLOSURE_FINISHES, ENCLOSURE_MATERIALS } from "@/knowledge/enclosure-materials";
import { cn } from "@/lib/utils";

const tone = (v: string) => (v === "good" ? "text-risk-green" : v === "poor" || v === "none" ? "text-risk-red" : "text-risk-amber");

export function MaterialTable() {
  const families = [...new Set(ENCLOSURE_MATERIALS.map((m) => m.family))];
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[1150px] text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="px-4 py-2 font-normal">Material</th>
            <th className="px-3 py-2 text-right font-normal">Density g/cm³</th>
            <th className="px-3 py-2 text-right font-normal">Max °C</th>
            <th className="px-3 py-2 font-normal">Flammability</th>
            <th className="px-3 py-2 font-normal">UV</th>
            <th className="px-3 py-2 font-normal">Chemicals</th>
            <th className="px-3 py-2 font-normal">Shielding</th>
            <th className="px-3 py-2 font-normal">k W/m·K</th>
            <th className="px-3 py-2 text-right font-normal">Cost</th>
            <th className="px-4 py-2 font-normal">Made by · used for</th>
          </tr>
        </thead>
        {families.map((fam) => (
          <tbody key={fam} className="divide-y border-t">
            <tr>
              <th colSpan={10} scope="colgroup" className="bg-muted/40 px-4 py-1.5 text-left text-xs font-medium">{fam}</th>
            </tr>
            {ENCLOSURE_MATERIALS.filter((m) => m.family === fam).map((m) => (
              <tr key={m.slug}>
                <td className="px-4 py-2.5 font-medium">{m.name}</td>
                <td className="num px-3 py-2.5 text-right">{m.density}</td>
                <td className="num px-3 py-2.5 text-right">{m.maxTempC}</td>
                <td className="px-3 py-2.5 text-xs">{m.flammability}</td>
                <td className={cn("px-3 py-2.5 text-xs", tone(m.uv))}>{m.uv}</td>
                <td className={cn("px-3 py-2.5 text-xs", tone(m.chemical))}>{m.chemical}</td>
                <td className={cn("px-3 py-2.5 text-xs", tone(m.shielding))}>{m.shielding}</td>
                <td className="num px-3 py-2.5 text-xs">{m.k}</td>
                <td className="num px-3 py-2.5 text-right">×{m.cost}</td>
                <td className="max-w-96 px-4 py-2.5 text-xs">
                  {m.processes.join(" · ")}
                  <span className="block text-muted-foreground">{m.uses.join(", ")} — {m.notes}</span>
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

export function EnclosureFinishList() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {ENCLOSURE_FINISHES.map((x) => (
        <li key={x.slug} className="rounded-xl border bg-card p-4 text-sm">
          <span className="block font-medium">{x.name}</span>
          <span className="block text-xs text-muted-foreground">On {x.on} · {x.conductive ? "conductive (keeps EMC bonding)" : "insulating"}</span>
          <span className="mt-1 block">{x.detail}</span>
        </li>
      ))}
    </ul>
  );
}
