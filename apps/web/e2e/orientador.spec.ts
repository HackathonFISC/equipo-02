import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, expectNoSeriousAxeViolations } from "./helpers";

test("anonymous visitors are sent to sign in before reaching the counselor surface", async ({ page }) => {
  await page.goto("/orientador");
  await expect(page).toHaveURL(/\/ingresar\?next=%2Forientador/);
  await expect(page.locator("main")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoSeriousAxeViolations(page);
});

test("the draft review route is also protected", async ({ page }) => {
  await page.goto("/orientador/borrador-1");
  await expect(page).toHaveURL(/\/ingresar/);
});
