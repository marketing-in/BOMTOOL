/**
 * Puts the plant in prisma/seed-data/factory.ts (our lines and their machines, from the machine sheets) into the
 * database without touching anything else: each line is matched by its code (L1, L2…) and updated in place, so its
 * work orders and history stay with it; its machines are replaced by the list in the file. Lines in the database but
 * not in the file are left alone.
 *
 *   npm run plant:sync
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { LINES } from "../prisma/seed-data/factory";

async function main() {
  const db = new PrismaClient();
  try {
    for (const [i, l] of LINES.entries()) {
      const data = {
        name: l.name,
        type: l.type,
        description: l.description,
        capability: l.capability as Prisma.InputJsonValue,
        capacityCph: l.capacityCph ?? null,
        feederSlots: l.feederSlots ?? null,
        shiftsPerDay: l.shiftsPerDay,
      };
      await db.$transaction(async (tx) => {
        const line = await tx.line.upsert({ where: { code: l.code }, update: data, create: { code: l.code, sortOrder: i, ...data } });
        await tx.machine.deleteMany({ where: { lineId: line.id } });
        await tx.machine.createMany({
          data: l.machines.map((m, pos) => ({ lineId: line.id, type: m.type, vendor: m.vendor, model: m.model, position: pos + 1, specs: m.specs as Prisma.InputJsonValue | undefined })),
        });
      });
      console.log(`${l.code}  ${l.name}: ${l.machines.length} machines`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
