/**
 * Capture every page of the running isolated E2E site for visual review (npm run test:ui:capture).
 * Read-only: it looks records up, never creates or changes them. Pages whose record is missing are skipped.
 *
 * For every page template under src/app: desktop light (1440), phone light (390) and desktop dark; key
 * workspaces also at tablet width (820). Writes PNGs and report.json (status, h1, horizontal overflow,
 * console errors, uncaught errors) to .impeccable/review/site/. Exits 1 when any page fails a check.
 *
 *   UI_CAPTURE_ONLY=boms,parts   only routes whose path contains one of these
 *   UI_CAPTURE_MAX_HEIGHT=4000   clip very long pages (px)
 *   UI_CAPTURE_DEV=1             read records from DATABASE_URL (a dev server) instead of the E2E database
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { e2eDatabaseUrl } from "../tests/e2e/database";
import { DICTIONARY } from "../src/knowledge/dictionary";
import boardTypes from "../src/knowledge/data/board-types.json";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const out = path.resolve(".impeccable/review/site");
const maxHeight = Number(process.env.UI_CAPTURE_MAX_HEIGHT ?? 4000);
const only = (process.env.UI_CAPTURE_ONLY ?? "").split(",").filter(Boolean);
const PASSWORD = process.env.SEED_USER_PASSWORD ?? "ChangeMe!2026";
const TABLET = new Set(["/", "/boms", "/boms/[id]", "/boms/[id]/build/parts", "/parts", "/sourcing", "/operations", "/inventory", "/knowledge"]);

type Shot = { template: string; url: string; variant: string; file: string; status?: number; h1?: string; overflow?: boolean; consoleErrors: string[]; pageErrors: string[]; ms: number };

async function templates() {
  const root = path.resolve("src/app/(app)");
  const files = (await readdir(root, { recursive: true })).map(String).filter((f) => f.endsWith("page.tsx"));
  return ["/login", ...files.map((f) => "/" + f.replace(/\/?page\.tsx$/, "").split(path.sep).join("/")).map((t) => (t === "/" ? "/" : t.replace(/\/$/, "")))].sort();
}

async function records() {
  // UI_CAPTURE_DEV=1 captures a server running on the development database (DATABASE_URL) instead of the E2E one.
  const db = new PrismaClient({ datasourceUrl: process.env.UI_CAPTURE_DEV ? process.env.DATABASE_URL : e2eDatabaseUrl() });
  try {
    const [bom, part, wo, article, rfq, po, preview] = await Promise.all([
      db.bomRevision.findFirst({ where: { bom: { name: "GW-200 Main Board" } }, orderBy: { createdAt: "desc" } }),
      db.part.findFirst({ where: { mpn: "LM358DR" } }),
      db.workOrder.findFirst(), db.knowledgeArticle.findFirst(),
      db.rfq.findFirst({ orderBy: { createdAt: "desc" } }), db.purchaseOrderDraft.findFirst({ orderBy: { createdAt: "desc" } }),
      db.boardPreview.findFirst({ orderBy: { createdAt: "desc" } }),
    ]);
    return { bom: bom?.id, part: part?.id, wo: wo?.id, article: article?.slug, rfq: rfq?.id, po: po?.id, preview: preview?.id };
  } finally {
    await db.$disconnect();
  }
}

function resolve(t: string, r: Awaited<ReturnType<typeof records>>): string | null {
  const pairs: [string, string | undefined][] = [
    ["/boms/[id]", r.bom], ["/parts/[id]", r.part], ["/operations/work-orders/[id]", r.wo], ["/sourcing/rfqs/[id]", r.rfq],
    ["/sourcing/pos/[id]", r.po], ["/viewer/boards/[id]", r.preview], ["/directory/board-types/[id]", boardTypes.types[0]?.id],
    ["/knowledge/dictionary/[slug]", DICTIONARY[0]?.slug], ["/knowledge/[slug]", r.article],
  ];
  for (const [prefix, id] of pairs) if (t.startsWith(prefix)) return id ? t.replace(/\[(id|slug)\]/, id) : null;
  return t;
}

const slug = (t: string) => (t === "/" ? "home" : t.slice(1).replace(/[[\]]/g, "").replace(/\//g, "__"));

async function login(browser: Browser, colorScheme: "light" | "dark") {
  const context = await browser.newContext({ colorScheme, reducedMotion: "reduce", viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(120_000);
  page.setDefaultTimeout(60_000);
  await page.goto(`${baseURL}/login`);
  await page.getByLabel("Email", { exact: true }).fill("admin@ems.local");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`${baseURL}/`);
  return page;
}

async function capture(page: Page, template: string, url: string, variant: string, width: number): Promise<Shot> {
  const file = `${slug(template)}.${variant}.png`;
  const shot: Shot = { template, url, variant, file, consoleErrors: [], pageErrors: [], ms: 0 };
  const onConsole = (m: { type(): string; text(): string }) => { if (m.type() === "error") shot.consoleErrors.push(m.text().slice(0, 300)); };
  const onError = (e: Error) => shot.pageErrors.push(e.message.slice(0, 300));
  page.on("console", onConsole);
  page.on("pageerror", onError);
  const start = Date.now();
  try {
    await page.setViewportSize({ width, height: 1000 });
    const res = await page.goto(baseURL + url, { waitUntil: "load" });
    shot.status = res?.status();
    await page.locator("h1").first().waitFor({ timeout: 30_000 }).catch(() => undefined);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(700);
    shot.h1 = (await page.locator("h1").first().textContent({ timeout: 2_000 }).catch(() => null))?.trim() ?? undefined;
    const m = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, height: document.documentElement.scrollHeight }));
    shot.overflow = m.overflow;
    await page.screenshot({ path: path.join(out, file), fullPage: true, clip: { x: 0, y: 0, width, height: Math.min(m.height, maxHeight) } });
  } catch (e) {
    shot.pageErrors.push(`capture failed: ${(e as Error).message.split("\n")[0]}`);
  } finally {
    shot.ms = Date.now() - start;
    page.off("console", onConsole);
    page.off("pageerror", onError);
  }
  return shot;
}

async function main() {
  await mkdir(out, { recursive: true });
  const r = await records();
  const all = (await templates()).filter((t) => !only.length || only.some((o) => t.includes(o)));
  const browser = await chromium.launch({
    ...(process.env.E2E_BROWSER_PATH ? { executablePath: process.env.E2E_BROWSER_PATH } : {}),
    args: ["--enable-unsafe-swiftshader"],
  });
  const shots: Shot[] = [];
  const skipped: string[] = [];
  try {
    const light = await login(browser, "light");
    const dark = await login(browser, "dark");
    for (const t of all) {
      const url = resolve(t, r);
      if (!url) { skipped.push(t); continue; }
      const page = t === "/login" ? await (await browser.newContext({ reducedMotion: "reduce" })).newPage() : light;
      shots.push(await capture(page, t, url, "desktop", 1440));
      shots.push(await capture(page, t, url, "phone", 390));
      if (TABLET.has(t)) shots.push(await capture(page, t, url, "tablet", 820));
      if (t !== "/login") shots.push(await capture(dark, t, url, "dark", 1440));
      const last = shots.slice(-3);
      console.log(`${t.padEnd(36)} ${last.map((s) => `${s.variant}:${s.status ?? "—"}${s.overflow ? " OVERFLOW" : ""}${s.pageErrors.length ? " ERROR" : ""}`).join("  ")}`);
    }
  } finally {
    await browser.close();
  }
  const bad = shots.filter((s) => !s.status || s.status >= 400 || s.overflow || s.pageErrors.length || (!s.h1 && s.template !== "/boms/[id]/build/print"));
  await writeFile(path.join(out, "report.json"), JSON.stringify({ baseURL, capturedAt: new Date().toISOString(), skipped, problems: bad.length, shots }, null, 2));
  console.log(`\n${shots.length} screenshots in ${out}; ${skipped.length} skipped (no record): ${skipped.join(", ") || "none"}`);
  console.log(`${bad.length} with problems${bad.length ? ":\n" + bad.map((s) => `  ${s.url} [${s.variant}] status=${s.status} overflow=${s.overflow} h1=${s.h1 ?? "none"} ${s.pageErrors.join(" | ")}`).join("\n") : ""}`);
  const withConsole = shots.filter((s) => s.consoleErrors.length);
  if (withConsole.length) console.log(`console errors on ${withConsole.length}:\n` + withConsole.map((s) => `  ${s.url} [${s.variant}] ${s.consoleErrors[0]}`).join("\n"));
  if (bad.length) process.exitCode = 1;
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
