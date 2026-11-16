import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.SEED_USER_PASSWORD ?? "ChangeMe!2026";

async function login(page: Page, email = "admin@ems.local") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
}

async function openSupplyChain(page: Page) {
  await page.goto("/boms");
  await page.getByText("GW-200 Main Board").first().click();
  await expect(page.getByText("To buy, landed")).toBeVisible();
  await page.getByRole("link", { name: "Supply chain", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Supply chain — GW-200 Industrial IoT Gateway" })).toBeVisible();
}

test("supply chain: board fabs, components by tier, box makers → BoM list beside the 3D board", async ({ page }) => {
  test.setTimeout(360_000);
  await login(page);
  await openSupplyChain(page);
  await expect(page.getByRole("heading", { name: "1 · Bare board (PCB)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "2 · Components" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "3 · Box build" })).toBeVisible();
  await expect(page.getByText("Chennai Circuits (PCB fab) — sample")).toBeVisible();
  await expect(page.getByText("Peenya CNC & powder coat — sample")).toBeVisible();

  // The 3D view is one of the BoM's other views, at the end of the strip.
  await page.getByRole("navigation", { name: /^Process for/ }).getByRole("link", { name: "3D view" }).click();
  const list = page.getByRole("list", { name: "BoM lines" });
  await expect(list).toBeVisible();
  await list.getByRole("button").filter({ hasText: "STM32G431CBU6" }).click();
  await expect(page.getByText(/^2 · Channel partners$/).first()).toBeVisible();
  await expect(list.getByRole("button", { pressed: true })).toContainText("STM32G431CBU6");
});

test("channel partner stock on the part page, and a chat with the partner", async ({ page }) => {
  test.setTimeout(360_000);
  await login(page, "purchasing@ems.local");
  await openSupplyChain(page);
  await page.getByRole("link", { name: "STM32G431CBU6" }).click();
  await expect(page.getByRole("heading", { name: "Channel partners & sourcing agents" })).toBeVisible();
  await page.locator("#tier-2").getByRole("link", { name: "Chat with seller" }).first().click();
  await expect(page.getByRole("heading", { name: "Seller chat" })).toBeVisible();
  const text = `Can you hold 500 pcs till Friday? ${Date.now()}`;
  await page.getByLabel("Message", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("list", { name: "Messages" }).getByText(text)).toBeVisible();
});
