/**
 * Sourcing CLI.
 *   npm run sourcing -- status            adapters, keys, mock mode, today's usage
 *   npm run sourcing -- refresh hot       refresh parts on BoMs / carts / RFQs
 *   npm run sourcing -- refresh full      refresh the whole catalogue
 *   npm run sourcing -- refresh LM358DR …  refresh specific MPNs
 *   npm run sourcing -- fx                fetch live FX (needs FX_API_URL)
 *   npm run sourcing -- purge-mock        delete mock offers once real adapters are live
 */
import { db } from "../src/lib/db";
import { normaliseMpn } from "../src/lib/normalise";
import { ALL_ADAPTERS, adapterStatus, mockEnabled } from "../src/server/sourcing";
import { runJob } from "../src/server/jobs";

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === "status" || !cmd) {
    console.log(`mock market: ${mockEnabled() ? "ON" : "off"} (SOURCING_MOCK=${process.env.SOURCING_MOCK ?? "auto"})`);
    for (const a of ALL_ADAPTERS) {
      const s = await adapterStatus(a);
      console.log(`${a.key.padEnd(8)} ${a.configured() ? "configured" : `missing ${a.envVars.join(", ")}`} · ${s.callsToday}/${a.dailyLimit} calls today${s.lastError ? ` · last error: ${s.lastError}` : ""}`);
    }
  } else if (cmd === "refresh") {
    let run;
    if (args[0] === "hot" || args[0] === "full") run = await runJob(`refresh.${args[0]}`, "manual");
    else {
      const parts = await db.part.findMany({ where: { mpnNormalised: { in: args.map(normaliseMpn) } }, select: { id: true } });
      run = await runJob("refresh.parts", "manual", { partIds: parts.map((p) => p.id) });
    }
    console.log(run.status, run.error ?? "", JSON.stringify(run.stats, null, 1));
  } else if (cmd === "fx") {
    const run = await runJob("fx.refresh", "manual");
    console.log(run.status, run.error ?? "", JSON.stringify(run.stats));
  } else if (cmd === "purge-mock") {
    const { count } = await db.offer.deleteMany({ where: { source: "mock" } });
    console.log(`deleted ${count} mock offers`);
  } else {
    console.error(`unknown command ${cmd}`);
    process.exitCode = 1;
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
