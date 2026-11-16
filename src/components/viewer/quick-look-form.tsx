"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { uploadQuickLook } from "@/app/(app)/viewer/actions";
import { MAX_UPLOAD_BYTES } from "@/lib/board/upload";
import { Button } from "@/components/ui/button";
import { Illustration } from "@/components/ui/illustration";

const field = "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/30";

export function QuickLookForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-5 rounded-lg border bg-card p-4 lg:grid-cols-[minmax(0,1fr)_280px]"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.delete("files");
        files.forEach((f) => fd.append("files", f));
        if (files.reduce((s, f) => s + f.size, 0) > MAX_UPLOAD_BYTES) {
          toast.error("These files are over 20 MB in total. Send only the Gerber and drill files, or zip them.");
          return;
        }
        start(async () => {
          // A dropped connection or a server failure rejects the call: say so instead of going quiet.
          try {
            const res = await uploadQuickLook(fd);
            if (res?.error) toast.error(res.error);
          } catch {
            toast.error("The upload did not go through. Check the connection and try again; if it repeats, the files may be too large or not Gerbers.");
          }
        });
      }}
    >
      <div className="space-y-3">
        <label
          className="flex min-h-56 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors duration-150 hover:border-foreground/30 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
          }}
        >
          <input type="file" name="files" multiple className="sr-only" aria-label="Gerber files or zip" onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])} />
          <Illustration kind="board" />
          <span className="text-base font-medium">Drop your Gerber files here</span>
          <span className="text-sm text-muted-foreground">A zip, or the layer and drill files together. Or tap to choose them.</span>
          <span className="text-xs text-muted-foreground">Altium .GTL/.GBL/.GTS/.GTO/.GKO/.G1… · KiCad *-F_Cu.gbr, *-Edge_Cuts.gbr · Eagle .cmp/.sol · Excellon .DRL/.XLN · a pick-and-place file too, if you have it</span>
        </label>
        {files.length ? (
          <ul className="max-h-40 divide-y overflow-y-auto rounded-md border text-xs">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex justify-between gap-2 px-3 py-1.5">
                <span className="num truncate">{f.name}</span>
                <span className="shrink-0 text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="space-y-3">
        <label className="block text-sm">
          Board name
          <input name="name" required maxLength={120} placeholder="e.g. Customer X motor controller rev 2" className={`${field} mt-1`} />
        </label>
        <label className="block text-sm">
          Solder mask
          <select name="mask" defaultValue="green" className={`${field} mt-1`}>
            {["green", "black", "blue", "red", "white"].map((m) => (
              <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Surface finish
          <select name="finish" defaultValue="ENIG" className={`${field} mt-1`}>
            <option value="ENIG">ENIG</option>
            <option value="HASL">HASL</option>
            <option value="LF-HASL">Lead-free HASL</option>
            <option value="OSP">OSP</option>
            <option value="ImmAg">Immersion silver</option>
          </select>
        </label>
        <label className="block text-sm">
          Thickness (mm)
          <input name="thickness" type="number" step="0.1" min="0.4" max="3.2" defaultValue="1.6" className={`${field} num mt-1`} />
        </label>
        <Button type="submit" className="h-10 w-full" disabled={!files.length || pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? "Rendering the board…" : "Show it in 3D"}
        </Button>
      </div>
    </form>
  );
}
