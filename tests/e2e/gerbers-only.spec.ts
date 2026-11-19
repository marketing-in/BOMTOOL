import { readdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.SEED_USER_PASSWORD ?? "ChangeMe!2026";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("purchasing@ems.local");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
}

test("Upload BoM or Gerbers: Gerbers alone start the BoM, match the footprints and open the machine check", async ({ page }) => {
  test.setTimeout(480_000);
  await login(page);
  await page.goto("/boms/new");
  await expect(page.getByRole("heading", { name: "Upload BoM or Gerbers" })).toBeVisible();

  // Only the board files — no BoM spreadsheet.
  const dir = path.join(process.cwd(), "samples", "board", "GW-200");
  await page.getByLabel("Board files").setInputFiles(readdirSync(dir).map((f) => path.join(dir, f)));
  await page.getByLabel("Project / product").fill("E2E Gerbers only");
  await page.getByLabel("Assembly / BoM name").fill("Main board");
  // A fresh revision each run, so the spec also passes on a database it has run on before.
  await page.getByLabel("Revision").fill(`G-${Date.now().toString(36).slice(-5)}`);
  await page.getByRole("button", { name: "Read the board and check the process" }).click();

  // Step 3, footprint & mismatch: the board's components are the BoM, so everything agrees…
  await expect(page).toHaveURL(/\/boms\/[a-z0-9]+\/match$/, { timeout: 180_000 });
  await expect(page.getByRole("heading", { name: "BoM and board match" })).toBeVisible();
  // …and Next goes on to step 4, "Line possible": can our machines build it?
  await page.getByRole("link", { name: /^Next: 4\. Line possible/ }).click();
  await expect(page).toHaveURL(/\/lines$/);
  await expect(page.getByRole("heading", { name: /Can our machines build it\?/ })).toBeVisible();
});
