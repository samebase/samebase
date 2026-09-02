import { expect, type Locator, type Page, test } from "@playwright/test";
import { signInIfNeeded } from "./liveHelpers";

const REPO_OWNER = "nicu-chiciuc";
const REPO_NAME = "tmp-main-branch-stress-20260309";
const REPOSITORY_FULL_NAME = `${REPO_OWNER}/${REPO_NAME}`;
const VAULT_DASHBOARD_ROUTE = `/repo/${REPOSITORY_FULL_NAME}`;

const BRANCHES = {
  main: "main",
  beta: "feature/beta",
  alpha: "feature/alpha",
  slash: "feature/mobile/smoke",
} as const;

const BRANCH_FILES = {
  main: "README.md",
  beta: "beta.md",
  alpha: "alpha.md",
  slash: "mobile-smoke.md",
} as const;

function encodeBranchSegment(branch: string): string {
  return encodeURIComponent(branch);
}

function buildBranchRoute(branch: string): string {
  return `/repo/${REPOSITORY_FULL_NAME}/fs/${encodeBranchSegment(branch)}`;
}

function buildFileRoute(branch: string, filePath: string): string {
  return `${buildBranchRoute(branch)}/${filePath}`;
}

async function requireVaultOrSkip(page: Page): Promise<void> {
  const vaultHeading = page.getByRole("heading", { name: REPO_NAME }).first();
  test.skip(
    (await vaultHeading.count()) === 0,
    `Vault ${REPOSITORY_FULL_NAME} was not found on dashboard`,
  );
}

async function editorTextbox(page: Page): Promise<Locator> {
  const textbox = page.getByRole("textbox").first();
  await expect(textbox).toBeVisible({ timeout: 20_000 });
  return textbox;
}

async function writeBranchFile(
  page: Page,
  branch: string,
  fileName: string,
  marker: string,
): Promise<void> {
  await page.goto(buildFileRoute(branch, fileName), {
    waitUntil: "domcontentloaded",
  });
  const textbox = await editorTextbox(page);
  const beforeText = await textbox.innerText();
  if (!beforeText.includes(marker)) {
    await textbox.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type(marker);
  }
  await expect
    .poll(async () => (await textbox.innerText()).includes(marker), {
      timeout: 10_000,
    })
    .toBe(true);
  const commitNowButton = page.getByRole("button", { name: "push" });
  await expect(commitNowButton).toBeVisible({
    timeout: 10_000,
  });
  await commitNowButton.click();
  await expect(page.getByRole("button", { name: "All Synced" })).toBeVisible({
    timeout: 30_000,
  });
}

async function readBranchFile(page: Page, branch: string, fileName: string): Promise<string> {
  await page.goto(buildFileRoute(branch, fileName), {
    waitUntil: "domcontentloaded",
  });
  const textbox = await editorTextbox(page);
  return textbox.innerText();
}

test.describe("vault exact-branch live flows", () => {
  test.describe.configure({ mode: "serial" });

  test("an exact encoded slash branch remains selected across reload", async ({ page }) => {
    await page.goto(VAULT_DASHBOARD_ROUTE);
    await signInIfNeeded(page, VAULT_DASHBOARD_ROUTE);
    await requireVaultOrSkip(page);

    await page.goto(buildBranchRoute(BRANCHES.slash), {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(
      new RegExp(`/repo/${REPO_OWNER}/${REPO_NAME}/fs/${encodeBranchSegment(BRANCHES.slash)}`),
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(
      new RegExp(`/repo/${REPO_OWNER}/${REPO_NAME}/fs/${encodeBranchSegment(BRANCHES.slash)}`),
    );
  });

  test("branch edits remain isolated and branch switching stays responsive", async ({
    page,
  }, testInfo) => {
    await page.goto(VAULT_DASHBOARD_ROUTE);
    await signInIfNeeded(page, VAULT_DASHBOARD_ROUTE);
    await requireVaultOrSkip(page);

    let beforeUnloadDialogCount = 0;
    page.on("dialog", async (dialog) => {
      if (dialog.type() !== "beforeunload") {
        await dialog.dismiss();
        throw new Error(`Unexpected dialog type: ${dialog.type()}`);
      }
      beforeUnloadDialogCount += 1;
      await dialog.accept();
    });

    const timestamp = Date.now();
    const betaMarker = `playwright beta marker ${timestamp}`;
    const alphaMarker = `playwright alpha marker ${timestamp}`;

    await writeBranchFile(page, BRANCHES.beta, BRANCH_FILES.beta, betaMarker);
    await writeBranchFile(page, BRANCHES.alpha, BRANCH_FILES.alpha, alphaMarker);

    const betaText = await readBranchFile(page, BRANCHES.beta, BRANCH_FILES.beta);
    const alphaText = await readBranchFile(page, BRANCHES.alpha, BRANCH_FILES.alpha);
    const slashText = await readBranchFile(page, BRANCHES.slash, BRANCH_FILES.slash);

    const markerObservations = {
      betaHasOwnMarker: betaText.includes(betaMarker),
      betaHasAlphaMarker: betaText.includes(alphaMarker),
      alphaHasOwnMarker: alphaText.includes(alphaMarker),
      alphaHasBetaMarker: alphaText.includes(betaMarker),
      slashHasBetaMarker: slashText.includes(betaMarker),
      slashHasAlphaMarker: slashText.includes(alphaMarker),
    };

    await testInfo.attach("branch-marker-observations", {
      body: JSON.stringify(markerObservations, null, 2),
      contentType: "application/json",
    });

    expect(markerObservations.betaHasOwnMarker).toBe(true);
    expect(markerObservations.alphaHasOwnMarker).toBe(true);
    expect(markerObservations.betaHasAlphaMarker).toBe(false);
    expect(markerObservations.alphaHasBetaMarker).toBe(false);
    expect(markerObservations.slashHasBetaMarker).toBe(false);
    expect(markerObservations.slashHasAlphaMarker).toBe(false);

    const targets = [
      buildFileRoute(BRANCHES.main, BRANCH_FILES.main),
      buildFileRoute(BRANCHES.beta, BRANCH_FILES.beta),
      buildFileRoute(BRANCHES.alpha, BRANCH_FILES.alpha),
      buildFileRoute(BRANCHES.slash, BRANCH_FILES.slash),
    ] as const;

    const switchSamples: Array<{ target: string; durationMs: number }> = [];
    for (let round = 0; round < 3; round += 1) {
      for (const target of targets) {
        const startTime = Date.now();
        await page.goto(target, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        await expect(page.locator("h2").first()).toBeVisible({
          timeout: 10_000,
        });
        const durationMs = Date.now() - startTime;
        switchSamples.push({ target, durationMs });
        expect(durationMs).toBeLessThan(3_000);
      }
    }

    await testInfo.attach("branch-switch-samples", {
      body: JSON.stringify(
        {
          samples: switchSamples,
          beforeUnloadDialogCount,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });

    expect(beforeUnloadDialogCount).toBeLessThanOrEqual(4);
  });
});
