import { readdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.SEED_USER_PASSWORD ?? "ChangeMe!2026";
const GW200 = path.join(process.cwd(), "samples", "board", "GW-200");
const gerbers = () => readdirSync(GW200).map((f) => path.join(GW200, f));

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("purchasing@ems.local");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
}

test("Delete: remove a BoM's Gerbers, delete the BoM, delete a quick look", async ({ page }) => {
  test.setTimeout(480_000);
  await login(page);

  // A throwaway BoM made from Gerbers alone.
  const project = `E2E delete ${Date.now().toString(36).slice(-5)}`;
  await page.goto("/boms/new");
  await page.getByLabel("Board files").setInputFiles(gerbers());
  await page.getByLabel("Project / product").fill(project);
  await page.getByLabel("Assembly / BoM name").fill("Throwaway board");
  await page.getByLabel("Revision").fill("X");
  await page.getByRole("button", { name: "Read the board and check the process" }).click();
  await expect(page).toHaveURL(/\/match$/, { timeout: 180_000 });

  // 1 · Remove its board files on the Gerber step: the BoM stays, the board falls back to the spec.
  await page.getByRole("navigation", { name: /^Process for/ }).getByRole("link", { name: /Gerber/ }).click();
  await page.getByRole("button", { name: "Remove board files" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove board files" }).click();
  await expect(page.getByText("No Gerbers — the board is drawn from the project spec")).toBeVisible({ timeout: 60_000 });

  // 2 · Delete the BoM from its More menu: typing the revision unlocks the button.
  await page.getByRole("navigation", { name: /^Process for/ }).getByRole("link", { name: /BoM/ }).first().click();
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Delete this BoM…" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/this is its only revision/)).toBeVisible();
  const confirm = dialog.getByRole("button", { name: "Delete the BoM" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Type X to confirm").fill("X");
  await confirm.click();
  await expect(page).toHaveURL(/\/boms$/, { timeout: 60_000 });
  await expect(page.getByText("Throwaway board")).toHaveCount(0);

  // 3 · A quick look, deleted from its own page.
  await page.goto("/viewer/new");
  await page.getByLabel("Gerber files or zip").setInputFiles(gerbers().filter((f) => !f.endsWith(".csv")));
  await page.getByLabel("Board name").fill(project);
  await page.getByRole("button", { name: "Show it in 3D" }).click();
  await expect(page).toHaveURL(/\/viewer\/boards\/[a-z0-9]+$/, { timeout: 120_000 });
  await page.getByRole("button", { name: `Delete quick look ${project}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete quick look" }).click();
  await expect(page).toHaveURL(/\/viewer$/, { timeout: 60_000 });
  await expect(page.getByText(project)).toHaveCount(0);
});
