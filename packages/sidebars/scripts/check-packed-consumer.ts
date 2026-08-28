import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtureRoot = join(packageRoot, "fixtures", "packed-consumer");
const temporaryRoot = mkdtempSync(join(tmpdir(), "samebase-sidebars-packed-consumer-"));
const tarballDirectory = join(temporaryRoot, "tarball");
const consumerRoot = join(temporaryRoot, "consumer");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

type Command = {
  args: string[];
  command: string;
  cwd: string;
};

function run({ args, command, cwd }: Command) {
  execFileSync(command, args, {
    cwd,
    env: {
      ...process.env,
      NODE_PATH: undefined,
    },
    stdio: "inherit",
  });
}

function isWithin(parentPath: string, childPath: string) {
  const childRelativePath = relative(parentPath, childPath);

  return (
    childRelativePath === "" ||
    (!isAbsolute(childRelativePath) &&
      childRelativePath !== ".." &&
      !childRelativePath.startsWith(`..${sep}`))
  );
}

function readPackedFilePaths(packOutput: string) {
  const packResults: unknown = JSON.parse(packOutput);
  if (!Array.isArray(packResults) || packResults.length !== 1) {
    throw new Error("npm pack did not report one package result.");
  }

  const packResult: unknown = packResults[0];
  if (typeof packResult !== "object" || packResult === null || !("files" in packResult)) {
    throw new Error("npm pack did not report package files.");
  }

  const packedFiles: unknown = packResult.files;
  if (!Array.isArray(packedFiles)) {
    throw new Error("npm pack returned an invalid package file list.");
  }

  const packedFilePaths: string[] = [];
  for (const rawPackedFile of packedFiles) {
    const packedFile: unknown = rawPackedFile;
    if (typeof packedFile !== "object" || packedFile === null || !("path" in packedFile)) {
      throw new Error("npm pack returned an invalid package file entry.");
    }

    if (typeof packedFile.path !== "string") {
      throw new Error("npm pack returned a package file without a string path.");
    }

    packedFilePaths.push(packedFile.path);
  }

  return packedFilePaths;
}

try {
  mkdirSync(tarballDirectory);
  const packOutput = execFileSync(
    npmCommand,
    ["pack", "--ignore-scripts", "--json", "--pack-destination", tarballDirectory],
    {
      cwd: packageRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_PATH: undefined,
        npm_config_manage_package_manager_versions: undefined,
      },
    },
  );
  const packedFilePaths = readPackedFilePaths(packOutput);
  const allowedRootFiles = new Set(["package.json", "README.md", "LICENSE.md"]);
  for (const packedFilePath of packedFilePaths) {
    if (
      !allowedRootFiles.has(packedFilePath) &&
      !packedFilePath.startsWith("dist/") &&
      !packedFilePath.startsWith("src/")
    ) {
      throw new Error(`The package tarball contains unexpected file ${packedFilePath}.`);
    }
  }

  for (const requiredPackedFile of [
    "package.json",
    "README.md",
    "LICENSE.md",
    "dist/SidebarLayout.js",
    "dist/structure.css",
    "src/SidebarLayout.tsx",
    "src/structure.css",
  ]) {
    if (!packedFilePaths.includes(requiredPackedFile)) {
      throw new Error(`The package tarball does not contain ${requiredPackedFile}.`);
    }
  }

  const tarballNames = readdirSync(tarballDirectory).filter((name) => name.endsWith(".tgz"));
  if (tarballNames.length !== 1) {
    throw new Error(`Expected one package tarball, found ${tarballNames.length}.`);
  }

  const tarballName = tarballNames[0];
  if (!tarballName) {
    throw new Error("The package tarball name is missing.");
  }

  const tarballPath = join(tarballDirectory, tarballName);
  cpSync(fixtureRoot, consumerRoot, { recursive: true });

  const consumerPackagePath = join(consumerRoot, "package.json");
  const packagePlaceholder = "__SIDEBARS_TARBALL__";
  const consumerPackageTemplate = readFileSync(consumerPackagePath, "utf8");
  if (consumerPackageTemplate.split(packagePlaceholder).length !== 2) {
    throw new Error("The packed consumer package must contain one tarball placeholder.");
  }

  const consumerTarballPath = relative(consumerRoot, tarballPath).split(sep).join("/");
  writeFileSync(
    consumerPackagePath,
    consumerPackageTemplate.replace(packagePlaceholder, `file:${consumerTarballPath}`),
  );

  run({
    args: ["install", "--ignore-scripts"],
    command: pnpmCommand,
    cwd: consumerRoot,
  });

  const consumerLock = readFileSync(join(consumerRoot, "pnpm-lock.yaml"), "utf8");
  if (consumerLock.includes("workspace:") || consumerLock.includes("link:")) {
    throw new Error("The packed consumer lockfile contains a workspace link.");
  }

  const installedPackageLink = join(consumerRoot, "node_modules", "@samebase", "sidebars");
  const installedPackageRoot = realpathSync(installedPackageLink);
  const consumerNodeModulesRoot = realpathSync(join(consumerRoot, "node_modules"));
  if (!isWithin(consumerNodeModulesRoot, installedPackageRoot)) {
    throw new Error("The installed package resolves outside the temporary consumer.");
  }
  if (isWithin(realpathSync(packageRoot), installedPackageRoot)) {
    throw new Error("The temporary consumer resolved the package from the source workspace.");
  }

  for (const packedPath of ["dist", "src", "README.md", "LICENSE.md"]) {
    if (!existsSync(join(installedPackageRoot, packedPath))) {
      throw new Error(`The package tarball does not contain ${packedPath}.`);
    }
  }

  const installedManifestText = readFileSync(join(installedPackageRoot, "package.json"), "utf8");
  if (installedManifestText.includes("workspace:") || installedManifestText.includes("link:")) {
    throw new Error("The installed package manifest contains a workspace link.");
  }

  const installedManifest: unknown = JSON.parse(installedManifestText);
  if (
    typeof installedManifest !== "object" ||
    installedManifest === null ||
    !("name" in installedManifest) ||
    typeof installedManifest.name !== "string" ||
    installedManifest.name !== "@samebase/sidebars" ||
    !("exports" in installedManifest) ||
    typeof installedManifest.exports !== "object" ||
    installedManifest.exports === null ||
    Array.isArray(installedManifest.exports)
  ) {
    throw new Error("The installed package manifest does not contain valid public exports.");
  }

  const installedPackageName = installedManifest.name;
  const publicRuntimeSpecifiers = Object.keys(installedManifest.exports).map((publicSubpath) => {
    if (publicSubpath === ".") {
      return installedPackageName;
    }
    if (!publicSubpath.startsWith("./")) {
      throw new Error(`The installed package contains invalid public subpath ${publicSubpath}.`);
    }

    return `${installedPackageName}/${publicSubpath.slice(2)}`;
  });
  const resolveRuntimeExportsScript = `
const specifiers = JSON.parse(process.argv[1]);
process.stdout.write(
  JSON.stringify(
    specifiers.map((specifier) => ({
      specifier,
      url: import.meta.resolve(specifier),
    })),
  ),
);
`;
  const runtimeResolutionOutput = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      resolveRuntimeExportsScript,
      JSON.stringify(publicRuntimeSpecifiers),
    ],
    {
      cwd: consumerRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_OPTIONS: undefined,
        NODE_PATH: undefined,
      },
    },
  );
  const runtimeResolutions: unknown = JSON.parse(runtimeResolutionOutput);
  if (
    !Array.isArray(runtimeResolutions) ||
    runtimeResolutions.length !== publicRuntimeSpecifiers.length
  ) {
    throw new Error("The external consumer did not resolve every public runtime export.");
  }

  const installedDistRoot = realpathSync(join(installedPackageRoot, "dist"));
  for (const [index, expectedSpecifier] of publicRuntimeSpecifiers.entries()) {
    const runtimeResolution: unknown = runtimeResolutions[index];
    if (
      typeof runtimeResolution !== "object" ||
      runtimeResolution === null ||
      !("specifier" in runtimeResolution) ||
      runtimeResolution.specifier !== expectedSpecifier ||
      !("url" in runtimeResolution) ||
      typeof runtimeResolution.url !== "string"
    ) {
      throw new Error(
        `The external consumer returned an invalid resolution for ${expectedSpecifier}.`,
      );
    }

    const resolvedRuntimePath = realpathSync(fileURLToPath(runtimeResolution.url));
    if (!isWithin(installedDistRoot, resolvedRuntimePath)) {
      throw new Error(
        `The external consumer resolved ${expectedSpecifier} outside the installed dist directory.`,
      );
    }
  }

  const sidebarLayoutModule = readFileSync(
    join(installedPackageRoot, "dist", "SidebarLayout.js"),
    "utf8",
  );
  if (!/^import ["']\.\/structure\.css["'];/mu.test(sidebarLayoutModule)) {
    throw new Error("The compiled layout does not import the stable structural stylesheet.");
  }

  run({ args: ["run", "lint"], command: pnpmCommand, cwd: consumerRoot });
  run({ args: ["run", "typecheck"], command: pnpmCommand, cwd: consumerRoot });
  run({ args: ["run", "build"], command: pnpmCommand, cwd: consumerRoot });

  const consumerDist = join(consumerRoot, "dist");
  const consumerCssPaths = readdirSync(consumerDist, {
    encoding: "utf8",
    recursive: true,
  }).filter((path) => path.endsWith(".css"));
  if (consumerCssPaths.length === 0) {
    throw new Error("The temporary consumer build did not emit structural CSS.");
  }

  process.stdout.write("Packed consumer check passed.\n");
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
