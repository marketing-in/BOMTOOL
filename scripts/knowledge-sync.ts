/** Applies new/updated knowledge articles from src/knowledge to the database without touching other data. */
import { db } from "../src/lib/db";
import { syncKnowledge, syncManufacturers } from "../src/server/knowledge-sync";

syncKnowledge(db)
  .then((r) => console.log(`knowledge: ${r.created} created, ${r.updated} updated, ${r.total} in source`))
  .then(() => syncManufacturers(db))
  .then((r) => console.log(`makers: ${r.created} created, ${r.aliases} aliases added, ${r.total} in source`))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
