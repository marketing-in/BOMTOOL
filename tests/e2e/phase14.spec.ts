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

test("Gerbers without a BoM: components read off the board, a BoM from them, a part chosen for a footprint", async ({ page }) => {
  test.setTimeout(480_000);
  await login(page);

  // 1 · Quick look: the GW-200 Gerbers alone, no pick-and-place file — every part is guessed from the pads.
  await page.goto("/viewer/new");
  const dir = path.join(process.cwd(), "samples", "board", "GW-200");
  await page.getByLabel("Gerber files or zip").setInputFiles(readdirSync(dir).filter((f) => !f.endsWith(".csv")).map((f) => path.join(dir, f)));
  await page.getByLabel("Board name").fill("E2E Gerbers only");
  await page.getByRole("button", { name: "Show it in 3D" }).click();
  await expect(page).toHaveURL(/\/viewer\/boards\/[a-z0-9]+$/, { timeout: 120_000 });
  const found = page.getByRole("region", { name: "Components on this board" });
  await expect(found.getByText(/^Guessed from the pads/)).toBeVisible();
  await expect(found.getByRole("row", { name: /^0603 Two-pad part/ }).getByRole("cell").nth(2)).toHaveText("44");
  await expect(found.getByRole("row", { name: /^SOIC-8, 1\.27 mm Integrated circuit/ })).toBeVisible();

  // 2 · Quote this board: the components become the BoM, no file needed.
  await page.getByRole("link", { name: "Quote this board →" }).click();
  await expect(page.getByRole("radio", { name: /^Use the 76 components found on the board/ })).toBeChecked();
  await page.getByLabel("Assembly / BoM name").fill("Main board");
  // A fresh revision each run, so the spec also passes on a database it has run on before.
  await page.getByLabel("Revision").fill(`E2E-${Date.now().toString(36).slice(-5)}`);
  await page.getByRole("button", { name: "Create the BoM and quote it" }).click();
  // A new BoM opens on step 4, footprint & mismatch: made from the board, every footprint agrees.
  await expect(page).toHaveURL(/\/match$/, { timeout: 180_000 });
  await expect(page.getByRole("heading", { name: "BoM and board match" })).toBeVisible();

  // 3 · Components: the 44 two-pad 0603 places need a part; give 20 of them one that fits the footprint.
  await page.getByRole("navigation", { name: /^Process for/ }).getByRole("link", { name: /Components/ }).click();
  await page.getByRole("list", { name: "BoM lines" }).getByRole("link", { name: /44\/board/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: /^Line \d+ needs a part$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Fits 0603/ })).toBeVisible();
  await page.getByRole("button", { name: "Clear" }).click();
  const designators = page.getByRole("group", { name: "Designators" }).getByRole("button");
  for (let i = 0; i < 20; i++) await designators.nth(i).click();
  await page.getByRole("button", { name: "Use for 20" }).first().click();
  // The chosen places become their own line, matched and priced; the other 24 still wait for a part.
  await expect(page.getByRole("heading", { level: 2, name: /^Line \d+ (?!needs a part)/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("list", { name: "BoM lines" }).getByRole("link", { name: /24\/board/ })).toBeVisible();
  await expect(page.getByRole("list", { name: "BoM lines" }).getByRole("link", { name: /20\/board/ })).toBeVisible();
});
