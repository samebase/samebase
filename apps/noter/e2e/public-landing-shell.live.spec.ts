import { expect, test } from "@playwright/test";

type LandingReloadFrame = {
  content: {
    top: number;
    height: number;
  } | null;
  copy: {
    top: number;
    height: number;
  } | null;
};

async function captureLandingReloadFrames(
  page: Parameters<typeof test>[0]["page"],
): Promise<LandingReloadFrame[]> {
  await page.addInitScript(() => {
    const sampleCount = 60;
    const frameStore: LandingReloadFrame[] = [];
    (
      window as typeof window & {
        __landingReloadFrames?: LandingReloadFrame[];
      }
    ).__landingReloadFrames = frameStore;

    const readRect = (node: Element | null) => {
      if (!(node instanceof HTMLElement)) {
        return null;
      }

      const rect = node.getBoundingClientRect();
      return {
        top: Number(rect.top.toFixed(3)),
        height: Number(rect.height.toFixed(3)),
      };
    };

    let frame = 0;
    const capture = () => {
      frameStore.push({
        content: readRect(
          document.querySelector('[data-testid="public-landing-content"]'),
        ),
        copy: readRect(
          document.querySelector('[data-testid="public-landing-copy"]'),
        ),
      });
      frame += 1;
      if (frame >= sampleCount) {
        return;
      }
      requestAnimationFrame(capture);
    };

    requestAnimationFrame(capture);
  });

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  return await page.evaluate(() => {
    const landingReloadFrames = (
      window as typeof window & {
        __landingReloadFrames?: LandingReloadFrame[];
      }
    ).__landingReloadFrames;

    return Array.isArray(landingReloadFrames) ? landingReloadFrames : [];
  });
}

test("local landing reload keeps the password auth slot stable on the dev server", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("button", { name: "Autofill & sign in" }),
  ).toBeVisible();

  const reloadFrames = await captureLandingReloadFrames(page);
  const visibleFrames = reloadFrames.flatMap((frame) => {
    if (frame.content === null || frame.copy === null) {
      return [];
    }
    return [frame];
  });

  expect(visibleFrames.length).toBeGreaterThanOrEqual(10);

  const contentTopValues = visibleFrames.map((frame) => frame.content!.top);
  const copyHeightValues = visibleFrames.map((frame) => frame.copy!.height);

  expect(
    Math.max(...contentTopValues) - Math.min(...contentTopValues),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.max(...copyHeightValues) - Math.min(...copyHeightValues),
  ).toBeLessThanOrEqual(1);
});
