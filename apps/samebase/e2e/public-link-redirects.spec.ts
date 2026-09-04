import { expect, test } from "@playwright/test";
import { SAMEBASE_PUBLIC_LINKS } from "../src/lib/publicLinks";

test("each short Samebase path redirects to its official destination", async ({ request }) => {
  for (const link of [
    ...Object.values(SAMEBASE_PUBLIC_LINKS),
    { ...SAMEBASE_PUBLIC_LINKS.youtube, path: "/YouTube" },
  ]) {
    const response = await request.get(link.path, { maxRedirects: 0 });

    expect(response.status()).toBe(307);
    expect(response.headers()["location"]).toBe(link.destination);
  }
});
