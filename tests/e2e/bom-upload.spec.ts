import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const PASSWORD = process.env.SEED_USER_PASSWORD ?? "ChangeMe!2026";
const samples = path.resolve(__dirname, "../../samples/boms");

async function login(page: Page, email = "purchasing@ems.local") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  // First hit after a dev-server restart compiles the dashboard; allow for it.
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 90_000 });
}

/** Match & score now opens the footprint match (step 3 of the process); the BoM grid is step 1 of the strip. */
async function matchAndOpenBom(page: Page, bomName: string) {
  await page.getByRole("button", { name: "Match & score BoM" }).click();
  // Matching, scoring and pricing the first step take a while on the plant laptop.
  await expect(page).toHaveURL(/\/match$/, { timeout: 180_000 });
  // A BoM alone has no board to compare with yet.
  await expect(page.getByRole("heading", { name: "No board to compare with yet" })).toBeVisible();
  await page.getByRole("navigation", { name: /^Process for/ }).getByRole("link", { name: /^(1\s*)?BoM\b/ }).click();
  await expect(page.getByRole("heading", { name: new RegExp(bomName) })).toBeVisible();
}

async function upload(page: Page, file: string, bomName: string) {
  await page.goto("/boms/new");
  await page.getByLabel("BoM file").setInputFiles(path.join(samples, file));
  await page.getByLabel("Customer").selectOption({ label: "Nimbus IoT Pvt Ltd" });
  await page.getByLabel("Project / product").fill("E2E test project");
  await page.getByLabel("Assembly / BoM name").fill(bomName);
  await page.getByLabel("Build qty").fill("250");
  // Columns this clear are taken without asking: the upload matches the BoM and opens the footprint match (step 3).
  await page.getByRole("button", { name: "Match & score BoM" }).click();
  await expect(page).toHaveURL(/\/match$/, { timeout: 180_000 });
  // The mapping page is one click away.
  await page.getByRole("link", { name: "Check columns" }).click();
  await expect(page.getByRole("heading", { name: /Map columns/ })).toBeVisible();
}

test("Altium xlsx: header detected under title block, mapped, matched and scored", async ({ page }) => {
  await login(page);
  const name = `Sensor hub ${Date.now()}`;
  await upload(page, "SENSOR-HUB_Altium_revA.xlsx", name);

  // Header is found below the 3-line title block (blank rows are dropped while parsing) and columns are auto-mapped.
  await expect(page.locator("select").first()).toHaveValue("3");
  await expect(page.getByLabel("Field for column Manufacturer Part Number 1")).toHaveValue("mpn");
  await expect(page.getByLabel("Field for column Comment")).toHaveValue("value");
  await expect(page.getByLabel("Field for column Quantity")).toHaveValue("qty");

  await matchAndOpenBom(page, name);

  const grid = page.getByRole("table", { name: "BoM lines" });
  // Section title rows ("Power", "MCU") are skipped: 11 real lines.
  await expect(grid.locator("tbody > tr")).toHaveCount(11);
  // Exact, fuzzy (TLV70033DDCT → TLV70033DDCR) and DigiKey-suffix (-ND) matches.
  await expect(grid.getByRole("link", { name: "TPS62160DSGR" })).toBeVisible();
  await expect(grid.getByRole("link", { name: "TLV70033DDCR" })).toBeVisible();
  await expect(grid.getByRole("link", { name: "RC0603FR-0710KL" })).toBeVisible();
  // Description-only line "RES 4K7 1% 0603" matched parametrically to a 4.7 kΩ 0603.
  await expect(grid.getByRole("link", { name: "RC0603FR-074K7L" })).toBeVisible();
  // Scores rendered for matched lines.
  await expect(page.getByTitle("Availability").first()).toBeVisible();

  // Needs-review filter shows the fuzzy/parametric lines; expanding a line lists its candidates.
  await page.getByRole("radio", { name: /Needs review/ }).click();
  const reviewRows = grid.locator("tbody > tr");
  expect(await reviewRows.count()).toBeGreaterThanOrEqual(2);
  await reviewRows.first().getByRole("button", { name: "Show details" }).click();
  await expect(page.getByText("Match candidates")).toBeVisible();
  await expect(page.getByText(/Sourcing plan for/)).toBeVisible();
});

test("KiCad csv: semicolons, DNP column and value-only lines", async ({ page }) => {
  await login(page);
  const name = `Pico board ${Date.now()}`;
  await upload(page, "PICO-BOARD_KiCad.csv", name);
  await expect(page.getByLabel("Field for column Reference")).toHaveValue("refDes");
  await expect(page.getByLabel("Field for column DNP")).toHaveValue("dnp");
  await matchAndOpenBom(page, name);

  const grid = page.getByRole("table", { name: "BoM lines" });
  await expect(grid.locator("tbody > tr")).toHaveCount(7);
  await expect(grid.getByRole("link", { name: "RP2040" })).toBeVisible();
  await expect(grid.getByText("DNP", { exact: true })).toBeVisible();

  // Changing build qty re-scores the BoM.
  await page.getByLabel("Build quantity").fill("5000");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText(/Re-scored for 5,000 boards/)).toBeVisible();
});

test("viewer cannot upload", async ({ page }) => {
  await login(page, "viewer@ems.local");
  await page.goto("/boms/new");
  await expect(page.getByText(/can view BoMs but not upload/)).toBeVisible();
});
