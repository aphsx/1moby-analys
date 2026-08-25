import { expect, test } from "@playwright/test";

test("unauthenticated visitor is redirected to /login", async ({ browser }) => {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await context.close();
});

test("dashboard loads with sidebar nav for a logged-in user", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Prediction Runs" })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Customers" })).toBeVisible();
});

test("prediction runs page loads", async ({ page }) => {
  await page.goto("/runs");
  await expect(
    page.getByRole("heading", { name: "Prediction runs" })
  ).toBeVisible();
});

test("customers page loads", async ({ page }) => {
  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
});

test("model performance page loads", async ({ page }) => {
  await page.goto("/model-performance");
  await expect(
    page.getByRole("heading", { name: "Model Metrics" })
  ).toBeVisible();
});

test("training page loads", async ({ page }) => {
  await page.goto("/training");
  await expect(
    page.getByRole("heading", { name: "Model Training" })
  ).toBeVisible();
});
