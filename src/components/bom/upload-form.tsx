"use client";

import { useActionState, useId, useRef, useState } from "react";
import { ArrowRight, Check, CircuitBoard, Cpu, Factory, FileSpreadsheet, Layers, Loader2, ScanSearch, X } from "lucide-react";
import { uploadBom } from "@/app/(app)/boms/actions";
import { Button } from "@/components/ui/button";
import { Illustration } from "@/components/ui/illustration";
import { Label } from "@/components/ui/label";
import { PackStrip } from "@/components/bom/pack-strip";
import { sameCustomer, type FormDefaults } from "@/lib/bom/details";
import type { PackSummary } from "@/lib/bom/workbook";
import type { PreviewReply, PreviewRequest } from "@/lib/bom/preview.worker";
import { boardAfter, routeFiles } from "@/lib/bom/route-files";
import { cn } from "@/lib/utils";

const ACCEPT = ".xlsx,.xls,.xlsm,.csv,.tsv,.txt";
/** Files read in the browser before upload; a larger one is read on the server only. */
const PREVIEW_BYTES = 10 * 1024 * 1024;

/** `columns`: whether the upload will take the columns without the mapping page, and the header's template signature. */
type Preview = { summary: PackSummary; defaults: FormDefaults; bomSheets: string[]; bomFound: boolean; columns: { certain: boolean; signature: string } };
type Filled = "project" | "bomName" | "revision" | "buildQty" | "customer";

/**
 * Reads every sheet of the file in a worker, so a large workbook does not freeze the page; where workers cannot load,
 * on the page itself.
 */
async function readInBrowser(f: File, choice: string[] | null, id: number, current: { worker: Worker | null }): Promise<Preview> {
  const buf = await f.arrayBuffer();
  current.worker?.terminate();
  current.worker = null;
  if (typeof Worker !== "undefined") {
    try {
      const worker = new Worker(new URL("../../lib/bom/preview.worker.ts", import.meta.url), { type: "module" });
      current.worker = worker;
      const reply = await new Promise<PreviewReply | null>((resolve) => {
        worker.onmessage = (e: MessageEvent<PreviewReply>) => resolve(e.data);
        // The worker did not load: read on the page instead.
        worker.onerror = (e) => {
          e.preventDefault();
          resolve(null);
        };
        worker.postMessage({ id, buf, name: f.name, choice } satisfies PreviewRequest);
      });
      worker.terminate();
      if (current.worker === worker) current.worker = null;
      if (reply) {
        if (!reply.ok) throw new Error(reply.message);
        return reply.data;
      }
    } catch (e) {
      if (e instanceof Error && e.message && !/worker/i.test(e.message)) throw e;
    }
  }
  const { previewPack } = await import("@/lib/bom/workbook");
  return previewPack(new Uint8Array(buf), f.name, choice ? { bomSheets: choice } : {});
}

const field =
  "h-10 w-full rounded-md border bg-card px-3 text-sm outline-none transition-[box-shadow,border-color] duration-150 focus-visible:ring-2 focus-visible:ring-ring";

type Props = {
  customers: { id: string; name: string }[];
  /** Each customer's saved column templates, by header signature: an upload with one of these headers skips the mapping page. */
  templates?: Record<string, string[]>;
  projects: { name: string; customerId: string; boms: string[] }[];
  defaults: { customerId?: string; project?: string; bomName?: string; revision: string; stage: string };
  /** Revisions the BoM already has (a new revision of an existing BoM): the file's own is not offered when taken. */
  takenRevisions?: string[];
  /** Gerbers of a quick look that come with this BoM; `components` when parts were found on it. */
  preview?: { id: string; name: string; summary: string; components: { parts: number; lines: number; guessed: boolean } | null } | null;
};

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function UploadForm({ customers, templates = {}, projects, defaults, preview, takenRevisions = [] }: Props) {
  const [state, action, pending] = useActionState(uploadBom, undefined);
  const [file, setFile] = useState<File | null>(null);
  // From a quick look with components, the board itself can be the BoM.
  const [fromBoard, setFromBoard] = useState(!!preview?.components);
  const [dragging, setDragging] = useState(false);
  // Gerbers alone are enough to start: their components become the BoM.
  const [boardFiles, setBoardFiles] = useState<File[]>([]);
  const boardList = useRef<File[]>([]);
  const [draggingBoard, setDraggingBoard] = useState(false);
  const boardRef = useRef<HTMLInputElement>(null);
  // A spreadsheet taken off the board box as the BoM, until the reader says it holds one (else it goes back).
  const tentative = useRef<File | null>(null);
  const boardCount = boardFiles.length;
  const gerbersOnly = !fromBoard && !file && boardCount > 0;
  const hasBoard = !!preview || boardCount > 0;
  const hasBom = fromBoard || !!file;
  const start = { customer: defaults.customerId ?? customers[0]?.id ?? "new", project: defaults.project ?? "", bomName: defaults.bomName ?? "", revision: defaults.revision, buildQty: "100" };
  const [customerId, setCustomerId] = useState(start.customer);
  const [project, setProject] = useState(start.project);
  const [bomName, setBomName] = useState(start.bomName);
  const [revision, setRevision] = useState(start.revision);
  const [buildQty, setBuildQty] = useState(start.buildQty);
  // What the file filled in, and where it was read; a field the person typed in is theirs and is never overwritten.
  const [filled, setFilled] = useState<Partial<Record<Filled, string>>>({});
  const filledRef = useRef<Partial<Record<Filled, string>>>({});
  const typed = useRef<Record<Filled, boolean>>({ project: !!defaults.project, bomName: !!defaults.bomName, revision: false, buildQty: false, customer: !!defaults.customerId });
  // A customer the file names that is not one of ours: said under the select.
  const [fileCustomer, setFileCustomer] = useState<{ value: string; from: string } | null>(null);
  const worker = useRef<{ worker: Worker | null }>({ worker: null });
  const [read, setRead] = useState<{ status: "reading" } | { status: "done"; data: Preview } | { status: "error"; message: string } | null>(null);
  const [revTaken, setRevTaken] = useState<string | null>(null);
  // The BoM sheets the person picked; null while the reader's own choice stands.
  const [bomChoice, setBomChoice] = useState<string[] | null>(null);
  const readSeq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const ids = { projects: useId(), boms: useId() };

  const customerProjects = projects.filter((p) => p.customerId === customerId);
  const bomNames = customerProjects.find((p) => p.name.toLowerCase() === project.toLowerCase())?.boms ?? [];

  function markTyped(field: Filled) {
    typed.current[field] = true;
    filledRef.current = { ...filledRef.current, [field]: undefined };
    setFilled(filledRef.current);
  }

  /** Puts back what an earlier file filled in and the person did not change: another file, or none, says otherwise. */
  function clearFilled() {
    const was = filledRef.current;
    if (was.project && !typed.current.project) setProject(start.project);
    if (was.bomName && !typed.current.bomName) setBomName(start.bomName);
    if (was.revision && !typed.current.revision) setRevision(start.revision);
    if (was.buildQty && !typed.current.buildQty) setBuildQty(start.buildQty);
    if (was.customer && !typed.current.customer) setCustomerId(start.customer);
    filledRef.current = {};
    setFilled({});
    setFileCustomer(null);
    setRevTaken(null);
  }

  /** Fills what the file says where the person has not typed. Never submits. */
  function prefill(d: FormDefaults) {
    clearFilled();
    const from: Partial<Record<Filled, string>> = {};
    if (d.customer && !typed.current.customer) {
      const known = customers.find((c) => sameCustomer(c.name, d.customer!.value));
      if (known) {
        setCustomerId(known.id);
        from.customer = d.customer.from;
      } else setFileCustomer(d.customer);
    }
    if (d.project && !typed.current.project) {
      setProject(d.project.value);
      from.project = d.project.from;
    }
    if (d.bomName && !typed.current.bomName) {
      setBomName(d.bomName.value);
      from.bomName = d.bomName.from;
    }
    const taken = d.revision && takenRevisions.some((r) => r.toLowerCase() === d.revision!.value.toLowerCase());
    setRevTaken(taken ? d.revision!.value : null);
    if (d.revision && !taken && !typed.current.revision) {
      setRevision(d.revision.value);
      from.revision = d.revision.from;
    }
    if (d.buildQty && !typed.current.buildQty) {
      setBuildQty(String(d.buildQty.value));
      from.buildQty = d.buildQty.from;
    }
    filledRef.current = from;
    setFilled(from);
  }

  /** Reads every sheet in the browser (the reader loads on first use), to show what will be taken before upload. */
  async function readFile(f: File, choice: string[] | null) {
    const seq = ++readSeq.current;
    // Taken off the board box: only a BoM the reader confirms stays one. Too large to read here, the server decides.
    const unsure = tentative.current === f && !choice;
    if (f.size > PREVIEW_BYTES) {
      if (unsure) return giveBack(f);
      setRead(null);
      if (!choice) clearFilled();
      return;
    }
    setRead({ status: "reading" });
    try {
      const data = await readInBrowser(f, choice, seq, worker.current);
      if (seq !== readSeq.current) return;
      if (unsure) tentative.current = null;
      if (unsure && !data.bomFound) return giveBack(f);
      setRead({ status: "done", data });
      if (!choice) prefill(data.defaults);
    } catch (e) {
      if (seq !== readSeq.current) return;
      if (unsure) return giveBack(f);
      setRead({ status: "error", message: e instanceof Error ? e.message : "The file could not be read." });
      if (!choice) clearFilled();
    }
  }

  function clearBom() {
    setFile(null);
    setRead(null);
    setBomChoice(null);
    clearFilled();
    tentative.current = null;
    readSeq.current++;
    worker.current.worker?.terminate();
    worker.current.worker = null;
    if (inputRef.current) inputRef.current.value = "";
  }

  /** A spreadsheet from the board box that holds no BoM (a pick-and-place workbook): back with the board files. */
  function giveBack(f: File) {
    clearBom();
    setBoard([...boardList.current.filter((b) => b !== f), f]);
  }

  function takeFile(f: File | undefined | null, fromBoardBox = false) {
    if (!f) return;
    tentative.current = fromBoardBox ? f : null;
    setFile(f);
    setBomChoice(null);
    // Keep the real <input type=file> in sync so the form submits the dropped file.
    if (inputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(f);
      inputRef.current.files = dt.files;
    }
    void readFile(f, null);
  }

  function toggleBomSheet(sheet: string) {
    if (!file || read?.status !== "done") return;
    const current = bomChoice ?? read.data.bomSheets;
    const next = current.includes(sheet) ? current.filter((x) => x !== sheet) : [...current, sheet];
    // One BoM sheet is needed: the last one stays ticked (its box is disabled).
    if (!next.length) return;
    setBomChoice(next);
    void readFile(file, next);
  }

  function setBoard(files: File[]) {
    boardList.current = files;
    setBoardFiles(files);
    // Keep the real <input type=file> in sync so the form submits dropped files.
    if (boardRef.current) {
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      boardRef.current.files = dt.files;
    }
  }

  /**
   * Files dropped or picked on either box, each sent where it belongs: the BoM spreadsheet to the BoM, the Gerber zip,
   * layers, drill and pick-and-place files to the board files. The BoM workbook and the Gerber zip can come together.
   */
  function takeFiles(list: FileList | File[] | null | undefined, zone: "bom" | "board") {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    const { bom, board } = routeFiles(files, { zone, hasBom: !!file });
    // With a quick look's board there is no board box: only the BoM is taken. A pick on the board box always syncs its
    // input again: the picker replaced the input's files, even when the pick was only the BoM.
    const next = boardAfter(boardList.current, board, zone);
    if (next && !preview) setBoard(next);
    if (bom) takeFile(bom, zone === "board");
  }

  // Columns the upload will take without the mapping page: certain from the file, or this customer's saved template.
  const columns = file && !fromBoard && read?.status === "done" ? read.data.columns : null;
  const certain = !!columns && (columns.certain || (templates[customerId] ?? []).includes(columns.signature));

  // The flow in one picture: what is in so far lights up.
  const flow = [
    { icon: FileSpreadsheet, title: "1 · Upload", text: "The BoM and the Gerbers, together", done: hasBom && hasBoard, part: hasBom || hasBoard },
    { icon: ScanSearch, title: "2 · Footprints", text: "Every designator: BoM package against the board's pads", done: false, part: false },
    { icon: Factory, title: "3 · Machines", text: "Each process step on our lines, then the quote", done: false, part: false },
  ];

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <ol aria-label="How it goes" className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-stretch lg:col-span-2">
        {flow.map((f, i) => (
          <li key={f.title} className="contents">
            <div title={f.text} className={cn("flex items-center gap-3 rounded-md border bg-card px-3 py-2.5", f.done ? "border-risk-green/40 bg-risk-green-soft" : f.part ? "border-foreground/40" : i ? "opacity-60" : "")}>
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-md", f.done ? "bg-risk-green text-white" : "bg-muted text-muted-foreground")}>
                {f.done ? <Check className="size-4" aria-hidden /> : <f.icon className="size-4" aria-hidden />}
              </span>
              <span className="min-w-0 truncate text-sm font-semibold">{f.title}</span>
            </div>
            {i < flow.length - 1 ? <ArrowRight className="hidden size-4 self-center text-muted-foreground sm:block" aria-hidden /> : null}
          </li>
        ))}
      </ol>
      <div>
        {preview?.components ? (
          <fieldset className="mb-4 grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Where the BoM comes from</legend>
            {[
              { value: true, title: `Use the ${preview.components.parts} components found on the board`, note: `${preview.components.lines} lines${preview.components.guessed ? " guessed from the pads" : " with designators"}` },
              { value: false, title: "Upload the BoM file", note: "Excel or CSV" },
            ].map((o) => (
              <label
                key={String(o.value)}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-md border bg-card px-4 py-3 transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  fromBoard === o.value ? "border-foreground bg-part-soft" : "hover:bg-part-soft",
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
          <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border bg-card px-6 py-8 text-center">
            <Cpu className="size-8 text-muted-foreground" aria-hidden />
            <div>
              <div className="text-sm font-medium">No BoM file needed</div>
              <div className="mx-auto max-w-md text-xs text-muted-foreground">One line per footprint{preview?.components?.guessed ? "" : " and value"}.</div>
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
            takeFiles(e.dataTransfer.files, "bom");
          }}
          className={cn(
            "flex min-h-64 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card px-6 py-10 text-center transition-colors duration-150",
            "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
            dragging ? "border-foreground bg-part-soft" : "hover:bg-part-soft/50",
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
              <FileSpreadsheet className="size-8 text-risk-green" aria-hidden />
              <div>
                <div className="num text-sm font-medium">{file.name}</div>
                <div className="text-xs text-muted-foreground">{formatSize(file.size)} </div>
              </div>
            </>
          ) : (
            <>
              <Illustration kind="sheet" />
              <div>
                <div className="text-base font-semibold">BoM</div>
                <div className="text-sm text-muted-foreground" title="Every sheet is read: the BoM, placements, load lists, not-fitted lists, alternates and details. A CSV holds one sheet.">Excel or CSV · up to 10 MB</div>
                <div className="mt-2 text-xs text-muted-foreground">No BoM? Gerbers alone work.</div>
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
              takeFiles(e.dataTransfer.files, "board");
            }}
            className={cn(
              "flex min-h-64 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card px-6 py-10 text-center transition-colors duration-150",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              draggingBoard ? "border-foreground bg-part-soft" : "hover:bg-part-soft/50",
            )}
          >
            <input ref={boardRef} type="file" name="boardFiles" multiple className="sr-only" onChange={(e) => takeFiles(e.target.files, "board")} aria-label="Board files" />
            {boardCount ? (
              <>
                <Layers className="size-8 text-risk-green" aria-hidden />
                <div>
                  <div className="text-sm font-medium">{boardCount} board file{boardCount === 1 ? "" : "s"}</div>
                  <div className="num mx-auto max-w-xs truncate text-xs text-muted-foreground">{boardFiles.slice(0, 3).map((f) => f.name).join(", ")}{boardCount > 3 ? ` +${boardCount - 3} more` : ""}</div>
                  <div className="text-xs text-muted-foreground">{formatSize(boardFiles.reduce((t, f) => t + f.size, 0))} </div>
                </div>
              </>
            ) : (
              <>
                <CircuitBoard className="size-12 text-muted-foreground/70" strokeWidth={1.25} aria-hidden />
                <div>
                  <div className="text-base font-semibold">Gerbers</div>
                  <div className="text-sm text-muted-foreground">Zip or RAR, or layers + drill + pick-and-place</div>
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
            onClick={clearBom}
            className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" /> Remove file
          </button>
        ) : null}
        {file && !fromBoard && read ? (
          read.status === "reading" ? (
            <p className="mt-4 flex items-center gap-2 rounded-xl border bg-card px-5 py-4 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Reading every sheet…
            </p>
          ) : read.status === "error" ? (
            <p className="mt-4 rounded-xl border border-risk-amber/40 bg-risk-amber-soft px-5 py-4 text-sm" role="alert">{read.message}</p>
          ) : (
            <PackStrip
              pack={read.data.summary}
              className="mt-4"
              title="What this file holds"
              choose={
                read.data.summary.sheets.filter((x) => x.kind === "bom").length > 1 || !read.data.bomFound || bomChoice
                  ? { selected: bomChoice ?? read.data.bomSheets, onToggle: toggleBomSheet, candidates: read.data.summary.sheets.filter((x) => x.canBeBom).map((x) => x.name) }
                  : undefined
              }
            />
          )
        ) : null}
        {file && !fromBoard ? (bomChoice ?? []).map((sheet) => <input key={sheet} type="hidden" name="bomSheet" value={sheet} />) : null}
        {preview ? (
          <p className="mt-4 text-sm">
            <input type="hidden" name="previewId" value={preview.id} />
            <span className="font-medium">Board:</span> {preview.name} <span className="num text-muted-foreground">({preview.summary})</span>
          </p>
        ) : null}
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-5">
        <div className="space-y-1.5">
          <Label htmlFor="customerId">Customer</Label>
          <select
            id="customerId"
            name="customerId"
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              markTyped("customer");
            }}
            className={field}
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            <option value="new">New customer…</option>
          </select>
          <FromFile at={filled.customer} />
          {fileCustomer && !filled.customer ? (
            <p className="text-[11px] break-words text-muted-foreground">
              The file says customer <span className="font-medium text-foreground">{fileCustomer.value}</span> ({fileCustomer.from}), which is not in the list.
            </p>
          ) : null}
        </div>
        {customerId === "new" ? (
          <div className="space-y-1.5">
            <Label htmlFor="newCustomer">New customer name</Label>
            <input id="newCustomer" name="newCustomer" required className={field} />
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="project">Project / product</Label>
          <input id="project" name="project" list={ids.projects} value={project} onChange={(e) => {
              setProject(e.target.value);
              markTyped("project");
            }} required className={field} placeholder="e.g. GW-200 Industrial IoT Gateway" />
          <FromFile at={filled.project} />
          <datalist id={ids.projects}>
            {customerProjects.map((p) => (
              <option key={p.name} value={p.name} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bomName">Assembly / BoM name</Label>
          <input id="bomName" name="bomName" list={ids.boms} value={bomName} onChange={(e) => {
              setBomName(e.target.value);
              markTyped("bomName");
            }} required className={field} placeholder="e.g. Main board" />
          <FromFile at={filled.bomName} />
          <datalist id={ids.boms}>
            {bomNames.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="revision">Revision</Label>
            <input id="revision" name="revision" value={revision} onChange={(e) => {
              setRevision(e.target.value);
              markTyped("revision");
            }} required maxLength={20} className={`${field} num`} />
            <FromFile at={filled.revision} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="buildQty">Build qty</Label>
            <input id="buildQty" name="buildQty" type="number" min={1} value={buildQty} onChange={(e) => {
              setBuildQty(e.target.value);
              markTyped("buildQty");
            }} required className={`${field} num`} />
            <FromFile at={filled.buildQty} />
          </div>
        </div>
        {revTaken ? <p className="text-xs text-muted-foreground">The file says rev <span className="num">{revTaken}</span>, which this BoM already has.</p> : null}
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
        {file && !hasBoard ? <p className="text-xs text-muted-foreground">No Gerbers: footprints cannot be checked yet.</p> : null}
        {gerbersOnly ? (
          <p className="text-xs text-muted-foreground">No BoM file: the parts on the Gerbers become the BoM.</p>
        ) : null}
        {certain ? <p className="text-xs text-muted-foreground">Columns recognised: no mapping step. Check them any time from step 3.</p> : null}
        <Button type="submit" className="h-10 w-full" disabled={(!file && !fromBoard && !boardCount) || pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending && gerbersOnly
            ? "Reading the Gerbers…"
            : pending && certain
              ? "Matching parts…"
              : fromBoard
                ? "Create the BoM and quote it"
                : gerbersOnly
                  ? "Read the board and check the process"
                  : certain
                    ? hasBoard
                      ? "Check footprints"
                      : "Match & score BoM"
                    : "Continue to column mapping"}
        </Button>
      </div>
    </form>
  );
}

/** A field the file filled in, and the cell it came from. */
function FromFile({ at }: { at?: string }) {
  return at ? (
    <p className="text-[11px] break-words text-muted-foreground">From the file · {at}</p>
  ) : null;
}
