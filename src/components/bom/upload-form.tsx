"use client";

import { useActionState, useId, useRef, useState } from "react";
import { ArrowRight, Check, CircuitBoard, Cpu, Factory, FileSpreadsheet, Layers, Loader2, ScanSearch, X } from "lucide-react";
import { uploadBom } from "@/app/(app)/boms/actions";
import { Button } from "@/components/ui/button";
import { Illustration } from "@/components/ui/illustration";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const ACCEPT = ".xlsx,.xls,.xlsm,.csv,.tsv,.txt";

const field =
  "h-10 w-full rounded-md border bg-card px-3 text-sm outline-none transition-[box-shadow,border-color] duration-150 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/30";

type Props = {
  customers: { id: string; name: string }[];
  projects: { name: string; customerId: string; boms: string[] }[];
  defaults: { customerId?: string; project?: string; bomName?: string; revision: string; stage: string };
  /** Gerbers of a quick look that come with this BoM; `components` when parts were found on it. */
  preview?: { id: string; name: string; summary: string; components: { parts: number; lines: number; guessed: boolean } | null } | null;
};

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function UploadForm({ customers, projects, defaults, preview }: Props) {
  const [state, action, pending] = useActionState(uploadBom, undefined);
  const [file, setFile] = useState<File | null>(null);
  // From a quick look with components, the board itself can be the BoM.
  const [fromBoard, setFromBoard] = useState(!!preview?.components);
  const [dragging, setDragging] = useState(false);
  // Gerbers alone are enough to start: their components become the BoM.
  const [boardFiles, setBoardFiles] = useState<File[]>([]);
  const [draggingBoard, setDraggingBoard] = useState(false);
  const boardRef = useRef<HTMLInputElement>(null);
  const boardCount = boardFiles.length;
  const gerbersOnly = !fromBoard && !file && boardCount > 0;
  const hasBoard = !!preview || boardCount > 0;
  const hasBom = fromBoard || !!file;
  const [customerId, setCustomerId] = useState(defaults.customerId ?? customers[0]?.id ?? "new");
  const [project, setProject] = useState(defaults.project ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const ids = { projects: useId(), boms: useId() };

  const customerProjects = projects.filter((p) => p.customerId === customerId);
  const bomNames = customerProjects.find((p) => p.name.toLowerCase() === project.toLowerCase())?.boms ?? [];

  function takeFile(f: File | undefined | null) {
    if (!f) return;
    setFile(f);
    // Keep the real <input type=file> in sync so the form submits the dropped file.
    if (inputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(f);
      inputRef.current.files = dt.files;
    }
  }

  function takeBoard(list: FileList | File[] | null | undefined) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setBoardFiles(files);
    // Keep the real <input type=file> in sync so the form submits dropped files.
    if (boardRef.current) {
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      boardRef.current.files = dt.files;
    }
  }

  // The flow in one picture: what is in so far lights up.
  const flow = [
    { icon: FileSpreadsheet, title: "1 · Upload", text: "The BoM and the Gerbers, together", done: hasBom && hasBoard, part: hasBom || hasBoard },
    { icon: ScanSearch, title: "2 · Footprints match", text: "Every designator: BoM package against the board's pads", done: false, part: false },
    { icon: Factory, title: "3 · Machines can build it", text: "Each process step on our lines, then the quote", done: false, part: false },
  ];

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <ol aria-label="How it goes" className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-stretch lg:col-span-2">
        {flow.map((f, i) => (
          <li key={f.title} className="contents">
            <div className={cn("flex items-center gap-3 rounded-lg border bg-card px-4 py-3", f.done ? "border-risk-green/40 bg-risk-green-soft" : f.part ? "border-primary/40" : i ? "opacity-75" : "")}>
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", f.done ? "bg-risk-green text-white" : "bg-primary/10 text-primary")}>
                {f.done ? <Check className="size-5" aria-hidden /> : <f.icon className="size-5" aria-hidden />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{f.title}</span>
                <span className="block text-xs text-muted-foreground">{f.text}</span>
              </span>
            </div>
            {i < flow.length - 1 ? <ArrowRight className="hidden size-5 self-center text-muted-foreground sm:block" aria-hidden /> : null}
          </li>
        ))}
      </ol>
      <div>
        {preview?.components ? (
          <fieldset className="mb-4 grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Where the BoM comes from</legend>
            {[
              { value: true, title: `Use the ${preview.components.parts} components found on the board`, note: `${preview.components.lines} lines${preview.components.guessed ? " guessed from the pads — you choose each part in Build & quote" : " with their designators from the files"}` },
              { value: false, title: "Upload the BoM file", note: "Excel or CSV from the customer; the board's Gerbers come with it" },
            ].map((o) => (
              <label
                key={String(o.value)}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-lg border bg-card px-4 py-3 transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  fromBoard === o.value ? "border-primary bg-primary/5" : "hover:border-foreground/30",
                )}
              >
                <input type="radio" name="useFound" value={o.value ? "1" : "0"} checked={fromBoard === o.value} onChange={() => setFromBoard(o.value)} className="mt-1 accent-[var(--primary)]" />
                <span>
                  <span className="block text-sm font-medium">{o.title}</span>
                  <span className="block text-xs text-muted-foreground">{o.note}</span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}
        {fromBoard ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border bg-card px-6 py-8 text-center">
            <Cpu className="size-8 text-primary" aria-hidden />
            <div>
              <div className="text-sm font-medium">No BoM file needed</div>
              <div className="mx-auto max-w-md text-xs text-muted-foreground">
                One line per footprint{preview?.components?.guessed ? "" : " and value"}, placed where the Gerbers put each part. Lines without a part number open in Build &amp; quote, where you pick the part for each footprint.
              </div>
            </div>
          </div>
        ) : (
        <div className={cn("grid gap-4", preview ? "" : "md:grid-cols-2")}>
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            takeFile(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex min-h-64 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card px-6 py-10 text-center transition-colors duration-150",
            "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
            dragging ? "border-primary bg-primary/5" : "hover:border-foreground/30",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            name="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => takeFile(e.target.files?.[0])}
            aria-label="BoM file"
          />
          {file ? (
            <>
              <FileSpreadsheet className="size-8 text-primary" aria-hidden />
              <div>
                <div className="num text-sm font-medium">{file.name}</div>
                <div className="text-xs text-muted-foreground">{formatSize(file.size)} · click to choose another file</div>
              </div>
            </>
          ) : (
            <>
              <Illustration kind="sheet" />
              <div>
                <div className="text-base font-medium">Drop the customer&rsquo;s BoM here</div>
                <div className="text-sm text-muted-foreground">Or tap to choose the file, exactly as they sent it.</div>
                <div className="mt-1 text-xs text-muted-foreground">Excel or CSV (.xlsx, .xls, .csv, .tsv), up to 10 MB. The first sheet with a table is used.</div>
                <div className="mt-2 text-xs font-medium text-primary">No BoM? Add only the Gerbers — the parts are read off the board.</div>
              </div>
            </>
          )}
        </label>
        {preview ? null : (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDraggingBoard(true);
            }}
            onDragLeave={() => setDraggingBoard(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDraggingBoard(false);
              takeBoard(e.dataTransfer.files);
            }}
            className={cn(
              "flex min-h-64 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card px-6 py-10 text-center transition-colors duration-150",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              draggingBoard ? "border-primary bg-primary/5" : "hover:border-foreground/30",
            )}
          >
            <input ref={boardRef} type="file" name="boardFiles" multiple className="sr-only" onChange={(e) => takeBoard(e.target.files)} aria-label="Board files" />
            {boardCount ? (
              <>
                <Layers className="size-8 text-primary" aria-hidden />
                <div>
                  <div className="text-sm font-medium">{boardCount} board file{boardCount === 1 ? "" : "s"}</div>
                  <div className="num mx-auto max-w-xs truncate text-xs text-muted-foreground">{boardFiles.slice(0, 3).map((f) => f.name).join(", ")}{boardCount > 3 ? ` +${boardCount - 3} more` : ""}</div>
                  <div className="text-xs text-muted-foreground">{formatSize(boardFiles.reduce((t, f) => t + f.size, 0))} · click to choose other files</div>
                </div>
              </>
            ) : (
              <>
                <CircuitBoard className="size-12 text-muted-foreground/70" strokeWidth={1.25} aria-hidden />
                <div>
                  <div className="text-base font-medium">Drop the Gerber files here</div>
                  <div className="text-sm text-muted-foreground">A zip, or the layer files with drill and pick-and-place.</div>
                  <div className="mt-1 text-xs text-muted-foreground">They give the board&rsquo;s size and layers, and the footprint under every designator.</div>
                </div>
              </>
            )}
          </label>
        )}
        </div>
        )}
        {file && !fromBoard ? (
          <button
            type="button"
            onClick={() => {
              setFile(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" /> Remove file
          </button>
        ) : null}
        {preview ? (
          <p className="mt-4 rounded-lg border bg-card px-4 py-3 text-sm">
            <input type="hidden" name="previewId" value={preview.id} />
            <span className="font-medium">Board from the quick look:</span> {preview.name} <span className="num text-muted-foreground">({preview.summary})</span> — its Gerbers come with this BoM.
          </p>
        ) : null}
      </div>

      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div className="space-y-1.5">
          <Label htmlFor="customerId">Customer</Label>
          <select id="customerId" name="customerId" value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={field}>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            <option value="new">New customer…</option>
          </select>
        </div>
        {customerId === "new" ? (
          <div className="space-y-1.5">
            <Label htmlFor="newCustomer">New customer name</Label>
            <input id="newCustomer" name="newCustomer" required className={field} />
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="project">Project / product</Label>
          <input id="project" name="project" list={ids.projects} value={project} onChange={(e) => setProject(e.target.value)} required className={field} placeholder="e.g. GW-200 Industrial IoT Gateway" />
          <datalist id={ids.projects}>
            {customerProjects.map((p) => (
              <option key={p.name} value={p.name} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bomName">Assembly / BoM name</Label>
          <input id="bomName" name="bomName" list={ids.boms} defaultValue={defaults.bomName} required className={field} placeholder="e.g. Main board" />
          <datalist id={ids.boms}>
            {bomNames.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="revision">Revision</Label>
            <input id="revision" name="revision" defaultValue={defaults.revision} required className={`${field} num`} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="buildQty">Build qty</Label>
            <input id="buildQty" name="buildQty" type="number" min={1} defaultValue={100} required className={`${field} num`} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="stage">Stage</Label>
          <select id="stage" name="stage" defaultValue={defaults.stage} className={field}>
            <option value="PROTOTYPE">Prototype</option>
            <option value="NPI">NPI</option>
            <option value="PRODUCTION">Production</option>
          </select>
        </div>
        {state?.error ? (
          <p role="alert" className="text-sm text-destructive">{state.error}</p>
        ) : null}
        {file && !hasBoard ? <p className="text-xs text-muted-foreground">No Gerbers yet: the footprints cannot be checked against the board until you add them.</p> : null}
        {gerbersOnly ? (
          <p className="text-xs text-muted-foreground">No BoM file: the components on the Gerbers become the BoM, then the footprint match and the machine check open.</p>
        ) : null}
        <Button type="submit" className="h-10 w-full" disabled={(!file && !fromBoard && !boardCount) || pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending && gerbersOnly ? "Reading the Gerbers…" : fromBoard ? "Create the BoM and quote it" : gerbersOnly ? "Read the board and check the process" : "Continue to column mapping"}
        </Button>
      </div>
    </form>
  );
}
