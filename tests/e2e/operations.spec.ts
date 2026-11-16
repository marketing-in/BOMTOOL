import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const PASSWORD = process.env.SEED_USER_PASSWORD ?? "ChangeMe!2026";

async function login(page: Page, email = "admin@ems.local") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
}

test("3D viewer renders the GW-200 board from Gerbers and switches modes", async ({ page }) => {
  await login(page);
  await page.goto("/viewer");
  const card = page.locator("div.rounded-lg", { hasText: "GW-200 Main Board" }).first();
  await expect(card.getByText(/Gerbers loaded \(4 layers\)/)).toBeVisible();
  await expect(card.getByText(/76 placements from centroid/)).toBeVisible();
  await card.getByRole("link", { name: "Open 3D" }).click();
  await expect(page.getByText(/100\.0 × 80\.0 mm · 4 layers/)).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByLabel("Colour parts by").selectOption("worst");
  await page.getByRole("radio", { name: "Layers" }).click();
  // Each layer is in the side list (a checkbox) and labelled on the 3D stack.
  await expect(page.getByRole("checkbox", { name: "Top copper" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Inner copper L2/ })).toBeVisible();
  await expect(page.getByLabel("3D board view").getByText("Top copper")).toBeVisible();
  // Box-build opens on the closed product; exploding it brings the slider back.
  await page.getByRole("radio", { name: "Box-build" }).click();
  await expect(page.getByText("Box-build kit")).toBeVisible();
  await page.getByRole("radio", { name: "Exploded" }).click();
  await expect(page.getByLabel("Explode distance")).toBeVisible();
});

test("work order: create → clear-to-build + line fit → reserve → kitting list", async ({ page }) => {
  await login(page, "admin@ems.local");
  await page.goto("/operations/work-orders");
  const value = await page.locator("#bomRevisionId option", { hasText: "MC-48V Power Stage rev A" }).first().getAttribute("value");
  await page.getByLabel("BoM revision").selectOption(value!);
  await page.getByLabel("Build qty").fill("50");
  await page.getByRole("button", { name: "Create & check clear-to-build" }).click();
  await expect(page.getByRole("heading", { name: /WO-\d{4}-\d{4}/ })).toBeVisible();
  await expect(page.getByText("Clear to build").first()).toBeVisible();
  await expect(page.getByText("Which line can build it")).toBeVisible();
  await expect(page.getByText(/feeder slots needed/).first()).toBeVisible();
  await page.getByRole("button", { name: "Reserve stock" }).click();
  await expect(page.getByText(/Reserved stock for \d+ lines/)).toBeVisible();
  await expect(page.getByText(/Kitting list \(\d+\)/)).toBeVisible();
  await expect(page.getByRole("cell", { name: /^CONS-KD-/ }).first()).toBeVisible(); // consigned stock picked first
});

test("inventory: MSL bag open/close and receive", async ({ page }) => {
  await login(page, "stores@ems.local");
  await page.goto("/inventory?f=msl");
  await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
  const row = page.locator("tbody tr").first();
  await row.getByRole("button", { name: "Close bag" }).click();
  await expect(page.getByText(/Into dry storage — clock paused/)).toBeVisible();

  await page.goto("/inventory");
  await page.getByLabel("MPN").fill("LM358DR");
  await page.getByLabel("Bin").fill("E2E-01");
  await page.getByLabel("Qty").fill("250");
  await page.getByRole("button", { name: "Receive" }).click();
  await expect(page.getByText(/Received 250 × LM358DR into E2E-01/)).toBeVisible();
});

test("compliance report, Excel export, alerts and revision diff", async ({ page }) => {
  await login(page, "quality@ems.local");
  await page.goto("/compliance");
  await expect(page.getByText("RoHS compliant")).toBeVisible();
  await expect(page.getByText("HSN duty table (indicative)")).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Excel report" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/_compliance\.xlsx$/);

  await page.goto("/alerts");
  await expect(page.getByRole("heading", { name: "Alerts" })).toBeVisible();

  // Upload rev B of the LD-60 board with one part changed and one added, then diff.
  await page.context().clearCookies(); // sign out; /login redirects a signed-in user
  await login(page, "engineering@ems.local");
  const dir = path.resolve(__dirname, "../../test-results/tmp");
  mkdirSync(dir, { recursive: true });
  const src = readFileSync(path.resolve(__dirname, "../../samples/boms/LUM-LD60_revA.csv"), "utf8")
    .replace("LM358DR,TI,Dual op-amp", "MCP6002T-I/SN,Microchip,Dual op-amp RRIO")
    .replace(/\r?\n$/, `\r\n17,D9,1,SMBJ24CA,Littelfuse,TVS 24V,SMB,\r\n`);
  const file = path.join(dir, `LD60_revB_${Date.now()}.csv`);
  writeFileSync(file, src);
  await page.goto("/boms/new");
  await page.getByLabel("BoM file").setInputFiles(file);
  await page.getByLabel("Customer").selectOption({ label: "Lumen Lighting Systems" });
  await page.getByLabel("Project / product").fill("LD-60 Constant-Current LED Driver");
  await page.getByLabel("Assembly / BoM name").fill("LD-60 Driver Board");
  await page.getByLabel("Revision").fill(`B${Date.now().toString().slice(-4)}`);
  await page.getByRole("button", { name: "Continue to column mapping" }).click();
  await page.getByRole("button", { name: "Match & score BoM" }).click();
  // Matching opens the footprint match; the BoM itself is step 1 of the strip.
  await expect(page).toHaveURL(/\/match$/, { timeout: 180_000 });
  await page.getByRole("navigation", { name: /^Process for/ }).getByRole("link", { name: /^(1\s*)?BoM\b/ }).click();
  // Comparing revisions lives under More on the BoM page.
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Compare revisions" }).click();
  await expect(page.getByRole("heading", { name: /→ rev B/ })).toBeVisible();
  // Runs since the last db:e2e:setup leave other LD-60 revisions behind: always compare with rev A.
  const compare = page.getByLabel("Compare with");
  if (await compare.count()) {
    await compare.selectOption({ label: "rev A" });
    await page.getByRole("button", { name: "Show" }).click();
  }
  await expect(page.getByRole("heading", { name: /^rev A → rev B/ })).toBeVisible();
  await expect(page.getByText("Part changed").first()).toBeVisible();
  await expect(page.getByText("MCP6002T-I/SN").first()).toBeVisible();
  await expect(page.getByText(/^Added$/).first()).toBeVisible();
});
