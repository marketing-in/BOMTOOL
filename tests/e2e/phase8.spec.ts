import { readdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.SEED_USER_PASSWORD ?? "ChangeMe!2026";

async function login(page: Page, email = "admin@ems.local") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
}

async function openGw200(page: Page) {
  await page.goto("/boms");
  await page.getByText("GW-200 Main Board").first().click();
  await expect(page.getByText("To buy, landed")).toBeVisible();
}

test("distributor search → add to catalogue → part page with availability tiers and risk", async ({ page }) => {
  test.setTimeout(360_000);
  await login(page);
  await page.goto("/parts/browse");
  await expect(page.getByRole("heading", { name: "Parts catalogue" })).toBeVisible();

  // Keys are blank in e2e, so the simulated market answers — NE555DR is a real part we don't stock yet.
  await page.goto("/parts/market?q=NE555DR");
  const add = page.getByRole("button", { name: "Add NE555DR to the catalogue" });
  const known = page.getByRole("link", { name: "In our catalogue" }).first();
  await expect(add.or(known)).toBeVisible();
  if (await add.isVisible()) await add.click();
  else await known.click();

  await expect(page).toHaveURL(/\/parts\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: "NE555DR" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Availability" })).toBeVisible();
  await expect(page.getByText("Our inventory").first()).toBeVisible();
  await expect(page.getByText("Risk analysis").first()).toBeVisible();
});

test("process route → show a step in 3D → the finished product in its box", async ({ page }) => {
  test.setTimeout(360_000);
  await login(page);
  await openGw200(page);
  // The process route is section 4.2 of step 4, Line possible.
  await page.getByRole("navigation", { name: /^Process for/ }).getByRole("link", { name: /Line possible/ }).click();
  await expect(page).toHaveURL(/\/boms\/[a-z0-9]+\/lines$/);
  await page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: /Process route/ }).click();
  await expect(page).toHaveURL(/\/lines#route$/);
  await expect(page.getByRole("heading", { name: "Process route — GW-200 Industrial IoT Gateway" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pick and place" })).toBeVisible();

  // X-ray only for parts with hidden joints; its "Show in 3D" opens the viewer with that step picked.
  // The route is drawn as a chain of icons; each step is a slim row that opens to its reason, parts and links.
  await expect(page.getByRole("list", { name: "The process, step by step" })).toBeVisible();
  const xray = page.locator("li#xray-top");
  const why = xray.getByText(/solder underneath the body/);
  if (!(await why.isVisible())) await xray.locator("summary").click();
  await expect(why).toBeVisible();
  await xray.getByRole("link", { name: "Show in 3D →" }).click();
  await expect(page).toHaveURL(/\/viewer\?step=xray-top/);
  await expect(page.getByRole("button", { name: "X-ray inspection", expanded: true })).toBeVisible();

  await page.getByRole("radio", { name: "Box-build" }).click();
  await expect(page.getByRole("heading", { name: "GW-200 Industrial IoT Gateway", exact: true })).toBeVisible();
  await expect(page.getByText("Box-build kit")).toBeVisible();
  await page.getByRole("radio", { name: "Exploded" }).click();
  await expect(page.getByLabel("Explode distance")).toBeVisible();
});

test("quick look at uploaded Gerbers, no BoM needed", async ({ page }) => {
  test.setTimeout(360_000);
  await login(page);
  await page.goto("/viewer/new");
  await expect(page.getByRole("heading", { name: "Quick look at a board" })).toBeVisible();
  const dir = path.join(process.cwd(), "samples", "board", "GW-200");
  const gerbers = readdirSync(dir)
    .filter((f) => !f.endsWith(".csv"))
    .map((f) => path.join(dir, f));
  await page.getByLabel("Gerber files or zip").setInputFiles(gerbers);
  await page.getByLabel("Board name").fill("E2E quick look");
  await page.getByRole("button", { name: "Show it in 3D" }).click();
  await expect(page).toHaveURL(/\/viewer\/boards\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: "E2E quick look" })).toBeVisible();
  await expect(page.getByText(/copper layers/)).toBeVisible();
});

test("deep analysis: verdict, actions, risks and cost", async ({ page }) => {
  test.setTimeout(360_000);
  await login(page);
  await openGw200(page);
  await page.getByRole("link", { name: "Analysis", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Deep analysis — GW-200 Industrial IoT Gateway" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^(Not ready to build|Buildable, with care|Ready to build)$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What to do first" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Riskiest lines" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Where the money goes" })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Lines by source:/ })).toBeVisible();
});
