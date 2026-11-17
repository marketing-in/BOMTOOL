import { expect, test, type Browser, type Page } from "@playwright/test";

const PASSWORD = process.env.SEED_USER_PASSWORD ?? "ChangeMe!2026";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function asAdmin(browser: Browser) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, "admin@ems.local", PASSWORD);
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  return page;
}

/** User admin is reached from the account menu: open it and return its "Users" entry (closing it with Escape is up to the caller). */
async function usersEntry(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Home", exact: true })).toBeVisible();
  return menu.getByRole("menuitem", { name: "Users", exact: true });
}

async function addUser(admin: Page, name: string, email: string, role: string, password: string) {
  await admin.getByLabel("Name").fill(name);
  await admin.getByLabel("Email").fill(email);
  await admin.getByLabel("Role", { exact: true }).selectOption(role);
  await admin.getByLabel("Starting password").fill(password);
  await admin.getByRole("button", { name: "Add user" }).click();
  await expect(admin.getByText(`Added ${name}`)).toBeVisible();
  await expect(admin.locator("tr", { hasText: email })).toBeVisible();
}

test("admin adds a user; deactivating signs them out and blocks sign-in", async ({ browser }) => {
  const admin = await asAdmin(browser);
  // Admins can't lock themselves out: no Deactivate on their own row, and their role is fixed.
  const me = admin.locator("tr", { hasText: "admin@ems.local" });
  await expect(me.getByText("You")).toBeVisible();
  await expect(me.getByRole("button", { name: "Deactivate" })).toHaveCount(0);
  await expect(me.getByRole("combobox")).toBeDisabled();

  const email = `e2e-stores-${Date.now()}@ems.local`;
  await addUser(admin, "E2E Stores", email, "STORES", "start-pass-2026");

  const user = await (await browser.newContext()).newPage();
  await signIn(user, email, "start-pass-2026");
  await expect(user.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
  await expect(await usersEntry(user)).toHaveCount(0);
  await user.keyboard.press("Escape");
  await user.goto("/admin/users");
  await expect(user.getByText("Only administrators can manage users")).toBeVisible();

  const row = admin.locator("tr", { hasText: email });
  await row.getByRole("button", { name: "Deactivate" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Deactivate" }).click();
  await expect(admin.getByText("E2E Stores is deactivated and signed out.")).toBeVisible();
  await expect(row.getByText("Deactivated")).toBeVisible();

  // Their open session ends on the next click, and they can't sign in again.
  await user.goto("/");
  await expect(user).toHaveURL(/\/login/);
  await expect(user.getByText("Your session has ended")).toBeVisible();
  await signIn(user, email, "start-pass-2026");
  await expect(user.getByText("Email or password is incorrect.")).toBeVisible();
});

test("new password ends old sessions; role changes apply without signing in again", async ({ browser }) => {
  const admin = await asAdmin(browser);
  const email = `e2e-viewer-${Date.now()}@ems.local`;
  await addUser(admin, "E2E Viewer", email, "VIEWER", "first-pass-2026");

  const user = await (await browser.newContext()).newPage();
  await signIn(user, email, "first-pass-2026");
  await expect(user.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ })).toBeVisible();

  const row = admin.locator("tr", { hasText: email });
  await row.getByRole("button", { name: "Set password" }).click();
  const dialog = admin.getByRole("dialog");
  await dialog.getByLabel("New password").fill("second-pass-2026");
  await dialog.getByRole("button", { name: "Set password" }).click();
  await expect(admin.getByText("New password set for E2E Viewer")).toBeVisible();

  await user.goto("/");
  await expect(user).toHaveURL(/\/login/);
  await signIn(user, email, "first-pass-2026");
  await expect(user.getByText("Email or password is incorrect.")).toBeVisible();
  await signIn(user, email, "second-pass-2026");
  await expect(user.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
  await expect(await usersEntry(user)).toHaveCount(0);
  await user.keyboard.press("Escape");

  // Promote to administrator: the next page load shows Users in the account menu, no sign-out needed.
  await row.getByRole("combobox").selectOption("ADMIN");
  await expect(admin.getByText("E2E Viewer is now Administrator.")).toBeVisible();
  await user.reload();
  await expect(await usersEntry(user)).toBeVisible();

  // Don't leave an active test administrator (with a password in this file) in the database.
  await row.getByRole("button", { name: "Deactivate" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Deactivate" }).click();
  await expect(row.getByText("Deactivated")).toBeVisible();
});
