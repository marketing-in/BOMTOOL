"use client";

import { useState, useTransition } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { uploadBoardFiles } from "@/app/(app)/boms/board-actions";
import { Button } from "@/components/ui/button";

export function BoardUploadForm({ revisionId }: { revisionId: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  return (
    <form
      className="space-y-4 rounded-xl border bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData();
        files.forEach((f) => fd.append("files", f));
        start(async () => {
          let res: Awaited<ReturnType<typeof uploadBoardFiles>>;
          try {
            res = await uploadBoardFiles(revisionId, fd);
          } catch {
            toast.error("The upload did not go through. Check the connection and try again; if it repeats, the files may be too large or not Gerbers.");
            return;
          }
          if (res?.error) toast.error(res.error);
          else {
            toast.success(res?.message ?? "Uploaded");
            setDone(res?.message ?? "Uploaded");
          }
        });
      }}
    >
      <label
        className="flex min-h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center hover:border-foreground/30 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
        }}
      >
        <input type="file" multiple className="sr-only" aria-label="Board files" onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])} />
        <FileUp className="size-7 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">Drop Gerber, drill and centroid files here</span>
        <span className="text-xs text-muted-foreground">.GTL .GBL .G2 .GTS .GTO .GKO / KiCad *-F_Cu.gbr … · .DRL .XLN · Pick Place .csv/.txt/.pos</span>
      </label>
      {files.length ? (
        <ul className="max-h-48 divide-y overflow-y-auto rounded-md border text-xs">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex justify-between gap-2 px-3 py-1.5">
              <span className="num">{f.name}</span>
              <span className="text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" className="h-10" disabled={!files.length || pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Upload {files.length || ""} file{files.length === 1 ? "" : "s"}
        </Button>
        {files.length ? (
          <Button type="button" variant="ghost" className="h-10" onClick={() => setFiles([])}>Clear</Button>
        ) : null}
      </div>
      {done ? (
        <p role="status" className="rounded-md border border-risk-green/30 bg-risk-green-soft px-3 py-2 text-sm">
          Uploaded: <span className="num">{done}</span>
        </p>
      ) : null}
    </form>
  );
}
