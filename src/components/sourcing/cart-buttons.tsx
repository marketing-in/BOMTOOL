"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Gavel, Loader2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { addBomShortagesToCart, addItemsToCart } from "@/app/(app)/sourcing/actions";
import type { CartAdd } from "@/server/procurement";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function cartToast(message: string) {
  toast.success(message, { action: { label: "Open cart", onClick: () => (window.location.href = "/sourcing/cart") } });
}

export function AddShortagesButton({ revisionId, label = "Add all shortages to cart", variant = "outline", tall = variant === "default" }: { revisionId: string; label?: string; variant?: "outline" | "default"; tall?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant={variant}
      size={tall ? "default" : "sm"}
      className={tall ? "h-10" : "h-8"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await addBomShortagesToCart(revisionId);
          if (res?.error) toast.error(res.error);
          else cartToast(res?.message ?? "Added");
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <ShoppingCart className="size-4" />}
      {label}
    </Button>
  );
}

export function AddToCartButton({ item, label }: { item: CartAdd; label?: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant={label ? "outline" : "ghost"}
      size={label ? "sm" : "icon"}
      className={label ? "h-8" : "size-8"}
      aria-label={label ?? "Add to cart"}
      title={label ? undefined : `Add ${item.qty.toLocaleString("en-IN")} to cart`}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await addItemsToCart([item]);
          if (res?.error) toast.error(res.error);
          else cartToast(res?.message ?? "Added");
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <ShoppingCart className="size-4" />}
      {label}
    </Button>
  );
}

/** Bid on an excess-pool listing: target unit price goes on the RFQ to that partner. */
export function BidButton({ item, askPrice, currency }: { item: CartAdd; askPrice: number | null; currency: string }) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(askPrice ? String(Math.round(askPrice * 0.85 * 10000) / 10000) : "");
  const [pending, start] = useTransition();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Bid on excess" title="Bid on excess stock">
          <Gavel className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(price);
            if (!Number.isFinite(n) || n <= 0) return toast.error("Enter a unit price");
            start(async () => {
              const res = await addItemsToCart([{ ...item, isBid: true, bidPrice: n, currency }]);
              if (res?.error) toast.error(res.error);
              else {
                setOpen(false);
                cartToast("Bid added to your cart — it goes out with the RFQ");
              }
            });
          }}
        >
          <div className="text-sm font-medium">Bid on excess</div>
          <div className="text-xs text-muted-foreground">
            {item.qty.toLocaleString("en-IN")} pcs · asking {askPrice ? `${askPrice.toFixed(4)} ${currency}` : "—"}
          </div>
          <label className="block text-xs">
            Your unit price ({currency})
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="num mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" autoFocus />
          </label>
          <Button type="submit" size="sm" className="h-9 w-full" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Add bid to cart
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function CartLink({ count }: { count: number }) {
  return (
    <Link href="/sourcing/cart" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ShoppingCart className="size-4" /> Cart{count ? <span className="num">({count})</span> : null}
    </Link>
  );
}
