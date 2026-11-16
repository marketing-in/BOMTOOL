/** Adds the sample vendors (channel partners, PCB fabs, box makers), partner stock lists and the catalogue enclosures without touching other data. */
import { db } from "../src/lib/db";
import { syncVendors } from "../src/server/vendors-sync";

syncVendors(db)
  .then((r) => console.log(`vendors: ${r.vendors} upserted, ${r.listings} partner listings added, ${r.enclosures} catalogue enclosures added`))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
