import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient, type Prisma } from "@prisma/client";
import { readdirSync } from "node:fs";
import path from "node:path";
import { e2eDatabaseUrl } from "./database";
import { DICTIONARY } from "../../src/knowledge/dictionary";
import boardTypes from "../../src/knowledge/data/board-types.json";

const BOARD_TYPES = boardTypes.types;
const PASSWORD = process.env.SEED_USER_PASSWORD ?? "ChangeMe!2026";
const db = new PrismaClient({ datasourceUrl: e2eDatabaseUrl() });
let records: Record<string, string>;
let session: Awaited<ReturnType<BrowserContext["storageState"]>>;
const root = path.resolve(__dirname, "../../src/app/(app)");
const templates = readdirSync(root, { recursive: true })
  .map(String).filter((file) => file.endsWith("page.tsx"))
  .map((file) => "/" + file.replace(/\/?page\.tsx$/, "").split(path.sep).join("/"));

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("admin@ems.local");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
}
async function contained(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "page must not overflow horizontally").toBe(true);
}

async function healthy(page: Page, url: string) {
  const errors: string[] = [];
  const onError = (e: Error) => errors.push(e.message);
  page.on("pageerror", onError);
  const response = await page.goto(url);
  expect(response?.status(), url).toBeLessThan(400);
  await expect(page.locator("main h1").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/Application error:|Internal Server Error/);
  await contained(page);
  expect(errors, url).toEqual([]);
  page.off("pageerror", onError);
}

test.beforeAll(async ({ browser }) => {
  const [revision, part, wo, article, supplier, admin] = await Promise.all([
    db.bomRevision.findFirstOrThrow({ where: { bom: { name: "GW-200 Main Board" }, revision: "B" } }),
    db.part.findFirstOrThrow({ where: { mpn: "LM358DR" } }),
    db.workOrder.findFirstOrThrow(), db.knowledgeArticle.findFirstOrThrow(),
    db.supplier.findFirstOrThrow(), db.user.findUniqueOrThrow({ where: { email: "admin@ems.local" } }),
  ]);
  const rfq = await db.rfq.create({ data: { number: `UI-RFQ-${Date.now()}`, createdById: admin.id } });
  const po = await db.purchaseOrderDraft.create({ data: { number: `UI-PO-${Date.now()}`, supplierId: supplier.id, currency: "INR", createdById: admin.id } });
  const board = await db.boardModel.findUniqueOrThrow({ where: { revisionId: revision.id } });
  const preview = await db.boardPreview.create({ data: { name: "UI route coverage board", widthMm: board.widthMm, heightMm: board.heightMm, layerCount: board.layerCount, artwork: board.artwork as Prisma.InputJsonValue, files: board.files as Prisma.InputJsonValue } });
  records = { bom: revision.id, part: part.id, wo: wo.id, article: article.slug, rfq: rfq.id, po: po.id, preview: preview.id };
  const page = await browser.newPage();
  await login(page);
  session = await page.context().storageState();
  await page.close();
});
test.afterAll(async () => { await db.$disconnect(); });
test.beforeEach(async ({ context }) => { await context.addCookies(session.cookies); });

for (const template of templates) {
  test(`page template ${template || "/"} renders without errors on desktop and phone`, async ({ page }) => {
    const url = template.startsWith("/boms/[id]") ? template.replace("[id]", records.bom)
      : template.startsWith("/parts/[id]") ? template.replace("[id]", records.part)
      : template.startsWith("/operations/work-orders/[id]") ? template.replace("[id]", records.wo)
      : template.startsWith("/sourcing/rfqs/[id]") ? template.replace("[id]", records.rfq)
      : template.startsWith("/sourcing/pos/[id]") ? template.replace("[id]", records.po)
      : template.startsWith("/viewer/boards/[id]") ? template.replace("[id]", records.preview)
      : template.startsWith("/directory/board-types/[id]") ? template.replace("[id]", BOARD_TYPES[0].id)
      : template.startsWith("/knowledge/dictionary/[slug]") ? template.replace("[slug]", DICTIONARY[0].slug)
      : template === "/knowledge/[slug]" ? template.replace("[slug]", records.article) : template;
    expect(url).not.toMatch(/\[(id|slug)\]/);
    await healthy(page, url || "/");
    await page.setViewportSize({ width: 390, height: 900 });
    await contained(page);
  });
}

for (const width of [390, 768]) {
  test(`navigation and key workspaces fit ${width}px screens`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 900 });
    for (const url of ["/", "/boms", "/parts", "/sourcing", "/operations", "/inventory", "/knowledge", `/boms/${records.bom}`]) {
      await healthy(page, url);
    }
    // No sidebar: the three parts sit on one menu line, the part's pages as tabs under it; the BoMs open Supply.
    const menu = page.getByRole("navigation", { name: "Main menu" });
    await expect(menu).toBeVisible();
    if (width < 768) await expect(page.getByRole("link", { name: "Open part search", exact: true })).toBeVisible();
    await menu.getByRole("link", { name: "Supply", exact: true }).click();
    await expect(page).toHaveURL(/\/boms$/);
    const tabs = page.getByRole("navigation", { name: "Supply pages" });
    await expect(tabs.getByRole("link", { name: "BoMs", exact: true })).toHaveAttribute("aria-current", "page");
    await tabs.getByRole("link", { name: "Inventory", exact: true }).click();
    await expect(page).toHaveURL(/\/inventory$/);
    await expect(tabs.getByRole("link", { name: "Inventory", exact: true })).toHaveAttribute("aria-current", "page");
    await contained(page);
  });
}

test("global search, currency, theme and keyboard skip link work", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Search parts", { exact: true }).fill("LM358DR");
  await page.getByLabel("Search parts", { exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/parts\?q=LM358DR/);
  await expect(page.getByRole("link", { name: "LM358DR", exact: true }).first()).toBeVisible();
  await page.getByRole("radio", { name: "USD", exact: true }).click();
  await expect(page.getByRole("radio", { name: "USD", exact: true })).toBeChecked();
  await page.reload();
  await expect(page.getByRole("radio", { name: "USD", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  // The one-tap switch in the top bar takes it back to light.
  const darkMode = page.getByRole("switch", { name: "Dark mode", exact: true });
  await expect(darkMode).toBeChecked();
  await darkMode.click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(darkMode).not.toBeChecked();
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("assembly filters support search, empty results and recovery", async ({ page }) => {
  await page.goto("/boms");
  await page.getByLabel("Search BoMs", { exact: true }).fill("GW-200");
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(page.getByRole("link", { name: "GW-200 Main Board", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "MC-48V Power Stage", exact: true })).toHaveCount(0);
  await page.getByLabel("Search BoMs", { exact: true }).fill("no-assembly-matches-this-query");
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(page.getByText("No assemblies match your filters", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Clear filters", exact: true }).click();
  await expect(page.getByRole("link", { name: "GW-200 Main Board", exact: true })).toBeVisible();
});

test("login shows recoverable errors and fits a phone", async ({ page, context }) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await contained(page);
  await page.getByLabel("Email", { exact: true }).fill("invalid@example.com");
  const password = page.getByLabel("Password", { exact: true });
  await password.fill("Incorrect-password");
  await page.getByRole("button", { name: "Show password", exact: true }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password", exact: true }).click();
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // The form's own alert (Next's route announcer is a second, empty role=alert on every page).
  await expect(page.locator("form").getByRole("alert")).toContainText("Email or password is incorrect");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
});
