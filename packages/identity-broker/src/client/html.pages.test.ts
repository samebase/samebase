import { expect, test } from "@playwright/test";
import { pageStates } from "./html.states.test.helper.js";

// One screenshot of each page state per theme and size in `screenshots/`, so a change to a page
// shows as a changed image in its pull request.

const sizes = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1280, height: 800 },
};

for (const [name, render] of Object.entries(pageStates)) {
  for (const colorScheme of ["light", "dark"] as const) {
    for (const [size, viewport] of Object.entries(sizes)) {
      test(`${name}, ${colorScheme}, ${size}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize(viewport);
        await page.setContent(await render().text());
        await expect(page).toHaveScreenshot(`${name}-${colorScheme}-${size}.png`, {
          fullPage: true,
        });
      });
    }
  }
}
