import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(appDir, "public");
const staticLogoSvgPath = path.join(publicDir, "logo-static.svg");
const installIconSvgPath = path.join(publicDir, "install-icon.svg");

const INSTALL_ICON_BACKGROUND_COLOR = "#ffffff";
const STANDARD_ICON_BOX_RATIO = 338 / 512;
const MASKABLE_ICON_BOX_RATIO = 288 / 512;
const APPLE_TOUCH_ICON_BOX_RATIO = 120 / 180;

type IconJob = { boxRatio: number; canvasSize: number; filename: string };

const iconJobs: IconJob[] = [
  {
    boxRatio: STANDARD_ICON_BOX_RATIO,
    canvasSize: 192,
    filename: "icon-192.png",
  },
  {
    boxRatio: STANDARD_ICON_BOX_RATIO,
    canvasSize: 512,
    filename: "icon-512.png",
  },
  {
    boxRatio: MASKABLE_ICON_BOX_RATIO,
    canvasSize: 192,
    filename: "icon-maskable-192.png",
  },
  {
    boxRatio: MASKABLE_ICON_BOX_RATIO,
    canvasSize: 512,
    filename: "icon-maskable-512.png",
  },
  {
    boxRatio: APPLE_TOUCH_ICON_BOX_RATIO,
    canvasSize: 180,
    filename: "apple-touch-icon.png",
  },
];

/**
 * @param {string} staticLogoSvgMarkup
 */
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
 * @param {IconJob} job
 */
function generateIconPng({ boxRatio, canvasSize, filename }: IconJob) {
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
