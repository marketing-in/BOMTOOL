import { expect, test, type Page } from "@playwright/test";

// The light / dark wave with real pointer input. While a View Transition shows, the browser sends every tap to
// <html>, so these use page.mouse (raw input at a point): locator.click() waits until the switch is the hit target
// again — after the wave — and would hide a lost tap.
const PASSWORD = process.env.SEED_USER_PASSWORD ?? "ChangeMe!2026";

test.use({ colorScheme: "light" });

async function login(page: Page) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("theme-set")) {
      localStorage.setItem("theme", "light");
      sessionStorage.setItem("theme-set", "1");
    }
  });
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("admin@ems.local");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
}

const isDark = (page: Page) => page.evaluate(() => document.documentElement.classList.contains("dark"));
const waveRunning = (page: Page) => page.evaluate(() => document.documentElement.classList.contains("theme-wave"));

async function switchCentre(page: Page) {
  const box = await page.getByRole("switch", { name: "Dark mode", exact: true }).boundingBox();
  if (!box) throw new Error("no theme switch");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function settled(page: Page) {
  await expect.poll(() => waveRunning(page), { timeout: 15_000 }).toBe(false);
  await expect(page.locator(".theme-wave-layer")).toHaveCount(0);
}

test("the wave of light: a second tap mid-wave flips back, a tap elsewhere reaches the page", async ({ page }) => {
  await login(page);
  const sw = page.getByRole("switch", { name: "Dark mode", exact: true });
  const c = await switchCentre(page);

  // One tap: the theme washes over with its light layers, then nothing is left behind.
  await page.mouse.click(c.x, c.y);
  await expect.poll(() => page.evaluate(() => document.getAnimations().some((a) => a.id === "theme-wave:theme-wave-crest")), { timeout: 15_000 }).toBe(true);
  await settled(page);
  expect(await isDark(page)).toBe(true);
  await expect(sw).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("dark");

  // Two quick taps end where they started, whether the second lands before or during the wave.
  for (const gap of [40, 150, 300]) {
    const before = await isDark(page);
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(gap);
    await page.mouse.click(c.x, c.y);
    await settled(page);
    expect(await isDark(page), `two taps ${gap} ms apart`).toBe(before);
  }

  // A link pressed mid-wave still navigates (the wave finishes at once).
  const link = page.getByRole("link", { name: "Find a part" }).first();
  const box = await link.boundingBox();
  if (!box) throw new Error("no Find a part link");
  await page.mouse.click(c.x, c.y);
  await expect.poll(() => waveRunning(page)).toBe(true);
  await page.waitForTimeout(200);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForURL((u) => u.pathname === "/parts");
  await settled(page);
  // The page takes taps again: the middle of the screen hits real content, not <html>.
  expect(await page.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.tagName)).not.toBe("HTML");
});
