"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Print / save as PDF" }: { label?: string }) {
  return (
    <Button variant="outline" className="h-10" onClick={() => window.print()}>
      <Printer className="size-4" /> {label}
    </Button>
  );
}
