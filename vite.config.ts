import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";
import { readPackageVersion } from "./scripts/readPackageVersion.js";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const daytonaSdkVersion = readPackageVersion(
  "@daytonaio/sdk",
  new URL("./apps/noter/package.json", import.meta.url),
);

export default defineConfig({
  define: {
    __DAYTONA_SDK_VERSION__: JSON.stringify(daytonaSdkVersion),
  },
  fmt: {
    printWidth: 80,
    proseWrap: "always",
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./apps/noter/src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: [
      "scripts/**/*.test.js",
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx",
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx",
    ],
    exclude: ["**/node_modules/**", "dist", "dev-dist"],
  },
});
