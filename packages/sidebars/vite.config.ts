import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: ["dist/**", "node_modules/**"],
    printWidth: 100,
    proseWrap: "always",
  },
  lint: {
    env: {
      browser: true,
      builtin: true,
    },
    ignorePatterns: ["dist/**", "node_modules/**"],
    options: {
      typeAware: true,
    },
    plugins: ["eslint", "typescript", "react"],
  },
  pack: {
    clean: true,
    css: {
      fileName: "structure.css",
      inject: true,
    },
    deps: {
      neverBundle: true,
      onlyImport: ["@tanstack/react-store", "react"],
    },
    attw: {
      profile: "esm-only",
    },
    dts: true,
    entry: {
      PaneFrame: "src/PaneFrame.tsx",
      SidebarLayout: "src/SidebarLayout.tsx",
      SidebarLayoutGeometryPublic: "src/SidebarLayoutGeometryPublic.ts",
      SidebarLayoutPrehydration: "src/SidebarLayoutPrehydration.ts",
      SidebarLayoutState: "src/SidebarLayoutState.ts",
      SidebarLayoutTesting: "src/SidebarLayoutTesting.tsx",
      SidebarRuntimePublic: "src/SidebarRuntimePublic.ts",
    },
    failOnWarn: true,
    format: "esm",
    platform: "neutral",
    publint: true,
    target: "es2020",
  },
});
