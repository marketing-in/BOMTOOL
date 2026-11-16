import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.SEED_USER_PASSWORD ?? "ChangeMe!2026";

async function login(page: Page, email = "admin@ems.local") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
}

test("BoM shortages → cart → RFQ → quotes → award → PO draft", async ({ page }) => {
  test.setTimeout(480_000);
  await login(page);

  // GW-200 at 500 boards has lines to buy.
  await page.goto("/boms");
  await page.getByText("GW-200 Main Board").first().click();
  await expect(page.getByText("To buy, landed")).toBeVisible();
  await page.getByRole("button", { name: "Add shortages to cart" }).click();
  await expect(page.getByText(/short lines? added to your cart|Nothing to buy/)).toBeVisible();

  await page.goto("/sourcing/cart");
  await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();
  await expect(page.getByText("Estimated landed total")).toBeVisible();

  // Ask DigiKey and Mouser (ticked or not), create the RFQ.
  for (const name of ["DigiKey", "Mouser Electronics"]) {
    const box = page.getByRole("checkbox", { name }).or(page.locator("label", { hasText: name }).getByRole("checkbox")).first();
    if ((await box.getAttribute("data-state")) !== "checked") await box.click();
  }
  await page.getByRole("button", { name: /Create RFQ to \d+ supplier/ }).click();
  await expect(page.getByRole("heading", { name: /RFQ-\d{4}-\d{4}/ })).toBeVisible();

  // Price two suppliers from their current offers, then compare.
  for (const name of ["DigiKey", "Mouser Electronics"]) {
    const row = page.locator("li", { hasText: name }).first();
    await row.getByRole("button", { name: "From offers" }).click();
    await expect(page.getByText(/priced from current offers/).last()).toBeVisible();
  }
  await expect(page.getByText(/Compare — landed per unit/)).toBeVisible();
  await expect(page.getByText("best").first()).toBeVisible();

  // Excel export for a supplier is a real xlsx download.
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("li", { hasText: "DigiKey" }).first().getByRole("link", { name: "Sheet" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^RFQ-\d{4}-\d{4}_DIGIKEY\.xlsx$/);

  await page.getByRole("button", { name: "Award best landed" }).click();
  await expect(page.getByText(/Awarded the lowest landed cost/)).toBeVisible();
  await page.getByRole("button", { name: "Create PO drafts" }).click();
  await expect(page).toHaveURL(/\/sourcing\/pos/);
  await expect(page.getByText(/PO-\d{4}-\d{4}/).first()).toBeVisible();
});

test("sourcing overview, landed-cost calculator and part refresh", async ({ page }) => {
  test.setTimeout(360_000);
  await login(page, "purchasing@ems.local");
  await page.goto("/sourcing");
  await expect(page.getByText("Simulated market.")).toBeVisible();
  await expect(page.getByText("Nexar / Octopart")).toBeVisible();

  await page.goto("/sourcing/landed-cost");
  await page.getByLabel("Unit price").fill("1");
  await page.getByLabel("Currency", { exact: true }).selectOption("USD");
  await page.getByLabel("Quantity").fill("100");
  await page.getByLabel("Ships from (ISO)").fill("US");
  await page.getByLabel("HSN code").fill("85364100");
  await page.getByLabel("Freight % of goods").fill("3");
  await expect(page.getByText("Basic customs duty 10 %")).toBeVisible();

  await page.goto("/parts?q=LM358DR");
  await page.getByRole("link", { name: "LM358DR" }).first().click();
  await page.getByRole("button", { name: "Refresh offers" }).click();
  await expect(page.getByText(/Refreshed 1 parts/)).toBeVisible();
  await expect(page.getByText("Price history @1k")).toBeVisible();
});
