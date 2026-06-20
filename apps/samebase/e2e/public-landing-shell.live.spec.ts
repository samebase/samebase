import { expect, test } from "@playwright/test";

type LandingReloadFrame = {
  content: {
    left: number;
    top: number;
    height: number;
  } | null;
  copy: {
    left: number;
    top: number;
    height: number;
  } | null;
};

declare global {
  interface Window {
    __landingReloadFrames?: LandingReloadFrame[];
  }
}

async function installLandingFrameCapture(page: Parameters<typeof test>[0]["page"]) {
  await page.addInitScript(() => {
    const sampleCount = 60;
    const maxAttempts = 300;
    const frameStore: LandingReloadFrame[] = [];
    window.__landingReloadFrames = frameStore;

    const readRect = (node: Element | null) => {
      if (!(node instanceof HTMLElement)) {
        return null;
      }

      const rect = node.getBoundingClientRect();
      return {
        left: Number(rect.left.toFixed(3)),
        top: Number(rect.top.toFixed(3)),
        height: Number(rect.height.toFixed(3)),
      };
    };

    let attempts = 0;
    const capture = () => {
      const frame = {
        content: readRect(document.querySelector('[data-testid="public-landing-content"]')),
        copy: readRect(document.querySelector('[data-testid="public-landing-copy"]')),
      };
      if (frame.content !== null && frame.copy !== null) {
        frameStore.push(frame);
      }
      attempts += 1;
      if (frameStore.length >= sampleCount || attempts >= maxAttempts) {
        return;
      }
      requestAnimationFrame(capture);
    };

    requestAnimationFrame(capture);
  });
}

async function readLandingFrames(page: Parameters<typeof test>[0]["page"]) {
  try {
    await page.waitForFunction(() => (window.__landingReloadFrames?.length ?? 0) >= 10, {
      timeout: 5_000,
    });
  } catch {
    // The assertion below reports how many stable-content frames were captured.
  }

  return await page.evaluate(() => {
    const landingReloadFrames = window.__landingReloadFrames;

    return Array.isArray(landingReloadFrames) ? landingReloadFrames : [];
  });
}

async function captureLandingReloadFrames(
  page: Parameters<typeof test>[0]["page"],
  path?: string,
): Promise<LandingReloadFrame[]> {
  await installLandingFrameCapture(page);

  if (path !== undefined) {
    await page.goto(path, { waitUntil: "networkidle" });
  }
  await page.reload({ waitUntil: "networkidle" });

  return await readLandingFrames(page);
}

async function captureLandingFirstLoadFrames(
  page: Parameters<typeof test>[0]["page"],
  path: string,
): Promise<LandingReloadFrame[]> {
  await installLandingFrameCapture(page);
  await page.goto(path, { waitUntil: "networkidle" });

  return await readLandingFrames(page);
}

function expectStableLandingFrames(
  frames: LandingReloadFrame[],
  { includeHorizontal = false }: { includeHorizontal?: boolean } = {},
) {
  const visibleFrames = frames.flatMap((frame) => {
    if (frame.content === null || frame.copy === null) {
      return [];
    }
    return [frame];
  });

  expect(visibleFrames.length).toBeGreaterThanOrEqual(10);

  const contentLeftValues = visibleFrames.map((frame) => frame.content!.left);
  const contentTopValues = visibleFrames.map((frame) => frame.content!.top);
  const copyLeftValues = visibleFrames.map((frame) => frame.copy!.left);
  const copyTopValues = visibleFrames.map((frame) => frame.copy!.top);
  const copyHeightValues = visibleFrames.map((frame) => frame.copy!.height);

  if (includeHorizontal) {
    expect(Math.max(...contentLeftValues) - Math.min(...contentLeftValues)).toBeLessThanOrEqual(1);
    expect(Math.max(...copyLeftValues) - Math.min(...copyLeftValues)).toBeLessThanOrEqual(1);
  }
  expect(Math.max(...contentTopValues) - Math.min(...contentTopValues)).toBeLessThanOrEqual(1);
  expect(Math.max(...copyTopValues) - Math.min(...copyTopValues)).toBeLessThanOrEqual(1);
  expect(Math.max(...copyHeightValues) - Math.min(...copyHeightValues)).toBeLessThanOrEqual(1);
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

  expectStableLandingFrames(reloadFrames);
});

test("local landing first load keeps the password auth slot stable on the dev server", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-desktop",
    "Reported first-load shift is on the desktop dev-server landing page.",
  );

  await page.addInitScript(() => {
    localStorage.removeItem("samebase_public_landing_password_auth_mode");
  });

  const firstLoadFrames = await captureLandingFirstLoadFrames(page, "/");

  expectStableLandingFrames(firstLoadFrames, { includeHorizontal: true });
  await expect(page.getByRole("button", { name: "Autofill & sign in" })).toBeVisible();
});

test("public landing keeps the mobile sidebar header hidden", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-mobile",
    "Mobile carousel state is only visible in the mobile project.",
  );

  await page.goto("/?dev", { waitUntil: "networkidle" });
  const shell = page.locator('[data-workspace-layout-v2="responsive"]');

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

  expectStableLandingFrames(reloadFrames);
});
