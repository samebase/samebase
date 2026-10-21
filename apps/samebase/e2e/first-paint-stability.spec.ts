import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { readEnvFileValue } from "../browserConvexProxy";
import {
  applyOrganizationContextAcceptanceFixture,
  createOrganizationContextAcceptanceAccount,
} from "./organizationContextAcceptance";
import { VISUAL_FIXTURE_WORKSPACE_SIDEBAR_STATE } from "./visualFixtureTest";
import { saveWorkspaceSidebarState } from "./workspaceSidebarState";

/*
A page must not jump while it loads: every pixel that a painted frame shows, from the first paint
on, must look the same once the page has settled. Content may still appear where a frame showed only
the page background (the right pane once its markup arrives, an image in its reserved box), because
that moves nothing. Every frame counts, not only the first: while the browser parses the page, the
right pane's first content can paint after the first frame.

The pages load from the site that the local Convex backend serves, the server bundle that production
runs, not from the Vite preview. A proxy in front of it sends HTML documents in small chunks with a
pause between them, so the browser paints the page while it parses it, as it does on a slow network:
throttling the whole network in Chromium also delays the stylesheet, and the first paint then waits
for the full document.
*/

const LOCAL_ENV_PATH = fileURLToPath(new URL("../.env.local", import.meta.url));
const DOCUMENT_CHUNK_BYTES = 16_384;
const DOCUMENT_CHUNK_PAUSE_MS = 100;
const SETTLE_MS = 3_000;
// Around hydration, the browser on macOS can raster a few glyphs differently for a single frame,
// which moves nothing. A later frame counts when it stays on screen this long (three frames at 60 Hz).
const MIN_FRAME_ON_SCREEN_MS = 50;
const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const PHONE_VIEWPORT = { width: 375, height: 812 };
// The landing hero's 3D logo replaces its static image once WebGL renders.
const MASKED_SELECTORS = ['[data-testid="landing-preview-hero-menger"]'];

type Rect = { x: number; y: number; width: number; height: number };
type Frame = { pageTimeMs: number; png: Buffer };

let proxyOrigin = "";
let proxyServer: http.Server | null = null;

function readSiteOrigin() {
  const siteOrigin = readEnvFileValue(LOCAL_ENV_PATH, "VITE_CONVEX_SITE_URL");
  if (!siteOrigin) {
    throw new Error(`The local Convex site URL is missing from ${LOCAL_ENV_PATH}.`);
  }
  return siteOrigin;
}

/** Forwards a request to the site and sends an HTML response in chunks. */
async function forwardInChunks(
  siteOrigin: string,
  request: http.IncomingMessage,
  response: http.ServerResponse,
) {
  const body: Buffer[] = [];
  for await (const chunk of request) {
    body.push(Buffer.from(chunk));
  }
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined && name !== "host" && name !== "accept-encoding") {
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
  }
  // The site's session routes accept requests from their own origin only.
  if (headers.has("origin")) {
    headers.set("origin", siteOrigin);
  }
  const upstream = await fetch(`${siteOrigin}${request.url ?? "/"}`, {
    body: body.length > 0 ? Buffer.concat(body) : undefined,
    headers,
    method: request.method,
    redirect: "manual",
  });
  const responseHeaders: Record<string, string | string[]> = {};
  upstream.headers.forEach((value, name) => {
    if (!["content-encoding", "content-length", "set-cookie"].includes(name)) {
      responseHeaders[name] = value;
    }
  });
  responseHeaders["set-cookie"] = upstream.headers.getSetCookie();
  response.writeHead(upstream.status, responseHeaders);
  const content = Buffer.from(await upstream.arrayBuffer());
  if (!(upstream.headers.get("content-type") ?? "").includes("text/html")) {
    response.end(content);
    return;
  }
  for (let offset = 0; offset < content.length; offset += DOCUMENT_CHUNK_BYTES) {
    response.write(content.subarray(offset, offset + DOCUMENT_CHUNK_BYTES));
    await new Promise((resolve) => setTimeout(resolve, DOCUMENT_CHUNK_PAUSE_MS));
  }
  response.end();
}

/** A proxy in front of the site that sends HTML documents in chunks. */
function startChunkingProxy(siteOrigin: string) {
  const server = http.createServer((request, response) => {
    void forwardInChunks(siteOrigin, request, response);
  });

  return new Promise<http.Server>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

test.beforeAll(async () => {
  proxyServer = await startChunkingProxy(readSiteOrigin());
  const address: AddressInfo | string | null = proxyServer.address();
  if (address === null || typeof address === "string") {
    throw new Error("The chunking proxy has no TCP address.");
  }
  proxyOrigin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => proxyServer?.close(resolve));
});

/** Loads the page through the proxy and returns the frames from the first paint to the settled frame. */
async function captureLoad(page: Page, path: string) {
  const cdp = await page.context().newCDPSession(page);
  const frames: { timestampMs: number; png: Buffer }[] = [];
  cdp.on("Page.screencastFrame", (event) => {
    frames.push({
      timestampMs: (event.metadata.timestamp ?? 0) * 1000,
      png: Buffer.from(event.data, "base64"),
    });
    void cdp.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => {});
  });
  // The landing page embeds YouTube videos. Their documents are YouTube's pixels, not the page's,
  // and the test must not depend on YouTube: an empty document leaves each reserved box blank.
  await page.route("https://www.youtube-nocookie.com/**", (route) =>
    route.fulfill({ body: "", contentType: "text/html" }),
  );
  await page.goto("about:blank");
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
  await page.goto(`${proxyOrigin}${path}`, { waitUntil: "load" });
  await page.waitForTimeout(SETTLE_MS);
  await cdp.send("Page.stopScreencast");
  await cdp.detach();

  const timing = await page.evaluate(() => ({
    firstPaintMs: performance.getEntriesByName("first-paint")[0]?.startTime ?? 0,
    timeOriginMs: performance.timeOrigin,
  }));
  const pageFrames: Frame[] = frames.map((frame) => ({
    pageTimeMs: frame.timestampMs - timing.timeOriginMs,
    png: frame.png,
  }));
  // The frame of the first paint can carry a timestamp a little before the first-paint entry, so the
  // frames start at the last one at or before that entry: the first paint, or a blank frame.
  const painted = pageFrames.slice(
    Math.max(
      0,
      pageFrames.findLastIndex((frame) => frame.pageTimeMs <= timing.firstPaintMs),
    ),
  );
  const settled = painted.at(-1);
  if (!settled) {
    throw new Error(`No frames after the navigation; first paint at ${timing.firstPaintMs} ms.`);
  }

  const layout = await page.evaluate((maskedSelectors) => {
    const rectOf = (element: Element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      background: getComputedStyle(document.body).backgroundColor,
      masks: maskedSelectors.flatMap((selector) =>
        [...document.querySelectorAll(selector)].map(rectOf),
      ),
      regions: [
        ...[...document.querySelectorAll('[data-sidebar-layout-part="address-chrome"]')].map(
          (element) => ({ name: "address chrome", rect: rectOf(element) }),
        ),
        ...[...document.querySelectorAll('[data-sidebar-layout-part="pane"]')].map((element) => ({
          name: `${element.getAttribute("data-pane-side") ?? "?"} pane`,
          rect: rectOf(element),
        })),
      ],
    };
  }, MASKED_SELECTORS);

  return { layout, painted: painted.slice(0, -1), settled };
}

function parseRgb(color: string): [number, number, number] {
  const match = /rgba?\((\d+), (\d+), (\d+)/.exec(color);
  if (!match) {
    throw new Error(`Unexpected background color ${color}.`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function inside(rect: Rect, x: number, y: number) {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

/**
The pixels that a frame painted with content and that look different once settled, with the region
of each, and a diff image that marks them red.
*/
function findMovedPixels({
  background,
  frame,
  masks,
  regions,
  settled,
}: {
  background: [number, number, number];
  frame: PNG;
  masks: Rect[];
  regions: { name: string; rect: Rect }[];
  settled: PNG;
}) {
  const changes = new Map<string, { count: number; box: Rect }>();
  const diff = new PNG({ width: frame.width, height: frame.height });
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const i = (y * frame.width + x) * 4;
      const framePixel = [frame.data[i], frame.data[i + 1], frame.data[i + 2]];
      const settledPixel = [settled.data[i], settled.data[i + 1], settled.data[i + 2]];
      const frameIsBackground = framePixel.every(
        (value, channel) => Math.abs(value - background[channel]) <= 2,
      );
      const changed = framePixel.some(
        (value, channel) => Math.abs(value - settledPixel[channel]) > 2,
      );
      const moved = changed && !frameIsBackground && !masks.some((mask) => inside(mask, x, y));
      diff.data.set(moved ? [255, 0, 0, 255] : [...settledPixel, 64], i);
      if (!moved) {
        continue;
      }
      const name = regions.find((region) => inside(region.rect, x, y))?.name ?? "page";
      const entry = changes.get(name);
      if (!entry) {
        changes.set(name, { count: 1, box: { x, y, width: 1, height: 1 } });
        continue;
      }
      entry.count += 1;
      const right = Math.max(entry.box.x + entry.box.width, x + 1);
      const bottom = Math.max(entry.box.y + entry.box.height, y + 1);
      entry.box.x = Math.min(entry.box.x, x);
      entry.box.y = Math.min(entry.box.y, y);
      entry.box.width = right - entry.box.x;
      entry.box.height = bottom - entry.box.y;
    }
  }
  return { changes, diff };
}

/**
Fails with one line for each painted frame whose moved pixels differ from the previous frame's, and
attaches the first such frame with its diff. The first painted frame always counts.
*/
async function expectNoJump(page: Page, path: string) {
  const { layout, painted, settled } = await captureLoad(page, path);
  const settledPng = PNG.sync.read(settled.png);
  const background = parseRgb(layout.background);
  const failures: string[] = [];
  const distinct = painted.filter(
    (frame, index) => index === 0 || !frame.png.equals(painted[index - 1].png),
  );
  let previousReport = "";
  for (const [index, frame] of distinct.entries()) {
    const replacedAtMs = (distinct[index + 1] ?? settled).pageTimeMs;
    if (index > 0 && replacedAtMs - frame.pageTimeMs < MIN_FRAME_ON_SCREEN_MS) {
      continue;
    }
    const framePng = PNG.sync.read(frame.png);
    expect([framePng.width, framePng.height]).toEqual([settledPng.width, settledPng.height]);
    const { changes, diff } = findMovedPixels({
      background,
      frame: framePng,
      masks: layout.masks,
      regions: layout.regions,
      settled: settledPng,
    });
    const report = [...changes]
      .map(
        ([name, { count, box }]) =>
          `${name}: ${count} pixels changed in x=${box.x} y=${box.y} ${box.width}x${box.height}`,
      )
      .join("; ");
    if (report.length > 0 && failures.length === 0) {
      for (const [name, body] of [
        ["painted-frame.png", frame.png],
        ["settled-frame.png", settled.png],
        ["moved-pixels.png", PNG.sync.write(diff)],
      ] as const) {
        const filePath = test.info().outputPath(name);
        writeFileSync(filePath, body);
        await test.info().attach(name, { contentType: "image/png", path: filePath });
      }
    }
    if (report.length > 0 && report !== previousReport) {
      failures.push(`${Math.round(frame.pageTimeMs)} ms: ${report}`);
    }
    previousReport = report;
  }
  expect(
    failures,
    `${path}: painted frames differ from the settled frame at ${Math.round(settled.pageTimeMs)} ms`,
  ).toEqual([]);
}

/** A signed-up, approved account of its own, with a 360 px right sidebar saved in Convex. */
async function signedInContext(browser: Browser, viewport: { width: number; height: number }) {
  const setupContext = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
  const setupPage = await setupContext.newPage();
  const email = `first-paint-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  await createOrganizationContextAcceptanceAccount(setupPage, email);
  await applyOrganizationContextAcceptanceFixture({ email, organizations: [] });
  await saveWorkspaceSidebarState(setupPage, {
    ...VISUAL_FIXTURE_WORKSPACE_SIDEBAR_STATE,
    rightDesktopOpen: true,
    rightDesktopWidthPx: 360,
  });
  const storageState = await setupContext.storageState();
  await setupContext.close();
  return browser.newContext({ storageState, viewport });
}

async function withContext(
  context: BrowserContext,
  run: (page: Page) => Promise<void>,
): Promise<void> {
  try {
    await run(await context.newPage());
  } finally {
    await context.close();
  }
}

test("the signed-out landing page does not jump on a desktop", async ({ browser }) => {
  await withContext(await browser.newContext({ viewport: DESKTOP_VIEWPORT }), (page) =>
    expectNoJump(page, "/"),
  );
});

test("the signed-out landing page does not jump on a phone", async ({ browser }) => {
  await withContext(await browser.newContext({ viewport: PHONE_VIEWPORT }), (page) =>
    expectNoJump(page, "/"),
  );
});

test("the signed-out agent connect page does not jump on a desktop", async ({ browser }) => {
  await withContext(await browser.newContext({ viewport: DESKTOP_VIEWPORT }), (page) =>
    expectNoJump(page, "/agents/connect"),
  );
});

test("the signed-in dashboard with a saved width does not jump on a desktop", async ({
  browser,
}) => {
  await withContext(await signedInContext(browser, DESKTOP_VIEWPORT), (page) =>
    expectNoJump(page, "/repo"),
  );
});

test("the signed-in dashboard with a saved width does not jump on a phone", async ({ browser }) => {
  await withContext(await signedInContext(browser, PHONE_VIEWPORT), (page) =>
    expectNoJump(page, "/repo"),
  );
});
