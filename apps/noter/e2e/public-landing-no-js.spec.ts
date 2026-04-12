import { expect, test } from "@playwright/test";
import { APP_BUILD_STATUS_BAR_TEST_ID } from "../src/lib/appBuild";
import { PUBLIC_LANDING_COPY_TEST_ID } from "../src/lib/publicLanding";

test.use({
  javaScriptEnabled: false,
  serviceWorkers: "block",
});

test("root landing stays readable when JavaScript is blocked", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "load" });

  await expect(
    page.locator('[data-noter-static-root-landing="1"]'),
  ).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(/noter-static-js/);
  await expect(page.getByTestId(PUBLIC_LANDING_COPY_TEST_ID)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Google sign-in requires JS" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Google sign-in requires JS" }),
  ).toBeDisabled();
  await expect(page.getByPlaceholder("email@example.com")).toBeDisabled();
  await expect(
    page.getByText("Enable JavaScript to join the waitlist."),
  ).toBeVisible();
  await expect(page.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID)).toBeVisible();
  await expect(page.getByTestId(PUBLIC_LANDING_COPY_TEST_ID)).toHaveScreenshot(
    "public-landing-no-js.png",
    {
      animations: "disabled",
      maxDiffPixelRatio: 0.02,
    },
  );
});
