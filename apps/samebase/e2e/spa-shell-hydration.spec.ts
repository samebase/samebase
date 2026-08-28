import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const hydrationErrorPattern =
  /Minified React error #(41[8-9]|42[0-5])\b|hydration|server rendered HTML/i;

test("built SPA fallback hydrates its requested route without recovery", async ({ page }) => {
  const shell = await readFile(new URL("../dist/client/index.html", import.meta.url), "utf8");
  const hydrationErrors: string[] = [];

  await page.route(/\/vault\/samebase\/samebase$/, async (route) => {
    if (!route.request().isNavigationRequest()) return route.continue();
    await route.fulfill({ body: shell, contentType: "text/html", status: 200 });
  });
  page.on("console", (message) => {
    if (message.type() === "error" && hydrationErrorPattern.test(message.text())) {
      hydrationErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (hydrationErrorPattern.test(error.message)) hydrationErrors.push(error.message);
  });

  await page.goto("/vault/samebase/samebase", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("route-url-editor-display")).toHaveValue(
    "/vault/samebase/samebase",
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

  expect(hydrationErrors).toEqual([]);
});
