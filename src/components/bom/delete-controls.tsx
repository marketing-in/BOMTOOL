"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { deleteBomRevision, removeBomBoardFiles } from "@/app/(app)/boms/delete-actions";
import { deleteQuickLook } from "@/app/(app)/viewer/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { confirmWord, deleteBlocker, impactLines, type RevisionImpact } from "@/lib/bom/delete";

/**
 * Deleting a BoM revision: what goes with it, what blocks it (work orders), and the revision label typed to confirm.
 * Opened from the BoM's More menu.
 */
export function DeleteRevisionDialog({ revisionId, impact, open, onOpenChange }: { revisionId: string; impact: RevisionImpact; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const blocked = deleteBlocker(impact);
  const word = confirmWord(impact);
  const ready = !blocked && typed.trim().toLowerCase() === word.toLowerCase();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setTyped("");
          setError(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {impact.bomName} rev {impact.revision}?</DialogTitle>
          <DialogDescription>This cannot be undone. It deletes:</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {impactLines(impact).map((l) => <li key={l}>{l}</li>)}
        </ul>
        {impact.issuedQuotes ? (
          <p className="flex items-start gap-2 rounded-md border border-risk-amber/40 bg-risk-amber-soft px-3 py-2 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-risk-amber" aria-hidden />
            Quotes already sent to the client are deleted too. Print or save them first if you need a record.
          </p>
        ) : null}
        {blocked ? (
          <p role="alert" className="rounded-md border border-risk-red/30 bg-risk-red-soft px-3 py-2 text-sm">{blocked}</p>
        ) : (
          <label className="block text-sm">
            Type <span className="num rounded bg-muted px-1.5 py-0.5 font-semibold">{word}</span> to confirm
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              aria-label={`Type ${word} to confirm`}
              className="num mt-1.5 h-10 w-full rounded-md border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        )}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" className="h-10" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            className="h-10"
            disabled={!ready || pending}
            onClick={() =>
              start(async () => {
                const res = await deleteBomRevision(revisionId, typed);
                if (res.error) {
                  setError(res.error);
                  return;
                }
                toast.success(impact.otherRevisions ? `Deleted rev ${impact.revision}` : `Deleted ${impact.bomName}`);
                onOpenChange(false);
                router.push(res.next ?? "/boms");
                router.refresh();
              })
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
            {impact.otherRevisions ? "Delete this revision" : "Delete the BoM"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A button that opens the delete dialog, for pages without the More menu (column mapping of a new upload). */
export function DeleteRevisionButton({ revisionId, impact }: { revisionId: string; impact: RevisionImpact }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" className="h-10" onClick={() => setOpen(true)}>
        <Trash2 className="size-4 text-destructive" aria-hidden /> {impact.otherRevisions ? "Delete this revision" : "Delete this upload"}
      </Button>
      <DeleteRevisionDialog revisionId={revisionId} impact={impact} open={open} onOpenChange={setOpen} />
    </>
  );
}

/** A confirm-then-act button with a small dialog: removing board files, deleting a quick look. */
function ConfirmButton({
  label,
  title,
  body,
  action,
  confirmLabel,
  done,
  size = "default",
}: {
  label: string;
  title: string;
  body: React.ReactNode;
  action: () => Promise<{ error?: string; message?: string }>;
  confirmLabel: string;
  done: (message?: string) => void;
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className={size === "sm" ? "h-8 px-2 text-xs" : "h-9"} aria-label={label}>
          <Trash2 className="size-4 text-destructive" aria-hidden /> {size === "sm" ? null : label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild><div className="space-y-2 text-sm">{body}</div></DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className="h-10" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="destructive"
            className="h-10"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await action();
                if (res.error) {
                  toast.error(res.error);
                  return;
                }
                setOpen(false);
                done(res.message);
              })
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** On the Gerbers step: removes the Gerbers and part positions; the BoM itself stays. */
export function RemoveBoardFilesButton({ revisionId }: { revisionId: string }) {
  const router = useRouter();
  return (
    <ConfirmButton
      label="Remove board files"
      title="Remove the board files?"
      body={
        <>
          <p>The Gerbers, the board drawn from them and every part position (from the Gerbers or the pick-and-place file) are deleted. The BoM lines, sources and quotes stay.</p>
          <p>The board then falls back to the project spec until you upload the files again.</p>
        </>
      }
      confirmLabel="Remove board files"
      action={() => removeBomBoardFiles(revisionId)}
      done={(m) => {
        toast.success(m ?? "Board files removed");
        router.refresh();
      }}
    />
  );
}

/** On a quick-look card or page: deletes the Gerbers looked at without a BoM. */
export function DeleteQuickLookButton({ id, name, compact = false, after }: { id: string; name: string; compact?: boolean; after?: string }) {
  const router = useRouter();
  return (
    <ConfirmButton
      label={`Delete quick look ${name}`}
      title={`Delete the quick look “${name}”?`}
      body={<p>Its Gerbers and the parts read from them are deleted. A BoM already made from it keeps its own copy of the board.</p>}
      confirmLabel="Delete quick look"
      size={compact ? "sm" : "default"}
      action={() => deleteQuickLook(id)}
      done={() => {
        toast.success(`Deleted ${name}`);
        if (after) router.push(after);
        router.refresh();
      }}
    />
  );
}
