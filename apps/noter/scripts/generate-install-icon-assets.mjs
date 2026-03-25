import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(appDir, "public");
const installIconSvgPath = path.join(publicDir, "install-icon.svg");

const STANDARD_ICON_BOX_RATIO = 338 / 512;
const MASKABLE_ICON_BOX_RATIO = 288 / 512;
const APPLE_TOUCH_ICON_BOX_RATIO = 120 / 180;

const iconJobs = [
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

function generateIconPng({ boxRatio, canvasSize, filename }) {
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
      path.join(publicDir, filename),
    ],
    { stdio: "inherit" },
  );
}

for (const job of iconJobs) {
  generateIconPng(job);
}
