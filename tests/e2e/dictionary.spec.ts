import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.SEED_USER_PASSWORD ?? "ChangeMe!2026";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("engineering@ems.local");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
}

test("dictionary: search → entry with circuit and alternatives; machine entry; circuits; parts hint", async ({ page }) => {
  await signIn(page);

  await page.goto("/knowledge/dictionary?q=AMS1117");
  await expect(page.getByText(/results? for “AMS1117”/)).toBeVisible();
  await page.getByRole("link", { name: /LDO linear regulator/ }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "LDO linear regulator" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Application circuit — LDO regulator/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /^LDO regulator\./ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Alternatives & substitution" })).toBeVisible();
  // Equivalents search our catalogue, without the maker note.
  await page.getByRole("link", { name: "LM1117-3.3 (TI)" }).click();
  await expect(page).toHaveURL(/\/parts\?q=LM1117-3\.3$/);

  await page.goto("/knowledge/dictionary/reflow-oven");
  await expect(page.getByRole("heading", { level: 1, name: "Reflow oven" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Factory flow, Reflow highlighted" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Maintenance" })).toBeVisible();

  await page.goto("/knowledge/circuits?set=power");
  await expect(page.getByRole("heading", { name: "Synchronous buck converter" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Signal, sensing & control" })).toHaveCount(0);

  await page.goto("/parts?q=LDO");
  await expect(page.getByText("In the dictionary:")).toBeVisible();
  await expect(page.getByRole("link", { name: "LDO linear regulator" })).toBeVisible();
});

test("alternates: a parametric suggestion can be approved and removed again", async ({ page }) => {
  await signIn(page);
  await page.goto("/parts?q=GRM155R71C104KA88D");
  await page.getByRole("link", { name: "GRM155R71C104KA88D" }).first().click();
  await expect(page.getByText(/Suggested from parameters/)).toBeVisible();

  const comparison = page.getByRole("list", { name: /^How .+ compares$/ }).first();
  const label = (await comparison.getAttribute("aria-label")) ?? "";
  const mpn = label.replace(/^How (.+) compares$/, "$1");
  expect(mpn).not.toBe("");
  const row = page.locator("li", { has: page.getByRole("list", { name: label }) });
  await expect(row.getByText(/footprint change|Same package/)).toBeVisible();

  await row.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/Approved as a (drop-in|pin-to-pin|functional) alternate\./)).toBeVisible();
  const remove = page.getByRole("button", { name: `Remove ${mpn} as an alternate` });
  await expect(remove).toBeVisible();
  await expect(page.getByText(/Approved by engineering@ems\.local/).first()).toBeVisible();

  // Clean up: two-step remove.
  await remove.click();
  await page.getByRole("button", { name: `Confirm removing ${mpn} as an alternate` }).click();
  await expect(page.getByText("Alternate removed.")).toBeVisible();
  await expect(page.getByRole("button", { name: `Remove ${mpn} as an alternate` })).toHaveCount(0);
});

test("3D explorers and the home page", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Know every part" })).toBeVisible();

  await page.goto("/knowledge/explore?view=pcb&preset=hdi");
  await expect(page.getByRole("heading", { name: "Inside the board and the chip" })).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible();
  await expect(page.getByRole("radio", { name: "HDI 1+4+1" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: /^Microvia/ }).click();
  await expect(page.getByText(/Laser-drilled, ≤150 µm/)).toBeVisible();
  await page.getByRole("radio", { name: "2-layer" }).click();
  await expect(page.getByText("2 copper layers · ≈ 1.64 mm finished")).toBeVisible();

  await page.getByRole("link", { name: /Inside a chip package/ }).click();
  await page.getByRole("radio", { name: "Flip-chip BGA with lid" }).click();
  await expect(page.getByText(/flipped face-down onto the substrate/)).toBeVisible();
  await page.getByRole("button", { name: "Underfill" }).click();
  await expect(page.getByText(/wicked under the die/)).toBeVisible();

  await page.getByRole("link", { name: /Inside the silicon/ }).click();
  await page.getByRole("button", { name: /Aluminium bond pads/ }).click();
  await expect(page.getByText(/cratering/)).toBeVisible();
});
