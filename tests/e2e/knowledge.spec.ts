import { expect, test } from "@playwright/test";

const PASSWORD = process.env.SEED_USER_PASSWORD ?? "ChangeMe!2026";

test("knowledge: search → article → process player; part page links to its article", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("engineering@ems.local");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ })).toBeVisible();

  await page.goto("/knowledge?q=moisture baking");
  await expect(page.getByText(/articles? for “moisture baking”/)).toBeVisible();
  await page.getByRole("link", { name: /Moisture sensitivity \(MSL\)/ }).first().click();
  await expect(page.getByRole("heading", { name: /Moisture sensitivity/ })).toBeVisible();
  await expect(page.getByText("J-STD-033").first()).toBeVisible();

  // Process player: PCB fabrication steps through with the Next button.
  await page.goto("/knowledge/pcb-fab-process");
  const player = page.getByRole("region", { name: /PCB fabrication process player/ });
  await expect(player.getByText("1/16")).toBeVisible();
  await player.getByRole("button", { name: "Next step" }).click();
  await player.getByRole("button", { name: "Next step" }).click();
  await expect(player.getByText("3/16")).toBeVisible();
  await expect(player.getByRole("heading", { name: "Photoresist & imaging" })).toBeVisible();

  // Stack-up explorer reacts to the layer count.
  await page.goto("/knowledge/pcb-stackup-impedance");
  await page.getByLabel("Layers").selectOption("6");
  await expect(page.getByRole("list", { name: "6-layer stack-up" })).toBeVisible();

  // A part page links to its category article.
  await page.goto("/parts?q=GRM188R71H104KA93D");
  await page.getByRole("link", { name: "GRM188R71H104KA93D" }).first().click();
  // The articles sit in the folded "Learn" panel.
  await page.locator("summary", { has: page.getByRole("heading", { name: "Learn", exact: true }) }).click();
  await page.getByRole("link", { name: /Ceramic capacitors \(MLCC\)/ }).click();
  await expect(page.getByRole("heading", { name: "Ceramic capacitors (MLCC)" })).toBeVisible();
  await expect(page.getByText(/DC bias/).first()).toBeVisible();
});
