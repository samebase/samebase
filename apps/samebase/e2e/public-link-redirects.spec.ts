import { test } from "@playwright/test";
import { SAMEBASE_PUBLIC_LINKS } from "../src/lib/publicLinks";

test("each short Samebase path redirects to its official destination", async ({ page }) => {
  for (const link of [
    ...Object.values(SAMEBASE_PUBLIC_LINKS),
    { ...SAMEBASE_PUBLIC_LINKS.youtube, path: "/YouTube" },
  ]) {
    await page.route(link.destination, (route) =>
      route.fulfill({ contentType: "text/html", body: "" }),
    );
    await page.goto(link.path, { waitUntil: "commit" });

    await page.waitForURL(link.destination, { waitUntil: "domcontentloaded" });
  }
});
