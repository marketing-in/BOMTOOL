/**
 * Verifies a customer's BoM (and its Gerbers, when given) from the files alone, with the app's own readers — no
 * database, nothing sent anywhere. Prints a Markdown report: the columns as read, every line's findings, the board's
 * silkscreen placements against the BoM, packages against the copper, and the knowledge gaps (maker spellings,
 * package names, distributor prefixes the app does not know yet) to turn into knowledge entries.
 *
 *   npx tsx scripts/verify-bom.ts "<bom.xlsx|.csv>" ["<gerbers.zip|.rar|folder>"] [--out report.md]
 *
 * Used by the bom-verification skill (.claude/skills/bom-verification/SKILL.md). Phase 47.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { readJobPack } from "@/lib/bom/workbook";
import { autoMap } from "@/lib/bom/columns";
import { BOM_FIELD_LABEL } from "@/lib/bom/fields";
import { scrubRows } from "@/lib/bom/scrub";
import { readIssue } from "@/lib/bom/issues";
import { buildAliasIndex, resolveManufacturer } from "@/lib/normalise";
import { expandRefDes } from "@/lib/refdes";
import { signature, copperCheck, describedCheck } from "@/lib/board/footprint-match";
import { checkSupplierPn, DIGIKEY_PREFIX, type Distributor } from "@/knowledge/distributor-pns";
import { bodyForLine } from "@/lib/board/bodies";
import { MANUFACTURERS } from "../prisma/seed-data/manufacturers";

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const out = outAt >= 0 ? args[outAt + 1] : null;
const [bomPath, boardPath] = args.filter((a, i) => !a.startsWith("--") && (outAt < 0 || i !== outAt + 1));
if (!bomPath) {
  console.error('Usage: npx tsx scripts/verify-bom.ts "<bom file>" ["<gerbers zip|rar|folder>"] [--out report.md]');
  process.exit(1);
}

const md: string[] = [];
const say = (s = "") => md.push(s);
const aliases = buildAliasIndex(MANUFACTURERS.map((m) => ({ name: m.name, aliases: [...(m.shortName ? [m.shortName] : []), ...m.aliases] })));

// ── The BoM, read the way the upload reads it
const pack = readJobPack(new Uint8Array(readFileSync(bomPath)), basename(bomPath));
const header = pack.rows[pack.headerRow] ?? [];
const mapping = autoMap(header, pack.rows.slice(pack.headerRow + 1, pack.headerRow + 21)).mapping;
const lines = scrubRows(pack.rows, pack.headerRow, mapping, aliases);
const refs = lines.flatMap((l) => expandRefDes(l.refDes));

say(`# BoM verification — ${basename(bomPath)}`);
say();
say(`Sheet: ${pack.bomSheet ?? "(file)"} · header on row ${pack.headerRow + 1} · ${lines.length} lines · ${refs.length} designators`);
say();
say("## Columns as read");
say();
say("| Column | Read as |");
say("| --- | --- |");
header.forEach((h, i) => say(`| ${h || "(blank)"} | ${mapping[i] ? BOM_FIELD_LABEL[mapping[i]!] : "— not used"} |`));
say();

// ── Every line's findings
type Finding = { level: "red" | "amber"; line: number; refs: string; text: string };
const findings: Finding[] = [];
const RED = new Set(["PACKAGE_CONFLICT", "MPN_VALUE_MISMATCH", "MPN_VOLTAGE_LOW", "MPN_SIZE_MISMATCH", "MISSING_QTY"]);
const sameMaker = (a: string, b: string) => {
  const [x, y] = [resolveManufacturer(a, aliases), resolveManufacturer(b, aliases)];
  return x !== null && x === y;
};
const owners = new Map<string, number>();
for (const l of lines) if (l.supplierName) owners.set(l.supplierName, (owners.get(l.supplierName) ?? 0) + 1);
const column = ([...owners].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null) as Distributor | null;
const carried = lines.some((l) => l.supplierPn);
const unknownMakers = new Set<string>();
const unreadPackages = new Set<string>();
const unknownPrefixes = new Set<string>();

for (const l of lines) {
  const at = { line: l.lineNo, refs: (l.refDes ?? "").slice(0, 40) };
  for (const stored of l.issues) {
    const { code, detail, info } = readIssue(stored);
    if (code === "UNKNOWN_MANUFACTURER") {
      unknownMakers.add(l.rawManufacturer ?? "");
      continue;
    }
    findings.push({ ...at, level: RED.has(code) ? "red" : "amber", text: `${info?.label ?? code}: ${detail ?? info?.help ?? ""}` });
  }
  if (carried && !l.dnp) {
    const f = checkSupplierPn({ pn: l.supplierPn ?? null, distributor: (l.supplierName as Distributor | null) ?? column, mpn: l.mpn, maker: l.rawManufacturer }, sameMaker);
    if (f) findings.push({ ...at, level: f.level, text: `Distributor PN: ${f.text}` });
    const p = l.supplierPn?.trim().toUpperCase() ?? "";
    const prefix = p.match(/^(\d{2,4})-/)?.[1];
    if (prefix && (l.supplierName ?? column) === "Digi-Key" && !DIGIKEY_PREFIX[prefix]) unknownPrefixes.add(`Digi-Key ${prefix}- (${l.rawManufacturer ?? "?"})`);
  }
  // A package the app cannot read from the column or the description, and no body the knowledge table draws.
  if (!l.dnp && l.package && !signature(l.package) && !signature(l.description) && !bodyForLine({ mpn: l.mpn, description: l.description, pkg: l.package, refDes: expandRefDes(l.refDes)[0] })) unreadPackages.add(l.package);
}

async function main() {
  // ── The board, when its Gerbers are given
  let boardDone = false;
  if (boardPath) {
    const { openArchives } = await import("@/lib/board/archive");
    const { sortBoardFiles } = await import("@/lib/board/upload");
    const { renderGerbers } = await import("@/server/board");
    const { placeFromLayers } = await import("@/lib/board/place-from-silk");
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
    const paths = statSync(boardPath).isDirectory() ? walk(boardPath) : [boardPath];
    const files = await openArchives(paths.map((p) => ({ name: basename(p), bytes: new Uint8Array(readFileSync(p)) })));
    const { gerbers } = sortBoardFiles(files);
    const { artwork } = await renderGerbers(gerbers, { maskColor: "green", finish: "ENIG" });
    const layers = artwork.layers.filter((l) => l.side !== "inner");
    const placed = placeFromLayers(
      layers,
      lines.map((l) => ({ refDes: l.refDes, mpn: l.mpn, description: l.description, pkg: l.package, dnp: l.dnp })),
    );
    const lineOf = new Map(lines.flatMap((l) => expandRefDes(l.refDes).map((r) => [r.toUpperCase(), l] as const)));
    say("## Board");
    say();
    say(`${gerbers.length} Gerber / drill files · ${placed.footprints} footprints on the copper · ${placed.labels} designators read off the silkscreen`);
    say(`Placed from the silkscreen: **${placed.placements.length} of ${refs.length}** BoM designators.`);
    if (placed.report.missing.length) say(`In the BoM, not found on the board: ${placed.report.missing.join(", ")}`);
    if (placed.report.extra.length) say(`On the board, not in the BoM: ${placed.report.extra.map((e) => e.refDes).join(", ")}`);
    say();
    for (const p of placed.placements) {
      const l = lineOf.get(p.refDes.toUpperCase());
      if (!l) continue;
      const note = copperCheck({ pkg: l.package, catalogPkg: null, mpn: l.mpn, catalogConfirmed: true }, p.copper) ?? describedCheck({ pkg: l.package, catalogPkg: null, description: l.description, mpn: l.mpn }, p.copper);
      if (note) findings.push({ level: note.level === "mismatch" ? "red" : "amber", line: l.lineNo, refs: p.refDes, text: `Copper: ${note.text}` });
    }
    for (const r of placed.report.missing) findings.push({ level: "amber", line: lineOf.get(r.toUpperCase())?.lineNo ?? 0, refs: r, text: "Board: designator not found on the silkscreen" });
    boardDone = true;
  }

  // ── The report
  const sorted = findings.sort((a, b) => (a.level === b.level ? a.line - b.line : a.level === "red" ? -1 : 1));
  say("## Findings");
  say();
  say(`**${sorted.filter((f) => f.level === "red").length} red** · **${sorted.filter((f) => f.level === "amber").length} amber**${boardDone ? "" : " · no Gerbers given: board checks not run"}`);
  say();
  if (sorted.length) {
    say("| Level | Line | Designators | Finding |");
    say("| --- | --- | --- | --- |");
    for (const f of sorted) say(`| ${f.level} | ${f.line || ""} | ${f.refs} | ${f.text.replace(/\|/g, "/")} |`);
  } else say("Nothing found.");
  say();
  say("## Knowledge gaps");
  say();
  say(`- Maker names not recognised: ${unknownMakers.size ? [...unknownMakers].join("; ") : "none"}`);
  say(`- Package names nothing reads (no package, no body): ${unreadPackages.size ? [...unreadPackages].join("; ") : "none"}`);
  say(`- Distributor prefixes not in src/knowledge/distributor-pns.ts: ${unknownPrefixes.size ? [...unknownPrefixes].join("; ") : "none"}`);
  say(`- Lines with no package from the column or the description: ${lines.filter((l) => !l.dnp && !signature(l.package) && !signature(l.description)).map((l) => l.lineNo).join(", ") || "none"}`);

  const text = md.join("\n");
  if (out) writeFileSync(out, text + "\n");
  console.log(text);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
