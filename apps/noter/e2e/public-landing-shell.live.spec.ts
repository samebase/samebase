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

declare global {
  interface Window {
    __landingReloadFrames?: LandingReloadFrame[];
  }
}

async function captureLandingReloadFrames(
  page: Parameters<typeof test>[0]["page"],
  path?: string,
): Promise<LandingReloadFrame[]> {
  await page.addInitScript(() => {
    const sampleCount = 60;
    const frameStore: LandingReloadFrame[] = [];
    window.__landingReloadFrames = frameStore;

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
        content: readRect(document.querySelector('[data-testid="public-landing-content"]')),
        copy: readRect(document.querySelector('[data-testid="public-landing-copy"]')),
      });
      frame += 1;
      if (frame >= sampleCount) {
        return;
      }
      requestAnimationFrame(capture);
    };

    requestAnimationFrame(capture);
  });

  if (path !== undefined) {
    await page.goto(path, { waitUntil: "networkidle" });
  }
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  return await page.evaluate(() => {
    const landingReloadFrames = window.__landingReloadFrames;

    return Array.isArray(landingReloadFrames) ? landingReloadFrames : [];
  });
}

async function expectPathname(page: Parameters<typeof test>[0]["page"], pathname: string) {
  await expect.poll(() => new URL(page.url()).pathname).toBe(pathname);
}

async function expectSearchFlag(page: Parameters<typeof test>[0]["page"], flag: string) {
  await expect.poll(() => new URL(page.url()).searchParams.has(flag)).toBe(true);
}

test("local landing reload keeps the password auth slot stable on the dev server", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Autofill & sign in" })).toBeVisible();

  const reloadFrames = await captureLandingReloadFrames(page);
  const visibleFrames = reloadFrames.flatMap((frame) => {
    if (frame.content === null || frame.copy === null) {
      return [];
    }
    return [frame];
  });

  expect(visibleFrames.length).toBeGreaterThanOrEqual(10);

  const contentTopValues = visibleFrames.map((frame) => frame.content!.top);
  const copyTopValues = visibleFrames.map((frame) => frame.copy!.top);
  const copyHeightValues = visibleFrames.map((frame) => frame.copy!.height);

  expect(Math.max(...contentTopValues) - Math.min(...contentTopValues)).toBeLessThanOrEqual(1);
  expect(Math.max(...copyTopValues) - Math.min(...copyTopValues)).toBeLessThanOrEqual(1);
  expect(Math.max(...copyHeightValues) - Math.min(...copyHeightValues)).toBeLessThanOrEqual(1);
});

test("public landing keeps the mobile sidebar header hidden", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-mobile",
    "Mobile carousel state is only visible in the mobile project.",
  );

  await page.goto("/?dev", { waitUntil: "networkidle" });
  const shell = page.locator('[data-workspace-layout-v2="mobile"]');

  await expect(page.getByRole("button", { name: "Toggle sidebar" })).toHaveCount(0);
  await expect(shell).toHaveAttribute("data-mobile-pane", "main");
  await expectSearchFlag(page, "dev");

  await page.goto("/terms?dev", { waitUntil: "networkidle" });
  await expectPathname(page, "/terms");
  await expectSearchFlag(page, "dev");
  await expect(page.locator("body")).toContainText("Terms of Service");

  await page.goto("/privacy?dev", { waitUntil: "networkidle" });
  await expectPathname(page, "/privacy");
  await expectSearchFlag(page, "dev");
  await expect(page.locator("body")).toContainText("Privacy Policy");

  await page.goto("/?dev", { waitUntil: "networkidle" });
  await expectPathname(page, "/");
  await expectSearchFlag(page, "dev");
});

test("landing dev mode reload keeps the editable copy stable on the dev server", async ({
  page,
}) => {
  const reloadFrames = await captureLandingReloadFrames(page, "/?dev");
  const visibleFrames = reloadFrames.flatMap((frame) => {
    if (frame.content === null || frame.copy === null) {
      return [];
    }
    return [frame];
  });

  expect(visibleFrames.length).toBeGreaterThanOrEqual(10);

  const contentTopValues = visibleFrames.map((frame) => frame.content!.top);
  const copyTopValues = visibleFrames.map((frame) => frame.copy!.top);
  const copyHeightValues = visibleFrames.map((frame) => frame.copy!.height);

  expect(Math.max(...contentTopValues) - Math.min(...contentTopValues)).toBeLessThanOrEqual(1);
  expect(Math.max(...copyTopValues) - Math.min(...copyTopValues)).toBeLessThanOrEqual(1);
  expect(Math.max(...copyHeightValues) - Math.min(...copyHeightValues)).toBeLessThanOrEqual(1);
});
