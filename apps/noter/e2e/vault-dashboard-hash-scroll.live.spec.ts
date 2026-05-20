import { expect, type Page, test } from "@playwright/test";

const PREVIOUS_REPOSITORY_HASH = "noter";
const TARGET_REPOSITORY_HASH = "tmp-flow";

type VaultHashScrollMeasurement = {
  hash: string;
  nativePreviousIdExists: boolean;
  nativeTargetIdExists: boolean;
  scrollTop: number | null;
  targetTop: number | null;
};

function vaultHashTarget(page: Page, hashId: string) {
  return page.locator(`[data-vault-dashboard-repository-hash-id="${hashId}"]`);
}

async function waitForOptionalVisible(
  locator: ReturnType<typeof vaultHashTarget>,
) {
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

async function measureVaultHashScroll(
  page: Page,
): Promise<VaultHashScrollMeasurement> {
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
          if (
            overflowY === "auto" ||
            overflowY === "overlay" ||
            overflowY === "scroll"
          ) {
            return currentElement;
          }
          currentElement = currentElement.parentElement;
        }

        return null;
      }

      const targetRect = cardRect(targetHash);
      const scrollport = scrollportForTarget();

      return {
        hash: window.location.hash,
        nativePreviousIdExists: Boolean(document.getElementById(previousHash)),
        nativeTargetIdExists: Boolean(document.getElementById(targetHash)),
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
      if (
        overflowY === "auto" ||
        overflowY === "overlay" ||
        overflowY === "scroll"
      ) {
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

test.describe("vault dashboard hash scrolling", () => {
  test("updates the active vault hash while scrolling without snapping to the anchor", async ({
    page,
  }) => {
    test.slow();

    await page.goto(`/#${TARGET_REPOSITORY_HASH}`, {
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
      throw new Error(
        "Could not measure initial vault dashboard scroll state.",
      );
    }

    await page.mouse.move(300, 500);
    await page.mouse.wheel(0, -40);

    await expect
      .poll(async () => (await measureVaultHashScroll(page)).hash)
      .toBe(`#${PREVIOUS_REPOSITORY_HASH}`);

    const afterScroll = await measureVaultHashScroll(page);
    if (afterScroll.scrollTop === null || afterScroll.targetTop === null) {
      throw new Error("Could not measure final vault dashboard scroll state.");
    }

    expect(afterScroll.scrollTop).toBeLessThan(beforeScroll.scrollTop);
    expect(afterScroll.scrollTop).toBeGreaterThan(0);
    expect(afterScroll.targetTop).toBeGreaterThan(beforeScroll.targetTop);
  });
});
