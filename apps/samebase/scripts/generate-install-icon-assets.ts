import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { includes } from "@samebase/dependent/main";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(appDir, "public");

type IconJob = { canvasSize: number; filename: string };
const logoFaceTreatmentValues = ["duotone", "striped"] as const;
type LogoFaceTreatment = (typeof logoFaceTreatmentValues)[number];
type LogoIdentitySvgAsset = {
  assetPath: string;
  markup: string;
};
type LogoAssetModules = {
  createCompactIdentitySvgMarkup: () => string;
  createFaviconCompactIdentitySvgMarkup: () => string;
  createLogoIdentitySvgAssets: () => LogoIdentitySvgAsset[];
  createMaskableCompactIdentitySvgMarkup: () => string;
  createSamebaseSocialCardSvgMarkup: (args: { faceTreatment: LogoFaceTreatment }) => string;
  createSamebaseXProfileBannerSvgMarkup: (args: { faceTreatment: LogoFaceTreatment }) => string;
  defaultLogoFaceTreatment: LogoFaceTreatment;
  logoFaceTreatments: readonly LogoFaceTreatment[];
};
type SocialAsset = {
  brandPath: string;
  createMarkup: (modules: LogoAssetModules, treatment: LogoFaceTreatment) => string;
  rootPath: string;
};

type UnknownFunction = (...args: unknown[]) => unknown;

const faviconIconJobs: IconJob[] = [
  { canvasSize: 16, filename: "favicon.png" },
  { canvasSize: 32, filename: "favicon-32.png" },
];

const compactIdentityIconJobs: IconJob[] = [
  { canvasSize: 180, filename: "apple-touch-icon.png" },
  { canvasSize: 192, filename: "icon-192.png" },
  { canvasSize: 256, filename: "chatgpt-app-icon.png" },
  { canvasSize: 512, filename: "icon-512.png" },
];

const maskableCompactIdentityIconJobs: IconJob[] = [
  { canvasSize: 192, filename: "icon-maskable-192.png" },
  { canvasSize: 512, filename: "icon-maskable-512.png" },
];

const socialAssets: SocialAsset[] = [
  {
    brandPath: "/brand/social/samebase-social-card",
    createMarkup: (modules, faceTreatment) =>
      modules.createSamebaseSocialCardSvgMarkup({ faceTreatment }),
    rootPath: "/samebase-social-card",
  },
  {
    brandPath: "/brand/social/samebase-x-profile-banner",
    createMarkup: (modules, faceTreatment) =>
      modules.createSamebaseXProfileBannerSvgMarkup({ faceTreatment }),
    rootPath: "/samebase-x-profile-banner",
  },
];

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Expected ${label} to be an object.`);
  }

  const record: Record<string, unknown> = {};
  for (const [key, propertyValue] of Object.entries(value)) {
    record[key] = propertyValue;
  }
  return record;
}

// eslint-disable-next-line samebase/no-hand-written-type-predicate -- dynamic-import module shape over unknown: the body witnesses the export only as Function, never its call signature
function isUnknownFunction(value: unknown): value is UnknownFunction {
  return typeof value === "function";
}

function readUnknownFunction(moduleRecord: Record<string, unknown>, exportName: string) {
  const value = moduleRecord[exportName];
  if (!isUnknownFunction(value)) {
    throw new Error(`Expected ${exportName} to be exported as a function.`);
  }

  return value;
}

function readStringResult(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`Expected ${label} to return SVG markup.`);
  }

  return value;
}

function readLogoFaceTreatments(value: unknown): LogoFaceTreatment[] {
  if (!Array.isArray(value)) {
    throw new Error("Expected LOGO_FACE_TREATMENTS to be an array.");
  }

  const treatments: LogoFaceTreatment[] = [];
  for (const treatment of value) {
    if (!includes(logoFaceTreatmentValues, treatment)) {
      throw new Error(`Unexpected logo face treatment: ${String(treatment)}`);
    }
    treatments.push(treatment);
  }
  return treatments;
}

function readLogoIdentitySvgAssetsResult(value: unknown): LogoIdentitySvgAsset[] {
  if (!Array.isArray(value)) {
    throw new Error("Expected createLogoIdentitySvgAssets to return an array.");
  }

  const assets: LogoIdentitySvgAsset[] = [];
  for (const item of value) {
    const asset = readRecord(item, "logo identity SVG asset");
    if (typeof asset.assetPath !== "string" || typeof asset.markup !== "string") {
      throw new Error("Expected logo identity SVG asset to include assetPath and markup.");
    }
    assets.push({
      assetPath: asset.assetPath,
      markup: asset.markup,
    });
  }
  return assets;
}

async function loadLogoAssetModules(): Promise<LogoAssetModules> {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    logLevel: "error",
    root: appDir,
    server: {
      middlewareMode: true,
    },
  });

  try {
    const faceTreatmentModule = readRecord(
      await server.ssrLoadModule("/src/components/logo/logoFaceTreatment.ts"),
      "logo face treatment module",
    );
    const compactIdentityModule = readRecord(
      await server.ssrLoadModule("/src/components/compactIdentitySvgAsset.ts"),
      "compact identity SVG asset module",
    );
    const logoStaticModule = readRecord(
      await server.ssrLoadModule("/src/components/logo/logoStaticSvgAsset.ts"),
      "logo static SVG asset module",
    );
    const socialLogoModule = readRecord(
      await server.ssrLoadModule("/src/components/socialLogoAssets.ts"),
      "social logo asset module",
    );
    const defaultLogoFaceTreatment = faceTreatmentModule.DEFAULT_LOGO_FACE_TREATMENT;
    if (!includes(logoFaceTreatmentValues, defaultLogoFaceTreatment)) {
      throw new Error("Expected DEFAULT_LOGO_FACE_TREATMENT to be a logo face treatment.");
    }

    const createCompactIdentitySvgMarkup = readUnknownFunction(
      compactIdentityModule,
      "createCompactIdentitySvgMarkup",
    );
    const createFaviconCompactIdentitySvgMarkup = readUnknownFunction(
      compactIdentityModule,
      "createFaviconCompactIdentitySvgMarkup",
    );
    const createMaskableCompactIdentitySvgMarkup = readUnknownFunction(
      compactIdentityModule,
      "createMaskableCompactIdentitySvgMarkup",
    );
    const createLogoIdentitySvgAssets = readUnknownFunction(
      logoStaticModule,
      "createLogoIdentitySvgAssets",
    );
    const createSamebaseSocialCardSvgMarkup = readUnknownFunction(
      socialLogoModule,
      "createSamebaseSocialCardSvgMarkup",
    );
    const createSamebaseXProfileBannerSvgMarkup = readUnknownFunction(
      socialLogoModule,
      "createSamebaseXProfileBannerSvgMarkup",
    );

    return {
      createCompactIdentitySvgMarkup: () =>
        readStringResult(createCompactIdentitySvgMarkup(), "createCompactIdentitySvgMarkup"),
      createFaviconCompactIdentitySvgMarkup: () =>
        readStringResult(
          createFaviconCompactIdentitySvgMarkup(),
          "createFaviconCompactIdentitySvgMarkup",
        ),
      createLogoIdentitySvgAssets: () =>
        readLogoIdentitySvgAssetsResult(createLogoIdentitySvgAssets()),
      createMaskableCompactIdentitySvgMarkup: () =>
        readStringResult(
          createMaskableCompactIdentitySvgMarkup(),
          "createMaskableCompactIdentitySvgMarkup",
        ),
      createSamebaseSocialCardSvgMarkup: (args) =>
        readStringResult(
          createSamebaseSocialCardSvgMarkup(args),
          "createSamebaseSocialCardSvgMarkup",
        ),
      createSamebaseXProfileBannerSvgMarkup: (args) =>
        readStringResult(
          createSamebaseXProfileBannerSvgMarkup(args),
          "createSamebaseXProfileBannerSvgMarkup",
        ),
      defaultLogoFaceTreatment,
      logoFaceTreatments: readLogoFaceTreatments(faceTreatmentModule.LOGO_FACE_TREATMENTS),
    };
  } finally {
    await server.close();
  }
}

function toPublicPath(assetPath: string): string {
  return path.join(publicDir, assetPath.replace(/^\//, ""));
}

function writeTextAsset(assetPath: string, contents: string): void {
  const filePath = toPublicPath(assetPath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${contents.trim()}\n`, "utf8");
}

function copyTextAsset(sourceAssetPath: string, targetAssetPath: string): void {
  writeTextAsset(targetAssetPath, readFileSync(toPublicPath(sourceAssetPath), "utf8"));
}

function generateIconPng({
  canvasSize,
  inputAssetPath,
  outputAssetPath,
}: IconJob & {
  inputAssetPath: string;
  outputAssetPath: string;
}) {
  const outputPath = toPublicPath(outputAssetPath);
  mkdirSync(path.dirname(outputPath), { recursive: true });

  execFileSync(
    "rsvg-convert",
    [
      toPublicPath(inputAssetPath),
      "--width",
      String(canvasSize),
      "--height",
      String(canvasSize),
      "--output",
      outputPath,
    ],
    { stdio: "inherit" },
  );
}

function generateIconPngFromMarkup({
  canvasSize,
  markup,
  outputAssetPath,
}: IconJob & {
  markup: string;
  outputAssetPath: string;
}) {
  const outputPath = toPublicPath(outputAssetPath);
  mkdirSync(path.dirname(outputPath), { recursive: true });

  execFileSync(
    "rsvg-convert",
    ["--width", String(canvasSize), "--height", String(canvasSize), "--output", outputPath],
    {
      input: markup,
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
}

function generatePngAsset(inputAssetPath: string, outputAssetPath: string): void {
  const outputPath = toPublicPath(outputAssetPath);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  execFileSync("rsvg-convert", [toPublicPath(inputAssetPath), "--output", outputPath], {
    stdio: "inherit",
  });
}

function syncLogoIdentitySvgAssets(modules: LogoAssetModules) {
  for (const asset of modules.createLogoIdentitySvgAssets()) {
    writeTextAsset(asset.assetPath, asset.markup);
  }
}

function syncCompactIdentityAssets(modules: LogoAssetModules) {
  const sourceAssetPath = "/brand/icon/compact-v1.svg";
  const maskableSourceAssetPath = "/brand/icon/compact-v1-maskable.svg";
  writeTextAsset(sourceAssetPath, modules.createCompactIdentitySvgMarkup());
  writeTextAsset(maskableSourceAssetPath, modules.createMaskableCompactIdentitySvgMarkup());
  copyTextAsset(sourceAssetPath, "/samebase-icon.svg");
  copyTextAsset(sourceAssetPath, "/install-icon.svg");

  const faviconMarkup = modules.createFaviconCompactIdentitySvgMarkup();
  for (const job of faviconIconJobs) {
    generateIconPngFromMarkup({
      ...job,
      markup: faviconMarkup,
      outputAssetPath: `/${job.filename}`,
    });
  }
  for (const job of compactIdentityIconJobs) {
    generateIconPng({
      ...job,
      inputAssetPath: sourceAssetPath,
      outputAssetPath: `/${job.filename}`,
    });
  }
  for (const job of maskableCompactIdentityIconJobs) {
    generateIconPng({
      ...job,
      inputAssetPath: maskableSourceAssetPath,
      outputAssetPath: `/${job.filename}`,
    });
  }
}

function syncSocialAssets(modules: LogoAssetModules) {
  for (const asset of socialAssets) {
    for (const faceTreatment of modules.logoFaceTreatments) {
      const brandSvgPath = `${asset.brandPath}-${faceTreatment}.svg`;
      const brandPngPath = `${asset.brandPath}-${faceTreatment}.png`;
      writeTextAsset(brandSvgPath, asset.createMarkup(modules, faceTreatment));
      generatePngAsset(brandSvgPath, brandPngPath);
    }

    copyTextAsset(
      `${asset.brandPath}-${modules.defaultLogoFaceTreatment}.svg`,
      `${asset.rootPath}.svg`,
    );
    generatePngAsset(`${asset.rootPath}.svg`, `${asset.rootPath}.png`);
  }
}

const logoAssetModules = await loadLogoAssetModules();
syncLogoIdentitySvgAssets(logoAssetModules);
syncCompactIdentityAssets(logoAssetModules);
syncSocialAssets(logoAssetModules);
