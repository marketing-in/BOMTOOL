"use client";

import { useState } from "react";
import Link from "next/link";
import { Columns3, FileText, GitCompare, MoreHorizontal, Trash2, Upload } from "lucide-react";
import type { RevisionImpact } from "@/lib/bom/delete";
import { DeleteRevisionDialog } from "./delete-controls";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** The less-used things you do to a BoM, kept out of the header so the main actions read at a glance. */
export function BomMoreMenu({ revisionId, bomId, canCompare, impact }: { revisionId: string; bomId: string; canCompare: boolean; impact?: RevisionImpact | null }) {
  const [deleting, setDeleting] = useState(false);
  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-10">
          <MoreHorizontal className="size-4" aria-hidden /> More
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link href={`/boms/${revisionId}/quote`}><FileText className="size-4" aria-hidden /> Material quote</Link>
        </DropdownMenuItem>
        {canCompare ? (
          <DropdownMenuItem asChild>
            <Link href={`/boms/${revisionId}/diff`}><GitCompare className="size-4" aria-hidden /> Compare revisions</Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/boms/${revisionId}/map`}><Columns3 className="size-4" aria-hidden /> Remap columns</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/boms/new?bom=${bomId}`}><Upload className="size-4" aria-hidden /> New revision</Link>
        </DropdownMenuItem>
        {impact ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setDeleting(true)} className="text-destructive focus:text-destructive">
              <Trash2 className="size-4 text-destructive" aria-hidden /> {impact.otherRevisions ? "Delete this revision…" : "Delete this BoM…"}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
    {impact ? <DeleteRevisionDialog revisionId={revisionId} impact={impact} open={deleting} onOpenChange={setDeleting} /> : null}
    </>
  );
}
