import { expect, type Page, test } from "@playwright/test";

const PREVIOUS_REPOSITORY_HASH = "noter";
const TARGET_REPOSITORY_FULL_NAME = "nicu-chiciuc/tmp-flow";
const TARGET_REPOSITORY_HASH = "tmp-flow";

type VaultHashScrollMeasurement = {
  hash: string;
  nativePreviousIdExists: boolean;
  nativeTargetIdExists: boolean;
  previousHeaderBottom: number | null;
  previousHeaderTop: number | null;
  scrollportBottom: number | null;
  scrollportTop: number | null;
  scrollTop: number | null;
  targetTop: number | null;
};

function vaultHashTarget(page: Page, hashId: string) {
  return page.locator(`[data-vault-dashboard-repository-hash-id="${hashId}"]`);
}

async function waitForOptionalVisible(locator: ReturnType<typeof vaultHashTarget>) {
  try {
    await locator.waitFor({ state: "visible", timeout: 30_000 });
    return true;
  } catch {
    return false;
  }
}

async function signInWithAutofillWhenPresent(page: Page): Promise<void> {
  const autofillButton = page.getByRole("button", {
    name: "Autofill & sign in",
  });

  try {
    await autofillButton.waitFor({ state: "visible", timeout: 5_000 });
    await autofillButton.click();
  } catch {
    // The autofill shortcut is absent once a session is already active.
  }
}

async function measureVaultHashScroll(page: Page): Promise<VaultHashScrollMeasurement> {
  return page.evaluate(
    ({ previousHash, targetHash }) => {
      function cardRect(hashId: string) {
        const element = document.querySelector(
          `[data-vault-dashboard-repository-hash-id="${CSS.escape(hashId)}"]`,
        );
        if (!(element instanceof HTMLElement)) {
          return null;
        }

        const rect = element.getBoundingClientRect();
        return {
          bottom: Math.round(rect.bottom),
          top: Math.round(rect.top),
        };
      }

      function headerRect(hashId: string) {
        const element = document.querySelector(
          `[data-vault-dashboard-repository-hash-id="${CSS.escape(hashId)}"]`,
        );
        if (!(element instanceof HTMLElement)) {
          return null;
        }

        const header = element.querySelector("[data-vault-dashboard-repository-header]");
        if (!(header instanceof HTMLElement)) {
          return null;
        }

        const rect = header.getBoundingClientRect();
        return {
          bottom: Math.round(rect.bottom),
          top: Math.round(rect.top),
        };
      }

      function scrollportForTarget() {
        const element = document.querySelector(
          `[data-vault-dashboard-repository-hash-id="${CSS.escape(targetHash)}"]`,
        );
        if (!(element instanceof HTMLElement)) {
          return null;
        }

        let currentElement = element.parentElement;
        while (currentElement) {
          const overflowY = window.getComputedStyle(currentElement).overflowY;
          if (overflowY === "auto" || overflowY === "overlay" || overflowY === "scroll") {
            return currentElement;
          }
          currentElement = currentElement.parentElement;
        }

        return null;
      }

      const targetRect = cardRect(targetHash);
      const previousHeaderRect = headerRect(previousHash);
      const scrollport = scrollportForTarget();
      const scrollportRect = scrollport?.getBoundingClientRect();

      return {
        hash: window.location.hash,
        nativePreviousIdExists: Boolean(document.getElementById(previousHash)),
        nativeTargetIdExists: Boolean(document.getElementById(targetHash)),
        previousHeaderBottom: previousHeaderRect?.bottom ?? null,
        previousHeaderTop: previousHeaderRect?.top ?? null,
        scrollportBottom: scrollportRect ? Math.round(scrollportRect.bottom) : null,
        scrollportTop: scrollportRect ? Math.round(scrollportRect.top) : null,
        scrollTop: scrollport?.scrollTop ?? null,
        targetTop: targetRect?.top ?? null,
      };
    },
    {
      previousHash: PREVIOUS_REPOSITORY_HASH,
      targetHash: TARGET_REPOSITORY_HASH,
    },
  );
}

async function alignTargetVaultToTop(page: Page): Promise<boolean> {
  return page.evaluate((targetHash) => {
    const element = document.querySelector(
      `[data-vault-dashboard-repository-hash-id="${CSS.escape(targetHash)}"]`,
    );
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    let currentElement = element.parentElement;
    while (currentElement) {
      const overflowY = window.getComputedStyle(currentElement).overflowY;
      if (overflowY === "auto" || overflowY === "overlay" || overflowY === "scroll") {
        const elementRect = element.getBoundingClientRect();
        const scrollportRect = currentElement.getBoundingClientRect();
        currentElement.scrollTop += elementRect.top - scrollportRect.top;
        return true;
      }
      currentElement = currentElement.parentElement;
    }

    return false;
  }, TARGET_REPOSITORY_HASH);
}

async function scrollVaultDashboardBy(page: Page, scrollTopDelta: number): Promise<boolean> {
  return page.evaluate(
    ({ scrollTopDelta, targetHash }) => {
      const element = document.querySelector(
        `[data-vault-dashboard-repository-hash-id="${CSS.escape(targetHash)}"]`,
      );
      if (!(element instanceof HTMLElement)) {
        return false;
      }

      let currentElement = element.parentElement;
      while (currentElement) {
        const overflowY = window.getComputedStyle(currentElement).overflowY;
        if (overflowY === "auto" || overflowY === "overlay" || overflowY === "scroll") {
          currentElement.scrollTop += scrollTopDelta;
          return true;
        }
        currentElement = currentElement.parentElement;
      }

      return false;
    },
    { scrollTopDelta, targetHash: TARGET_REPOSITORY_HASH },
  );
}

test.describe("vault dashboard hash scrolling", () => {
  test("updates the active vault hash while scrolling without snapping to the anchor", async ({
    page,
  }) => {
    test.slow();

    await page.goto(`/dashboard#${TARGET_REPOSITORY_HASH}`, {
      waitUntil: "domcontentloaded",
    });
    await signInWithAutofillWhenPresent(page);

    const previousVault = vaultHashTarget(page, PREVIOUS_REPOSITORY_HASH);
    const targetVault = vaultHashTarget(page, TARGET_REPOSITORY_HASH);

    test.skip(
      !(await waitForOptionalVisible(previousVault)),
      `Vault hash ${PREVIOUS_REPOSITORY_HASH} was not visible on dashboard`,
    );
    test.skip(
      !(await waitForOptionalVisible(targetVault)),
      `Vault hash ${TARGET_REPOSITORY_HASH} was not visible on dashboard`,
    );

    expect(await alignTargetVaultToTop(page)).toBe(true);

    await expect
      .poll(async () => {
        const measurement = await measureVaultHashScroll(page);
        return measurement.targetTop !== null && measurement.targetTop <= 34;
      })
      .toBe(true);

    const beforeScroll = await measureVaultHashScroll(page);
    expect(beforeScroll.hash).toBe(`#${TARGET_REPOSITORY_HASH}`);
    expect(beforeScroll.nativePreviousIdExists).toBe(false);
    expect(beforeScroll.nativeTargetIdExists).toBe(false);
    if (beforeScroll.scrollTop === null || beforeScroll.targetTop === null) {
      throw new Error("Could not measure initial vault dashboard scroll state.");
    }

    expect(await scrollVaultDashboardBy(page, -40)).toBe(true);

    await expect
      .poll(async () => (await measureVaultHashScroll(page)).hash)
      .toBe(`#${TARGET_REPOSITORY_HASH}`);

    const afterSmallScroll = await measureVaultHashScroll(page);
    if (afterSmallScroll.scrollTop === null || afterSmallScroll.targetTop === null) {
      throw new Error("Could not measure small-scroll dashboard state.");
    }

    expect(afterSmallScroll.scrollTop).toBeLessThan(beforeScroll.scrollTop);
    expect(afterSmallScroll.scrollTop).toBeGreaterThan(0);
    expect(afterSmallScroll.targetTop).toBeGreaterThan(beforeScroll.targetTop);

    expect(await scrollVaultDashboardBy(page, -220)).toBe(true);

    await expect
      .poll(async () => (await measureVaultHashScroll(page)).hash)
      .toBe(`#${PREVIOUS_REPOSITORY_HASH}`);

    const afterScroll = await measureVaultHashScroll(page);
    if (
      afterScroll.previousHeaderBottom === null ||
      afterScroll.previousHeaderTop === null ||
      afterScroll.scrollportBottom === null ||
      afterScroll.scrollportTop === null ||
      afterScroll.scrollTop === null
    ) {
      throw new Error("Could not measure final vault dashboard scroll state.");
    }

    expect(afterScroll.previousHeaderTop).toBeGreaterThanOrEqual(afterScroll.scrollportTop);
    expect(afterScroll.previousHeaderBottom).toBeLessThanOrEqual(afterScroll.scrollportBottom);
    expect(afterScroll.scrollTop).toBeLessThan(afterSmallScroll.scrollTop);
    expect(afterScroll.scrollTop).toBeGreaterThan(0);
  });

  test("uses the active vault hash as the delete target", async ({ page }) => {
    test.slow();

    await page.goto(`/dashboard#${TARGET_REPOSITORY_HASH}`, {
      waitUntil: "domcontentloaded",
    });
    await signInWithAutofillWhenPresent(page);

    const targetVault = vaultHashTarget(page, TARGET_REPOSITORY_HASH);
    test.skip(
      !(await waitForOptionalVisible(targetVault)),
      `Vault hash ${TARGET_REPOSITORY_HASH} was not visible on dashboard`,
    );

    const deleteLink = page.getByRole("link", {
      name: `Remove vault ${TARGET_REPOSITORY_FULL_NAME}`,
    });

    await expect(deleteLink).toHaveAttribute("href", `/dashboard?delete#${TARGET_REPOSITORY_HASH}`);

    await deleteLink.click();
    await expect(page).toHaveURL(new RegExp(`/dashboard\\?delete#${TARGET_REPOSITORY_HASH}$`));
    await expect(
      page.getByRole("heading", {
        name: `Remove Vault ${TARGET_REPOSITORY_FULL_NAME}`,
      }),
    ).toBeVisible();
  });

  test("clears delete mode when the current hash does not target a vault", async ({ page }) => {
    test.slow();

    await page.goto("/dashboard?delete", { waitUntil: "domcontentloaded" });
    await signInWithAutofillWhenPresent(page);

    const targetVault = vaultHashTarget(page, TARGET_REPOSITORY_HASH);
    test.skip(
      !(await waitForOptionalVisible(targetVault)),
      `Vault hash ${TARGET_REPOSITORY_HASH} was not visible on dashboard`,
    );

    await expect.poll(() => new URL(page.url()).searchParams.has("delete")).toBe(false);
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });
});
