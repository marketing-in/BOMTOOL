import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.SEED_USER_PASSWORD ?? "ChangeMe!2026";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("purchasing@ems.local");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
}

test("build & quote: choose the board, a line's source and the box, then issue and print the quote", async ({ page }) => {
  test.setTimeout(480_000);
  await login(page);
  await page.goto("/boms");
  await page.getByText("GW-200 Main Board").first().click();
  const steps = page.getByRole("navigation", { name: /^Process for/ });
  const onThisPage = page.getByRole("navigation", { name: "On this page" });

  // 1 · Bare board — step 5: fabs with prices per quantity; choose one and type in its quote.
  await steps.getByRole("link", { name: /Bare board/ }).click();
  await expect(page).toHaveURL(/\/build\/board$/);
  await expect(page.getByRole("heading", { level: 1, name: "5. Bare board" })).toBeVisible();
  const bare = page.getByRole("region", { name: "Bare board", exact: true });
  await expect(bare.getByRole("heading", { name: "Where the bare board comes from" })).toBeVisible();
  const chennai = bare.getByRole("row", { name: /Chennai Circuits/ });
  // Re-runs on the same database find it chosen already.
  const chooseFab = chennai.getByRole("button", { name: /^(Choose|Confirm)$/ });
  if (await chooseFab.count()) await chooseFab.click();
  await expect(chennai.getByText("Chosen")).toBeVisible();
  await chennai.getByRole("button", { name: /^(Enter|Change) their quote$/ }).click();
  await chennai.getByLabel("₹ per board, landed").fill("150");
  await chennai.getByLabel("Tooling ₹").fill("4000");
  await chennai.getByLabel("Lead, days").fill("10");
  await chennai.getByRole("button", { name: "Save quote" }).click();
  await expect(chennai.getByText("Their quote")).toBeVisible();

  // 2 · Components — step 6: pick a line, use a distributor offer for it.
  await steps.getByRole("link", { name: /Components/ }).click();
  await expect(page).toHaveURL(/\/build\/parts$/);
  await expect(page.getByRole("heading", { name: "Where it comes from — choose a source" })).toBeVisible();
  const lines = page.getByRole("list", { name: "BoM lines" });
  await lines.getByRole("link").nth(1).click();
  // Wait for line 2's own details before choosing, not the first line's still on screen.
  await expect(page).toHaveURL(/line=/);
  await expect(page.getByRole("heading", { level: 2, name: /^Line 2 / })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Risk analysis" })).toBeVisible();
  await page.getByRole("button", { name: "Use", exact: true }).first().click();
  await expect(page.getByText("Chosen", { exact: true }).first()).toBeVisible();
  await expect(lines.getByRole("link").nth(1).getByText(/· chosen/)).toBeVisible();

  // 3 · Box — no longer a step: reached from the box gate of step 7; the extruded type, a catalogue box that fits.
  await steps.getByRole("link", { name: /Estimate & quote/ }).click();
  await expect(page).toHaveURL(/\/feasibility$/);
  const boxGate = page.locator("li#gate-box");
  await boxGate.locator("summary").click();
  await boxGate.getByRole("link", { name: /Box step/ }).first().click();
  await expect(page).toHaveURL(/\/build\/box$/);
  await expect(page.getByRole("navigation", { name: "Box types" })).toBeVisible();
  await page.getByRole("link", { name: /^Extruded aluminium/ }).click();
  const box = page.getByRole("row", { name: /Hammond 1455N1201/ });
  const chooseBox = box.getByRole("button", { name: /^(Choose|Confirm)$/ });
  if (await chooseBox.count()) await chooseBox.click();
  await expect(box.getByText("Chosen")).toBeVisible();

  // 4 · Quote — section 7.2 of step 7: the choices so far, price per board at each quantity, then issue it and open the client's copy.
  await steps.getByRole("link", { name: /Estimate & quote/ }).click();
  await onThisPage.getByRole("link", { name: /Quote/ }).click();
  const choices = page.getByRole("region", { name: "Your choices so far" });
  await expect(choices.getByText(/Chennai Circuits/)).toBeVisible();
  await expect(choices.getByText(/1455N1201/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "What one board costs, by quantity" })).toBeVisible();
  await expect(page.getByText("per board, ex-GST").first()).toBeVisible();
  await page.getByRole("button", { name: "Issue quote" }).click();
  await page.getByRole("button", { name: "Confirm — issue to the client" }).click();
  await expect(page).toHaveURL(/\/build\/print\?q=/, { timeout: 60_000 });
  await expect(page.getByText(/^CQ-\d{4}-\d{4}$/)).toBeVisible();
  await expect(page.getByText("Unit price")).toBeVisible();
  await expect(page.getByText("Hammond 1455N1201", { exact: false })).toBeVisible();
});
