import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(appDir, "public");
const staticLogoSvgPath = path.join(publicDir, "logo-static.svg");
const installIconSvgPath = path.join(publicDir, "install-icon.svg");

const INSTALL_ICON_BACKGROUND_COLOR = "#ffffff";
// Chrome can install either a browser-badged shortcut or a WebAPK. Keep both
// Android-facing icon exports inside the same safe inset so launcher crops do
// not make the mark feel zoomed in.
const ANDROID_HOME_SCREEN_ICON_BOX_RATIO = 464 / 512;

type IconJob = { boxRatio?: number; canvasSize: number; filename: string };

const iconJobs: IconJob[] = [
  {
    canvasSize: 192,
    filename: "icon-192.png",
    boxRatio: ANDROID_HOME_SCREEN_ICON_BOX_RATIO,
  },
  {
    canvasSize: 512,
    filename: "icon-512.png",
    boxRatio: ANDROID_HOME_SCREEN_ICON_BOX_RATIO,
  },
  {
    canvasSize: 192,
    filename: "icon-maskable-192.png",
    boxRatio: ANDROID_HOME_SCREEN_ICON_BOX_RATIO,
  },
  {
    canvasSize: 512,
    filename: "icon-maskable-512.png",
    boxRatio: ANDROID_HOME_SCREEN_ICON_BOX_RATIO,
  },
  {
    canvasSize: 180,
    filename: "apple-touch-icon.png",
  },
];

function createInstallIconSvgMarkup(staticLogoSvgMarkup: string) {
  return staticLogoSvgMarkup.replace(
    'fill="transparent"',
    `fill="${INSTALL_ICON_BACKGROUND_COLOR}"`,
  );
}

function syncInstallIconSvgAsset() {
  const nextInstallIconSvgMarkup = createInstallIconSvgMarkup(
    readFileSync(staticLogoSvgPath, "utf8").trim(),
  );
  const currentInstallIconSvgMarkup = (() => {
    try {
      return readFileSync(installIconSvgPath, "utf8").trim();
    } catch {
      return null;
    }
  })();

  if (currentInstallIconSvgMarkup === nextInstallIconSvgMarkup) {
    return;
  }

  writeFileSync(installIconSvgPath, `${nextInstallIconSvgMarkup}\n`, "utf8");
}

/**
 * Preserve the canonical SVG framing unless a specific install surface needs a
 * small export-time inset to stay inside Android launcher bounds.
 */
function generateIconPng({ boxRatio = 1, canvasSize, filename }: IconJob) {
  const iconSize = Math.round(canvasSize * boxRatio);

  execFileSync(
    "convert",
    [
      installIconSvgPath,
      "-resize",
      `${iconSize}x${iconSize}`,
      "-background",
      "white",
      "-gravity",
      "center",
      "-extent",
      `${canvasSize}x${canvasSize}`,
      "-strip",
      path.join(publicDir, filename),
    ],
    { stdio: "inherit" },
  );
}

syncInstallIconSvgAsset();

for (const job of iconJobs) {
  generateIconPng(job);
}
