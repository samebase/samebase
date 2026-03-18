import { expect, test } from "@playwright/test";

test("logo svg parity fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.goto("/visual-fixture.html?mode=logo-svg-parity", {
    waitUntil: "domcontentloaded",
  });

  const fixture = page.getByTestId("logo-svg-visual-fixture");
  const reference = page.getByTestId("logo-svg-parity-reference");
  const image = page.getByTestId("logo-svg-parity-svg");

  await expect(fixture).toBeVisible();
  await expect(reference).toBeVisible();
  await expect(image).toBeVisible();

  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const mismatchPixels = await page.evaluate(async () => {
    const referenceElement = document.querySelector(
      '[data-testid="logo-svg-parity-reference"]',
    );
    const imageElement = document.querySelector(
      '[data-testid="logo-svg-parity-svg"]',
    );

    if (!(referenceElement instanceof HTMLCanvasElement)) {
      throw new Error("Missing canvas reference element.");
    }

    if (!(imageElement instanceof HTMLImageElement)) {
      throw new Error("Missing SVG image element.");
    }

    if (!imageElement.complete) {
      await new Promise<void>((resolve) => {
        imageElement.addEventListener("load", () => resolve(), { once: true });
        imageElement.addEventListener("error", () => resolve(), { once: true });
      });
    }

    if (typeof imageElement.decode === "function") {
      try {
        await imageElement.decode();
      } catch {
        // Some browsers reject decode() for already-decoded SVG data URLs.
      }
    }

    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });

    const referenceContext = referenceElement.getContext("2d", {
      willReadFrequently: true,
    });
    if (!referenceContext) {
      throw new Error("Missing canvas reference context.");
    }

    const compareCanvas = document.createElement("canvas");
    compareCanvas.width = referenceElement.width;
    compareCanvas.height = referenceElement.height;
    const compareContext = compareCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!compareContext) {
      throw new Error("Missing compare canvas context.");
    }

    compareContext.clearRect(0, 0, compareCanvas.width, compareCanvas.height);
    compareContext.drawImage(
      imageElement,
      0,
      0,
      compareCanvas.width,
      compareCanvas.height,
    );

    const referenceData = referenceContext.getImageData(
      0,
      0,
      referenceElement.width,
      referenceElement.height,
    ).data;
    const compareData = compareContext.getImageData(
      0,
      0,
      compareCanvas.width,
      compareCanvas.height,
    ).data;

    let mismatches = 0;
    for (let index = 0; index < referenceData.length; index += 4) {
      if (
        referenceData[index] !== compareData[index] ||
        referenceData[index + 1] !== compareData[index + 1] ||
        referenceData[index + 2] !== compareData[index + 2] ||
        referenceData[index + 3] !== compareData[index + 3]
      ) {
        mismatches += 1;
      }
    }

    return mismatches;
  });

  expect(mismatchPixels).toBe(0);

  await expect(fixture).toHaveScreenshot("logo-svg-parity.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
});
