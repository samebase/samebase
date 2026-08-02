/// <reference lib="dom" />

import { chromium, type Page } from "@playwright/test";
import fs from "node:fs/promises";

type ParsedArgs = Record<string, string | undefined>;

type ScreenPoint = {
  x: number;
  y: number;
};

type WindowFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LandingPageCoords = {
  page: ScreenPoint;
};

type LandingCoords = {
  github: LandingPageCoords;
  convex: LandingPageCoords;
  cloudflare: LandingPageCoords;
  codex: LandingPageCoords;
  tabs: {
    github: ScreenPoint;
    convex: ScreenPoint;
    cloudflare: ScreenPoint;
    codex: ScreenPoint;
  };
  windowFrame: WindowFrame;
};

type LaunchChromeLandingTabsOptions = {
  profileDir: string;
  readyFile: string;
  coordsFile: string;
  githubUrl: string;
  convexUrl: string;
  cloudflareUrl: string;
  codexUrl: string;
  holdOpenSeconds: number;
};

function parseArgs(argv: string[]): ParsedArgs {
  const values: ParsedArgs = {};

  for (let index = 0; index < argv.length;) {
    const key = argv.at(index);

    if (key === "--") {
      index += 1;
      continue;
    }

    const value = argv.at(index + 1);
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument pair near: ${key ?? "<end>"}`);
    }

    values[key.slice(2)] = value;
    index += 2;
  }

  return values;
}

function parseLaunchOptions(argv: string[]): LaunchChromeLandingTabsOptions {
  const args = parseArgs(argv);
  const profileDir = args["profile-dir"];
  const readyFile = args["ready-file"];
  const coordsFile = args["coords-file"];
  const githubUrl = args["github-url"];
  const convexUrl = args["convex-url"];
  const cloudflareUrl = args["cloudflare-url"];
  const codexUrl = args["codex-url"];
  const holdOpenSeconds = Number(args["hold-open-seconds"] ?? "18");

  if (
    !profileDir ||
    !readyFile ||
    !coordsFile ||
    !githubUrl ||
    !convexUrl ||
    !cloudflareUrl ||
    !codexUrl
  ) {
    throw new Error("Missing required arguments.");
  }

  if (Number.isNaN(holdOpenSeconds) || holdOpenSeconds <= 0) {
    throw new Error(
      `Invalid --hold-open-seconds value: ${args["hold-open-seconds"] ?? "<missing>"}`,
    );
  }

  return {
    profileDir,
    readyFile,
    coordsFile,
    githubUrl,
    convexUrl,
    cloudflareUrl,
    codexUrl,
    holdOpenSeconds,
  };
}

async function measurePage(page: Page) {
  await page.waitForLoadState("domcontentloaded");

  return page.evaluate(() => {
    // Compensate for browser chrome so the exported points stay inside the
    // rendered page instead of drifting into tab or toolbar hit targets.
    const chromeX = Math.max((window.outerWidth - window.innerWidth) / 2, 0);
    const chromeY = Math.max(window.outerHeight - window.innerHeight - chromeX, 0);
    // Convert page-relative coordinates into global screen points for the
    // native cursor driver, which only understands absolute screen positions.
    const toScreenPoint = (left: number, top: number): ScreenPoint => ({
      x: Math.round(window.screenX + chromeX + left),
      y: Math.round(window.screenY + chromeY + top),
    });

    const innerWidth = window.innerWidth;
    const innerHeight = window.innerHeight;

    return {
      page: toScreenPoint(
        // Keep the page click target visually right-of-center while clamping it
        // away from the window edges so safety checks never target browser UI.
        Math.min(Math.max(innerWidth * 0.82, 540), innerWidth - 96),
        Math.min(Math.max(innerHeight * 0.36, 210), innerHeight - 150),
      ),
      windowFrame: {
        x: Math.round(window.screenX),
        y: Math.round(window.screenY),
        width: Math.round(window.outerWidth),
        height: Math.round(window.outerHeight),
      },
    };
  });
}

async function measureTabCenters(page: Page) {
  return page.evaluate(() => {
    const chromeX = Math.max((window.outerWidth - window.innerWidth) / 2, 0);
    const chromeY = Math.max(window.outerHeight - window.innerHeight - chromeX, 0);
    const screenX = window.screenX;
    const screenY = window.screenY;
    // Leave enough leading/trailing inset to avoid the window controls on the
    // left and the profile/extensions area on the right.
    const leftInset = Math.max(chromeX + 126, 164);
    const rightInset = 176;
    // Keep the four target tabs inside the center tab strip instead of letting
    // narrow windows collapse the click targets into unpredictable chrome.
    const availableWidth = Math.max(window.outerWidth - leftInset - rightInset, 560);
    const tabWidth = availableWidth / 4;
    // Bias the Y target into the vertical middle of the tab strip while staying
    // away from the toolbar boundary on compact window chrome.
    const tabCenterY = Math.round(screenY + Math.max(Math.min(chromeY * 0.38, 28), 16));
    const centerAt = (index: number): ScreenPoint => ({
      x: Math.round(screenX + leftInset + tabWidth * (index + 0.5)),
      y: tabCenterY,
    });

    return {
      github: centerAt(0),
      convex: centerAt(1),
      cloudflare: centerAt(2),
      codex: centerAt(3),
    };
  });
}

export async function main(argv: string[]) {
  const options = parseLaunchOptions(argv);
  const context = await chromium.launchPersistentContext(options.profileDir, {
    channel: "chrome",
    chromiumSandbox: true,
    headless: false,
    viewport: null,
    // Branded Chrome shows the automation infobar for the default Playwright
    // switch, which wastes vertical tutorial space in the recorded scene.
    ignoreDefaultArgs: ["--enable-automation"],
    args: [
      "--window-size=980,720",
      "--window-position=120,84",
      "--no-first-run",
      "--disable-default-browser-check",
    ],
  });

  try {
    const githubPage = context.pages()[0] ?? (await context.newPage());
    await githubPage.goto(options.githubUrl, { waitUntil: "load" });

    const convexPage = await context.newPage();
    await convexPage.goto(options.convexUrl, { waitUntil: "load" });

    const cloudflarePage = await context.newPage();
    await cloudflarePage.goto(options.cloudflareUrl, { waitUntil: "load" });

    const codexPage = await context.newPage();
    await codexPage.goto(options.codexUrl, { waitUntil: "load" });

    const githubCoords = await measurePage(githubPage);
    const convexCoords = await measurePage(convexPage);
    const cloudflareCoords = await measurePage(cloudflarePage);
    const codexCoords = await measurePage(codexPage);
    const tabCoords = await measureTabCenters(githubPage);

    const coords: LandingCoords = {
      github: {
        page: githubCoords.page,
      },
      convex: {
        page: convexCoords.page,
      },
      cloudflare: {
        page: cloudflareCoords.page,
      },
      codex: {
        page: codexCoords.page,
      },
      tabs: tabCoords,
      windowFrame: githubCoords.windowFrame,
    };

    await fs.writeFile(options.coordsFile, JSON.stringify(coords, null, 2));
    await codexPage.bringToFront();
    await fs.writeFile(options.readyFile, "ready\n");
    await githubPage.waitForTimeout(options.holdOpenSeconds * 1000);
  } finally {
    await context.close();
  }
}

await main(process.argv.slice(2));
