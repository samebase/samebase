import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(appDir, "public");
const staticLogoSvgPath = path.join(publicDir, "logo-static.svg");
const installIconSvgPath = path.join(publicDir, "install-icon.svg");

const INSTALL_ICON_BACKGROUND_COLOR = "#ffffff";
type IconJob = { canvasSize: number; filename: string };

const iconJobs: IconJob[] = [
  {
    canvasSize: 192,
    filename: "icon-192.png",
  },
  {
    canvasSize: 512,
    filename: "icon-512.png",
  },
  {
    canvasSize: 192,
    filename: "icon-maskable-192.png",
  },
  {
    canvasSize: 512,
    filename: "icon-maskable-512.png",
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
 * Render the install icon at the target output size without adding export-time
 * padding so the committed PNGs preserve only the framing already present in
 * the canonical SVG logo markup.
 */
function generateIconPng({ canvasSize, filename }: IconJob) {
  execFileSync(
    "convert",
    [
      installIconSvgPath,
      "-resize",
      `${canvasSize}x${canvasSize}`,
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
