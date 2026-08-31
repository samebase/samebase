import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const temporaryRoot = mkdtempSync(join(tmpdir(), "samebase-handlers-packed-consumer-"));
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

function readPackResult(packOutput: string) {
  const packResults: unknown = JSON.parse(packOutput);
  if (!Array.isArray(packResults) || packResults.length !== 1) {
    throw new Error("npm pack did not report one package result.");
  }

  const packResult: unknown = packResults[0];
  if (
    typeof packResult !== "object" ||
    packResult === null ||
    !("filename" in packResult) ||
    typeof packResult.filename !== "string" ||
    !("files" in packResult) ||
    !Array.isArray(packResult.files)
  ) {
    throw new Error("npm pack returned an invalid package result.");
  }

  const filePaths: string[] = [];
  for (const packedFile of packResult.files) {
    if (
      typeof packedFile !== "object" ||
      packedFile === null ||
      !("path" in packedFile) ||
      typeof packedFile.path !== "string"
    ) {
      throw new Error("npm pack returned an invalid package file entry.");
    }
    filePaths.push(packedFile.path);
  }

  return { filePaths, filename: packResult.filename };
}

try {
  mkdirSync(tarballDirectory);
  mkdirSync(consumerRoot);

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
  const packResult = readPackResult(packOutput);
  const expectedFiles = [
    "LICENSE.md",
    "README.md",
    "dist/index.d.ts",
    "dist/index.js",
    "package.json",
    "src/index.ts",
  ];
  if (
    packResult.filePaths.length !== expectedFiles.length ||
    expectedFiles.some((path) => !packResult.filePaths.includes(path))
  ) {
    throw new Error(
      `The package tarball contains unexpected files: ${packResult.filePaths.join(", ")}`,
    );
  }

  const tarballPath = join(tarballDirectory, packResult.filename);
  const consumerTarballPath = relative(consumerRoot, tarballPath).split(sep).join("/");
  writeFileSync(
    join(consumerRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "@samebase/handlers-packed-consumer",
        version: "0.0.0",
        private: true,
        type: "module",
        dependencies: {
          "@samebase/handlers": `file:${consumerTarballPath}`,
          convex: "1.45.0",
        },
        devDependencies: {
          "@typescript/native-preview": "7.0.0-dev.20260413.1",
        },
        engines: {
          node: ">=24.11.0",
          pnpm: ">=11.18.0",
        },
        packageManager: "pnpm@11.18.0",
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(consumerRoot, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          allowUnreachableCode: false,
          allowUnusedLabels: false,
          erasableSyntaxOnly: true,
          exactOptionalPropertyTypes: true,
          forceConsistentCasingInFileNames: true,
          isolatedModules: true,
          module: "ESNext",
          moduleDetection: "force",
          moduleResolution: "bundler",
          noEmit: true,
          noFallthroughCasesInSwitch: true,
          noImplicitOverride: true,
          noImplicitReturns: true,
          noPropertyAccessFromIndexSignature: true,
          noUncheckedIndexedAccess: true,
          noUncheckedSideEffectImports: true,
          skipLibCheck: false,
          strict: true,
          target: "ES2020",
          types: [],
          verbatimModuleSyntax: true,
        },
        include: ["consumer.ts"],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(consumerRoot, "consumer.ts"),
    `import {
  defineHandlerCatalog,
  defineHandlerContract,
  projectHandlerMcpTools,
} from "@samebase/handlers";
import { v } from "convex/values";

const result = v.object({ productId: v.id("products") });
const contract = defineHandlerContract({
  id: "create_product",
  access: "admin",
  args: { url: v.string(), name: v.optional(v.string()) },
  returns: result,
  structuredContent: result,
  mcp: {
    title: "Create product",
    name: "products_create",
    description: "Create or return a product.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
    inputDescriptions: {
      url: "Product URL or domain.",
      name: "Optional product name.",
    },
  },
  doc: "Creates one product.",
});

const [tool] = projectHandlerMcpTools(defineHandlerCatalog([contract]));
if (!tool) {
  throw new Error("The packed package did not project the handler.");
}

const exactName: "products_create" = tool.name;
if (exactName !== "products_create" || tool.inputSchema.required?.join(",") !== "url") {
  throw new Error("The packed package returned an invalid MCP tool.");
}
`,
  );

  run({ args: ["install", "--ignore-scripts"], command: pnpmCommand, cwd: consumerRoot });

  const consumerLock = readFileSync(join(consumerRoot, "pnpm-lock.yaml"), "utf8");
  if (consumerLock.includes("workspace:") || consumerLock.includes("link:")) {
    throw new Error("The packed consumer lockfile contains a workspace link.");
  }

  const installedPackageRoot = realpathSync(
    join(consumerRoot, "node_modules", "@samebase", "handlers"),
  );
  const consumerNodeModulesRoot = realpathSync(join(consumerRoot, "node_modules"));
  if (!isWithin(consumerNodeModulesRoot, installedPackageRoot)) {
    throw new Error("The installed package resolves outside the temporary consumer.");
  }
  if (isWithin(realpathSync(packageRoot), installedPackageRoot)) {
    throw new Error("The temporary consumer resolved the package from the source workspace.");
  }

  const installedManifestText = readFileSync(join(installedPackageRoot, "package.json"), "utf8");
  if (installedManifestText.includes("workspace:") || installedManifestText.includes("link:")) {
    throw new Error("The installed package manifest contains a workspace link.");
  }

  const runtimeUrl = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      'process.stdout.write(import.meta.resolve("@samebase/handlers"));',
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
  const installedDistRoot = realpathSync(join(installedPackageRoot, "dist"));
  const runtimePath = realpathSync(fileURLToPath(runtimeUrl));
  if (!isWithin(installedDistRoot, runtimePath)) {
    throw new Error("The external consumer did not resolve the default export from dist.");
  }

  run({
    args: ["exec", "tsgo", "-p", "tsconfig.json", "--pretty", "false"],
    command: pnpmCommand,
    cwd: consumerRoot,
  });
  run({ args: ["consumer.ts"], command: process.execPath, cwd: consumerRoot });

  process.stdout.write("Packed consumer check passed.\n");
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
