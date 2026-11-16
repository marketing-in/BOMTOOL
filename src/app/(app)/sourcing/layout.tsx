import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { SourcingTabs } from "@/components/sourcing/tabs";

export default async function SourcingLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [cartItems, openRfqs, draftPos] = await Promise.all([
    db.cartItem.count({ where: { cart: { userId: user.id, status: "OPEN" } } }),
    db.rfq.count({ where: { status: { in: ["DRAFT", "SENT", "PARTIALLY_QUOTED", "QUOTED"] } } }),
    db.purchaseOrderDraft.count({ where: { status: { in: ["DRAFT", "PENDING_APPROVAL"] } } }),
  ]);
  return (
    <>
      <SourcingTabs counts={{ cart: cartItems, rfqs: openRfqs, pos: draftPos }} />
      {children}
    </>
  );
}
