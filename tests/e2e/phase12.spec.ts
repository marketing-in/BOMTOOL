import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.SEED_USER_PASSWORD ?? "ChangeMe!2026";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@ems.local");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
}

test("SMT line: the BoM's board runs through the line and a machine opens", async ({ page }) => {
  test.setTimeout(360_000);
  await login(page);
  await page.goto("/boms");
  await page.getByText("GW-200 Main Board").first().click();
  await expect(page.getByText("To buy, landed")).toBeVisible();
  // Step 6 of the BoM's numbered process.
  await page.getByRole("navigation", { name: /^Process for GW-200 Main Board/ }).getByRole("link", { name: /SMT line/ }).click();
  await expect(page).toHaveURL(/\/boms\/[a-z0-9]+\/line$/);
  await expect(page.getByRole("heading", { name: "6. SMT line", level: 1 })).toBeVisible();
  // The board runs on the line the line fit picks: its name heads the section.
  await expect(page.getByRole("region", { name: "SMT line" }).getByRole("heading", { level: 2, name: /^SMT Line \d/ })).toBeVisible();
  await page.getByRole("button", { name: "Run production" }).click();
  await expect(page.getByRole("button", { name: "Pause production" })).toBeVisible();
  await page.getByRole("button", { name: "Open Pick-and-place" }).click();
  await expect(page.getByText(/Fiducial check/).first()).toBeVisible();
});

test("directory: families, laminates, board type, box materials and the product's types", async ({ page }) => {
  test.setTimeout(360_000);
  await login(page);
  await page.goto("/directory");
  await page.getByRole("link", { name: /Components/ }).first().click();
  await expect(page.getByRole("heading", { name: "Components", exact: true })).toBeVisible();
  await expect(page.getByText("Power MOSFETs")).toBeVisible();
  await page.goto("/directory/pcb?view=laminates");
  await expect(page.getByText("FR-4 high-Tg (Tg 170–180)")).toBeVisible();
  await page.goto("/directory/board-types");
  await page.getByRole("link", { name: /Arduino-class/ }).click();
  await expect(page.getByRole("heading", { name: "Review checks" })).toBeVisible();
  await page.goto("/directory/boxes?view=materials");
  await expect(page.getByText("Polycarbonate (PC)")).toBeVisible();
  await page.goto("/boms");
  await page.getByText("GW-200 Main Board").first().click();
  await page.getByRole("link", { name: "Supply chain", exact: true }).click();
  const flow = page.getByRole("navigation", { name: "This product in the directory" });
  await expect(flow.getByText("Multilayer FR-4 (4 layers)")).toBeVisible();
  await expect(flow.getByText("Extruded aluminium enclosure")).toBeVisible();
});
